"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionMode,
  ConnectionLineType,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useReactFlow } from "@xyflow/react"
import type { Connection, EdgeChange, NodeChange, OnReconnect } from "@xyflow/react"
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodeData,
  EdgeRelationshipType,
  NodeShape,
} from "@/types/canvas"
import { NODE_COLORS } from "@/types/canvas"
import { CanvasNodeComponent } from "@/components/editor/canvas/canvas-node"
import { CanvasEdgeComponent } from "@/components/editor/canvas/canvas-edge"
import { ShapePanel } from "@/components/editor/canvas/shape-panel"
import { CanvasControls } from "@/components/editor/canvas/canvas-controls"
import { SemanticInspector } from "@/components/editor/canvas/semantic-inspector"
import { PresenceCursors } from "@/components/editor/canvas/presence-cursors"
import { CollaboratorAvatars } from "@/components/editor/canvas/collaborator-avatars"
import { CanvasMutationProvider } from "@/components/editor/canvas/canvas-mutation-context"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import type { CanvasTemplate } from "@/components/editor/starter-templates"
import { useCanvasAutosave, type SaveStatus } from "@/hooks/use-canvas-autosave"
import { useRealtimeRoom } from "@/hooks/use-realtime-room"
import { getUserColor } from "@/lib/user-color"
import { useCurrentUser } from "@/hooks/use-current-user"
import type { CanvasSnapshot } from "@/lib/canvas/canvas-state"
import {
  normalizeSemanticScanState,
  validateCanvasSemantics,
  type SemanticScanState,
} from "@/lib/canvas/semantic-validation"
import { baseNodeData } from "@/lib/canvas/semantic-defaults"
import { ROOT_GRAPH_ID } from "@/lib/canvas/graph-ids"

const nodeTypes = { canvasNode: CanvasNodeComponent }
const edgeTypes = { canvasEdge: CanvasEdgeComponent }

const CONNECTION_LINE_STYLE: React.CSSProperties = {
  stroke: "rgba(255,255,255,0.4)",
  strokeWidth: 1.5,
  strokeLinecap: "round",
}

const STACKED_CANVAS_CHROME_WIDTH = 860

let nodeCounter = 0
let edgeCounter = 0

function generateNodeId(shape: string): string {
  return `${shape}-${Date.now()}-${++nodeCounter}`
}

function generateEdgeId(): string {
  return `edge-${Date.now()}-${++edgeCounter}`
}

type NodeSelectionChange = Extract<NodeChange<CanvasNode>, { type: "select" }>
type EdgeSelectionChange = Extract<EdgeChange<CanvasEdge>, { type: "select" }>

interface SelectionBox {
  pointerId: number
  edgeId: string | null
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface SelectionBoxBounds {
  left: number
  top: number
  width: number
  height: number
}

interface CanvasDragPayload {
  shape: NodeShape
  size: { width: number; height: number }
  data?: Partial<CanvasNodeData>
  idPrefix?: string
}

function isNodeSelectionChange(
  change: NodeChange<CanvasNode>
): change is NodeSelectionChange {
  return change.type === "select"
}

function isEdgeSelectionChange(
  change: EdgeChange<CanvasEdge>
): change is EdgeSelectionChange {
  return change.type === "select"
}

function applySelectionChanges<T extends { id: string; selected: boolean }>(
  changes: T[],
  current: Set<string>
) {
  const next = new Set(current)
  for (const change of changes) {
    if (change.selected) {
      next.add(change.id)
    } else {
      next.delete(change.id)
    }
  }
  return next
}

function selectionBoxBounds(box: SelectionBox): SelectionBoxBounds {
  return {
    left: Math.min(box.startX, box.currentX),
    top: Math.min(box.startY, box.currentY),
    width: Math.abs(box.currentX - box.startX),
    height: Math.abs(box.currentY - box.startY),
  }
}

function selectionBoxStyle(box: SelectionBox): React.CSSProperties {
  return selectionBoxBounds(box)
}

function isSelectionPaneTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (!target.closest(".react-flow__pane, .react-flow__edge")) return false

  return !target.closest(
    [
      ".react-flow__node",
      ".react-flow__edgeupdater",
      ".react-flow__edgelabel-renderer",
      ".nodrag",
      ".nopan",
      "button",
      "input",
      "textarea",
      "select",
      "[contenteditable='true']",
    ].join(",")
  )
}

function getEdgeIdFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null

  return target.closest(".react-flow__edge")?.getAttribute("data-id") ?? null
}

function rectsIntersect(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return (
    a.right >= b.left &&
    a.left <= b.right &&
    a.bottom >= b.top &&
    a.top <= b.bottom
  )
}

function expandedElementRect(element: Element, padding = 0) {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - padding,
    bottom: rect.bottom + padding,
  }
}

function localPointerPoint(
  event: React.PointerEvent<HTMLDivElement>,
  element: HTMLElement
) {
  const rect = element.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

interface CanvasEditorProps {
  projectId: string
  graphId: string
  pendingTemplate?: CanvasTemplate | null
  onTemplateImported?: () => void
  onSaveStatusChange?: (status: SaveStatus) => void
  onSaveReady?: (saveFn: () => void) => void
  onSelectedNodeIdsChange?: (nodeIds: string[]) => void
  onSendSemanticFindingToArchitect?: (message: string) => void
}

export function CanvasEditor({
  projectId,
  graphId,
  pendingTemplate,
  onTemplateImported,
  onSaveStatusChange,
  onSaveReady,
  onSelectedNodeIdsChange,
  onSendSemanticFindingToArchitect,
}: CanvasEditorProps) {
  const {
    nodes,
    edges,
    setCanvasSnapshot,
    patchPresence,
    status: realtimeStatus,
    graphTitle,
    graphScopeKind,
    parentGraphId,
    parentNodeId,
    graphLayer,
    graphLayerKind,
    graphSummary,
    graphPanels,
    setGraphPanels,
  } = useRealtimeRoom()
  const router = useRouter()
  const { user } = useCurrentUser()
  const reactFlow = useReactFlow()
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = reactFlow
  const wrapperRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const historyPastRef = useRef<CanvasSnapshot[]>([])
  const historyFutureRef = useRef<CanvasSnapshot[]>([])
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<Set<string>>(
    () => new Set()
  )
  const selectedNodeIdsRef = useRef(selectedNodeIds)
  const selectedEdgeIdsRef = useRef(selectedEdgeIds)
  const selectionBoxRef = useRef<SelectionBox | null>(null)
  const suppressSelectionMouseEventsRef = useRef(false)
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [isCanvasChromeStacked, setIsCanvasChromeStacked] = useState(false)
  const [selectedRelationshipType, setSelectedRelationshipType] =
    useState<EdgeRelationshipType>("calls")
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  })
  const didFitInitialCanvasRef = useRef(false)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
  }, [nodes, edges])

  useEffect(() => {
    selectedNodeIdsRef.current = selectedNodeIds
    selectedEdgeIdsRef.current = selectedEdgeIds
  }, [selectedEdgeIds, selectedNodeIds])

  useEffect(() => {
    onSelectedNodeIdsChange?.([...selectedNodeIds])
  }, [onSelectedNodeIdsChange, selectedNodeIds])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    const target = wrapper

    function updateCanvasChromeLayout() {
      const width = target.getBoundingClientRect().width
      setIsCanvasChromeStacked(width > 0 && width < STACKED_CANVAS_CHROME_WIDTH)
    }

    updateCanvasChromeLayout()
    const resizeObserver = new ResizeObserver(updateCanvasChromeLayout)
    resizeObserver.observe(target)
    window.addEventListener("resize", updateCanvasChromeLayout)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", updateCanvasChromeLayout)
    }
  }, [])

  const displayedNodes = useMemo(
    () =>
      nodes.map((node) => {
        const selected = selectedNodeIds.has(node.id)
        if (node.selected === selected && node.dragging === false) return node
        return { ...node, selected, dragging: false }
      }),
    [nodes, selectedNodeIds]
  )

  const displayedEdges = useMemo(
    () =>
      edges.map((edge) => {
        const selected = selectedEdgeIds.has(edge.id)
        if (edge.selected === selected) return edge
        return { ...edge, selected }
      }),
    [edges, selectedEdgeIds]
  )

  const selectedNode = useMemo(() => {
    if (selectedNodeIds.size !== 1 || selectedEdgeIds.size > 0) return null
    const [nodeId] = [...selectedNodeIds]
    return nodes.find((node) => node.id === nodeId) ?? null
  }, [nodes, selectedEdgeIds.size, selectedNodeIds])

  const selectedEdge = useMemo(() => {
    if (selectedEdgeIds.size !== 1 || selectedNodeIds.size > 0) return null
    const [edgeId] = [...selectedEdgeIds]
    return edges.find((edge) => edge.id === edgeId) ?? null
  }, [edges, selectedEdgeIds, selectedNodeIds.size])

  const semanticWarnings = useMemo(
    () => validateCanvasSemantics({ nodes, edges }),
    [edges, nodes]
  )
  const semanticScanState = useMemo(
    () => normalizeSemanticScanState(graphPanels.semanticScan),
    [graphPanels.semanticScan]
  )
  const updateSemanticScanState = useCallback(
    (nextState: SemanticScanState) => {
      setGraphPanels({ ...graphPanels, semanticScan: nextState })
    },
    [graphPanels, setGraphPanels]
  )

  const publishCanvas = useCallback(
    (nextNodes: CanvasNode[], nextEdges: CanvasEdge[]) => {
      setCanvasSnapshot(
        { nodes: nextNodes, edges: nextEdges },
        { broadcast: true }
      )
    },
    [setCanvasSnapshot]
  )

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyPastRef.current.length > 0,
      canRedo: historyFutureRef.current.length > 0,
    })
  }, [])

  const commitCanvas = useCallback(
    (
      nextNodes: CanvasNode[],
      nextEdges: CanvasEdge[],
      options: { recordHistory?: boolean } = {}
    ) => {
      if (options.recordHistory !== false) {
        historyPastRef.current.push({
          nodes: nodesRef.current,
          edges: edgesRef.current,
        })
        historyFutureRef.current = []
        syncHistoryState()
      }

      publishCanvas(nextNodes, nextEdges)
    },
    [publishCanvas, syncHistoryState]
  )

  useEffect(() => {
    if (didFitInitialCanvasRef.current) return
    if (nodes.length === 0) return
    didFitInitialCanvasRef.current = true
    setTimeout(() => fitView({ duration: 300 }), 120)
  }, [fitView, nodes.length])

  useEffect(() => {
    if (!pendingTemplate) return

    const timeoutId = window.setTimeout(() => {
      commitCanvas(pendingTemplate.nodes, pendingTemplate.edges)
      onTemplateImported?.()
      window.setTimeout(() => fitView({ duration: 300 }), 120)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [commitCanvas, fitView, onTemplateImported, pendingTemplate])

  const { status: saveStatus, save } = useCanvasAutosave(projectId, graphId, nodes, edges, {
    title: graphTitle,
    scopeKind: graphScopeKind,
    parentGraphId,
    parentNodeId,
    layer: graphLayer,
    layerKind: graphLayerKind,
    summary: graphSummary,
    panels: graphPanels,
  })

  useEffect(() => {
    onSaveStatusChange?.(saveStatus)
  }, [saveStatus, onSaveStatusChange])
  useEffect(() => {
    onSaveReady?.(save)
  }, [save, onSaveReady])

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const selectionChanges = changes.filter(isNodeSelectionChange)
      if (selectionChanges.length > 0) {
        setSelectedNodeIds((current) => {
          const next = applySelectionChanges(selectionChanges, current)
          selectedNodeIdsRef.current = next
          return next
        })
      }

      const durableChanges = changes.filter(
        (change) => !isNodeSelectionChange(change)
      )
      if (durableChanges.length === 0) return

      const removedNodeIds = new Set(
        durableChanges
          .filter((change) => change.type === "remove")
          .map((change) => change.id)
      )
      if (removedNodeIds.size > 0) {
        setSelectedNodeIds((current) => {
          const next = new Set(current)
          for (const id of removedNodeIds) next.delete(id)
          selectedNodeIdsRef.current = next
          return next
        })
      }

      const nextNodes = applyNodeChanges(durableChanges, nodesRef.current)
      commitCanvas(nextNodes, edgesRef.current)
    },
    [commitCanvas]
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      const selectionChanges = changes.filter(isEdgeSelectionChange)
      if (selectionChanges.length > 0) {
        setSelectedEdgeIds((current) => {
          const next = applySelectionChanges(selectionChanges, current)
          selectedEdgeIdsRef.current = next
          return next
        })
      }

      const durableChanges = changes.filter(
        (change) => !isEdgeSelectionChange(change)
      )
      if (durableChanges.length === 0) return

      const removedEdgeIds = new Set(
        durableChanges
          .filter((change) => change.type === "remove")
          .map((change) => change.id)
      )
      if (removedEdgeIds.size > 0) {
        setSelectedEdgeIds((current) => {
          const next = new Set(current)
          for (const id of removedEdgeIds) next.delete(id)
          selectedEdgeIdsRef.current = next
          return next
        })
      }

      const normalizedDurableChanges: EdgeChange<CanvasEdge>[] = durableChanges.map(
        (change) => {
          if (change.type !== "replace") return change

          const previousEdge = edgesRef.current.find((edge) => edge.id === change.id)
          return {
            ...change,
            item: {
              ...(previousEdge ?? change.item),
              ...change.item,
              id: change.id,
              type: "canvasEdge",
              data: {
                ...(previousEdge?.data ?? {}),
                ...(change.item.data ?? {}),
              },
            },
          }
        }
      )

      const nextEdges = applyEdgeChanges(normalizedDurableChanges, edgesRef.current)
      commitCanvas(nodesRef.current, nextEdges)
    },
    [commitCanvas]
  )

  const deleteSelection = useCallback(() => {
    const selectedNodeIds = selectedNodeIdsRef.current
    const selectedEdgeIds = selectedEdgeIdsRef.current
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return

    const nextNodes = nodesRef.current.filter((node) => !selectedNodeIds.has(node.id))
    const nextEdges = edgesRef.current.filter(
      (edge) =>
        !selectedEdgeIds.has(edge.id) &&
        !selectedNodeIds.has(edge.source) &&
        !selectedNodeIds.has(edge.target)
    )

    const emptyNodeSelection = new Set<string>()
    const emptyEdgeSelection = new Set<string>()
    selectedNodeIdsRef.current = emptyNodeSelection
    selectedEdgeIdsRef.current = emptyEdgeSelection
    setSelectedNodeIds(emptyNodeSelection)
    setSelectedEdgeIds(emptyEdgeSelection)
    commitCanvas(nextNodes, nextEdges)
  }, [commitCanvas])

  const clearSelection = useCallback(() => {
    const emptyNodeSelection = new Set<string>()
    const emptyEdgeSelection = new Set<string>()
    selectedNodeIdsRef.current = emptyNodeSelection
    selectedEdgeIdsRef.current = emptyEdgeSelection
    setSelectedNodeIds(emptyNodeSelection)
    setSelectedEdgeIds(emptyEdgeSelection)
  }, [])

  const selectItemsInBox = useCallback(
    (box: SelectionBox) => {
      const wrapper = wrapperRef.current
      if (!wrapper) return

      const boxStyle = selectionBoxBounds(box)
      if (boxStyle.width < 4 && boxStyle.height < 4) {
        if (box.edgeId) {
          const nextSelectedEdgeIds = new Set([box.edgeId])
          const emptyNodeSelection = new Set<string>()
          selectedNodeIdsRef.current = emptyNodeSelection
          selectedEdgeIdsRef.current = nextSelectedEdgeIds
          setSelectedNodeIds(emptyNodeSelection)
          setSelectedEdgeIds(nextSelectedEdgeIds)
        } else {
          clearSelection()
        }

        return
      }

      const wrapperRect = wrapper.getBoundingClientRect()
      const selectionRect = {
        left: wrapperRect.left + boxStyle.left,
        top: wrapperRect.top + boxStyle.top,
        right: wrapperRect.left + boxStyle.left + boxStyle.width,
        bottom: wrapperRect.top + boxStyle.top + boxStyle.height,
      }
      const nextSelectedNodeIds = new Set<string>()
      const nextSelectedEdgeIds = new Set<string>()

      for (const element of wrapper.querySelectorAll<HTMLElement>(
        ".react-flow__node"
      )) {
        const nodeId = element.dataset.id
        if (!nodeId) continue

        if (rectsIntersect(expandedElementRect(element), selectionRect)) {
          nextSelectedNodeIds.add(nodeId)
        }
      }

      for (const element of wrapper.querySelectorAll<HTMLElement>(
        ".react-flow__edge"
      )) {
        const edgeId = element.dataset.id
        if (!edgeId) continue

        const candidateElements = [
          element,
          ...Array.from(element.querySelectorAll("path")),
        ]
        const intersects = candidateElements.some((candidate) =>
          rectsIntersect(expandedElementRect(candidate, 10), selectionRect)
        )

        if (intersects) nextSelectedEdgeIds.add(edgeId)
      }

      selectedNodeIdsRef.current = nextSelectedNodeIds
      selectedEdgeIdsRef.current = nextSelectedEdgeIds
      setSelectedNodeIds(nextSelectedNodeIds)
      setSelectedEdgeIds(nextSelectedEdgeIds)
    },
    [clearSelection]
  )

  const onSelectionPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      if (!isSelectionPaneTarget(event.target)) return

      const wrapper = wrapperRef.current
      if (!wrapper) return

      event.preventDefault()
      event.stopPropagation()

      const point = localPointerPoint(event, wrapper)
      const box: SelectionBox = {
        pointerId: event.pointerId,
        edgeId: getEdgeIdFromTarget(event.target),
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      }

      wrapper.setPointerCapture(event.pointerId)
      selectionBoxRef.current = box
      suppressSelectionMouseEventsRef.current = true
      setSelectionBox(box)
      clearSelection()
    },
    [clearSelection]
  )

  const onSelectionPointerMoveCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const currentBox = selectionBoxRef.current
      const wrapper = wrapperRef.current
      if (!currentBox || !wrapper || currentBox.pointerId !== event.pointerId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const point = localPointerPoint(event, wrapper)
      const nextBox = {
        ...currentBox,
        currentX: point.x,
        currentY: point.y,
      }

      selectionBoxRef.current = nextBox
      setSelectionBox(nextBox)
    },
    []
  )

  const onSelectionPointerUpCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const currentBox = selectionBoxRef.current
      const wrapper = wrapperRef.current
      if (!currentBox || !wrapper || currentBox.pointerId !== event.pointerId) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (wrapper.hasPointerCapture(event.pointerId)) {
        wrapper.releasePointerCapture(event.pointerId)
      }

      selectionBoxRef.current = null
      setSelectionBox(null)
      selectItemsInBox(currentBox)
      window.setTimeout(() => {
        suppressSelectionMouseEventsRef.current = false
      }, 0)
    },
    [selectItemsInBox]
  )

  const suppressSelectionMouseEvent = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!selectionBoxRef.current && !suppressSelectionMouseEventsRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    },
    []
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return
      const target = event.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      deleteSelection()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [deleteSelection])

  const currentUserId = user?.id ?? "anonymous"
  const currentUserName = user?.name ?? user?.email ?? "You"
  const currentUserColor = getUserColor(currentUserId)

  const onMouseMove = useCallback(
    (event: React.MouseEvent) => {
      patchPresence({
        cursor: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        name: currentUserName,
        color: currentUserColor,
      })
    },
    [currentUserColor, currentUserName, patchPresence, screenToFlowPosition]
  )

  const onMouseLeave = useCallback(() => {
    patchPresence({ cursor: null })
  }, [patchPresence])

  const undo = useCallback(() => {
    const previous = historyPastRef.current.pop()
    if (!previous) return

    historyFutureRef.current.push({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    })
    syncHistoryState()
    publishCanvas(previous.nodes, previous.edges)
  }, [publishCanvas, syncHistoryState])

  const redo = useCallback(() => {
    const next = historyFutureRef.current.pop()
    if (!next) return

    historyPastRef.current.push({
      nodes: nodesRef.current,
      edges: edgesRef.current,
    })
    syncHistoryState()
    publishCanvas(next.nodes, next.edges)
  }, [publishCanvas, syncHistoryState])

  const { canUndo, canRedo } = historyState

  useKeyboardShortcuts({ reactFlow, undo, redo })

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      const nextEdge: CanvasEdge = {
        id: generateEdgeId(),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: connection.targetHandle ?? null,
        type: "canvasEdge",
        data: {
          semanticType: selectedRelationshipType,
          relationshipType: selectedRelationshipType,
          name: "",
          label: "",
          labels: [],
          labelItems: [],
          status: "draft",
          syncMode:
            selectedRelationshipType === "publishes" ||
            selectedRelationshipType === "consumes" ||
            selectedRelationshipType === "triggers"
              ? "async"
              : "unknown",
          tags: [],
          sourceRefs: [],
          assumptions: [],
          decisionRefs: [],
          owner: null,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "rgba(255,255,255,0.4)",
          width: 16,
          height: 16,
        },
      }

      commitCanvas(nodesRef.current, [...edgesRef.current, nextEdge])
    },
    [commitCanvas, selectedRelationshipType]
  )

  const onReconnect = useCallback<OnReconnect<CanvasEdge>>(
    (oldEdge, newConnection) => {
      if (!newConnection.source || !newConnection.target) return

      const nextEdges = edgesRef.current.map((edge) =>
        edge.id === oldEdge.id
          ? {
              ...edge,
              source: newConnection.source,
              target: newConnection.target,
              sourceHandle: newConnection.sourceHandle,
              targetHandle: newConnection.targetHandle,
            }
          : edge
      )
      commitCanvas(nodesRef.current, nextEdges)
    },
    [commitCanvas]
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const raw = event.dataTransfer.getData("application/arc-forge-shape")
      if (!raw) return

      let payload: CanvasDragPayload
      try {
        payload = JSON.parse(raw) as typeof payload
      } catch {
        return
      }

      const center = screenToFlowPosition({ x: event.clientX, y: event.clientY })
      const position = {
        x: center.x - payload.size.width / 2,
        y: center.y - payload.size.height / 2,
      }

      const newNode: CanvasNode = {
        id: generateNodeId(payload.idPrefix ?? payload.shape),
        type: "canvasNode",
        position,
        data: {
          ...baseNodeData(),
          color: NODE_COLORS[0].fill,
          textColor: NODE_COLORS[0].text,
          shape: payload.shape,
          ...(payload.data ?? {}),
        },
        width: payload.size.width,
        height: payload.size.height,
      }

      commitCanvas([...nodesRef.current, newNode], edgesRef.current)
    },
    [commitCanvas, screenToFlowPosition]
  )

  const openOrCreateSelectedNodeLayer = useCallback(async () => {
    const node = selectedNode
    if (!node) return

    const existingGraphId = node.data.subcanvasRef?.graphId
    if (existingGraphId) {
      router.push(`/editor/${projectId}?graphId=${encodeURIComponent(existingGraphId)}`)
      return
    }

    const response = await fetch(`/api/projects/${projectId}/subcanvas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentGraphId: graphId,
        parentNodeId: node.id,
        title: `${node.data.name || node.data.label || node.id} Layer`,
        summary: node.data.description ?? undefined,
      }),
    })

    if (!response.ok) return
    const data = (await response.json()) as {
      subcanvasRef?: NonNullable<CanvasNodeData["subcanvasRef"]>
    }
    if (!data.subcanvasRef?.graphId) return

    const nextNodes = nodesRef.current.map((item) =>
      item.id === node.id
        ? { ...item, data: { ...item.data, subcanvasRef: data.subcanvasRef } }
        : item
    )
    commitCanvas(nextNodes, edgesRef.current)
    router.push(`/editor/${projectId}?graphId=${encodeURIComponent(data.subcanvasRef.graphId)}`)
  }, [commitCanvas, graphId, projectId, router, selectedNode])

  const mutationContext = useMemo(
    () => ({
      updateNodeData: (nodeId: string, patch: Partial<CanvasNode["data"]>) => {
        const nextNodes = nodesRef.current.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node
        )
        commitCanvas(nextNodes, edgesRef.current)
      },
      updateEdgeData: (edgeId: string, patch: Partial<CanvasEdge["data"]>) => {
        const nextEdges = edgesRef.current.map((edge) =>
          edge.id === edgeId
            ? { ...edge, data: { ...edge.data, ...patch } }
            : edge
        )
        commitCanvas(nodesRef.current, nextEdges)
      },
      deleteNode: (nodeId: string) => {
        const selectedNodeIds = selectedNodeIdsRef.current
        const nodeIdsToDelete = selectedNodeIds.has(nodeId)
          ? selectedNodeIds
          : new Set([nodeId])
        const nextNodes = nodesRef.current.filter(
          (node) => !nodeIdsToDelete.has(node.id)
        )
        const nextEdges = edgesRef.current.filter(
          (edge) =>
            !nodeIdsToDelete.has(edge.source) &&
            !nodeIdsToDelete.has(edge.target)
        )
        const emptyNodeSelection = new Set<string>()
        const emptyEdgeSelection = new Set<string>()
        selectedNodeIdsRef.current = emptyNodeSelection
        selectedEdgeIdsRef.current = emptyEdgeSelection
        setSelectedNodeIds(emptyNodeSelection)
        setSelectedEdgeIds(emptyEdgeSelection)
        commitCanvas(nextNodes, nextEdges)
      },
      deleteEdge: (edgeId: string) => {
        const nextSelectedEdgeIds = new Set(selectedEdgeIdsRef.current)
        nextSelectedEdgeIds.delete(edgeId)
        selectedEdgeIdsRef.current = nextSelectedEdgeIds
        setSelectedEdgeIds(nextSelectedEdgeIds)

        const nextEdges = edgesRef.current.filter((edge) => edge.id !== edgeId)
        commitCanvas(nodesRef.current, nextEdges)
      },
      upsertEdge: (edge: CanvasEdge) => {
        const nextEdges = [
          ...edgesRef.current.filter((existing) => existing.id !== edge.id),
          edge,
        ]
        commitCanvas(nodesRef.current, nextEdges)
      },
    }),
    [commitCanvas]
  )

  return (
    <CanvasMutationProvider value={mutationContext}>
      <div
        ref={wrapperRef}
        className="relative h-full w-full"
        onDragOver={onDragOver}
        onDrop={onDrop}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onPointerDownCapture={onSelectionPointerDownCapture}
        onPointerMoveCapture={onSelectionPointerMoveCapture}
        onPointerUpCapture={onSelectionPointerUpCapture}
        onMouseDownCapture={suppressSelectionMouseEvent}
        onMouseMoveCapture={suppressSelectionMouseEvent}
        onMouseUpCapture={suppressSelectionMouseEvent}
        onClickCapture={suppressSelectionMouseEvent}
      >
        <ReactFlow
          nodes={displayedNodes}
          edges={displayedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onPaneClick={clearSelection}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          connectionLineStyle={CONNECTION_LINE_STYLE}
          connectionLineType={ConnectionLineType.SmoothStep}
          panOnDrag={[1, 2]}
          edgesReconnectable
          reconnectRadius={16}
          deleteKeyCode={null}
          className="bg-bg-base"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color="var(--color-border-subtle)"
          />
        </ReactFlow>
        {selectionBox ? (
          <div
            className="pointer-events-none absolute z-30 rounded border border-accent-primary/60 bg-accent-primary/10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            style={selectionBoxStyle(selectionBox)}
          />
        ) : null}
        <CanvasControls
          onZoomIn={() => zoomIn({ duration: 200 })}
          onZoomOut={() => zoomOut({ duration: 200 })}
          onFitView={() => fitView({ duration: 200 })}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          isStacked={isCanvasChromeStacked}
        />
        <GraphBreadcrumb
          projectId={projectId}
          graphId={graphId}
          graphTitle={graphTitle}
          parentGraphId={parentGraphId}
          onNavigateRoot={() => router.push(`/editor/${projectId}`)}
          onNavigateGraph={(targetGraphId) =>
            router.push(
              targetGraphId === ROOT_GRAPH_ID
                ? `/editor/${projectId}`
                : `/editor/${projectId}?graphId=${encodeURIComponent(targetGraphId)}`
            )
          }
        />
        <EmptySubcanvasGuide
          graphScopeKind={graphScopeKind}
          graphTitle={graphTitle}
          isEmpty={nodes.length === 0 && edges.length === 0}
        />
        <ShapePanel
          graphScopeKind={graphScopeKind}
          isStacked={isCanvasChromeStacked}
          selectedNode={selectedNode}
          selectedRelationshipType={selectedRelationshipType}
          onRelationshipTypeChange={setSelectedRelationshipType}
          onOpenDrilldownLayer={openOrCreateSelectedNodeLayer}
        />
        <SemanticInspector
          projectId={projectId}
          currentGraphId={graphId}
          selectedNode={selectedNode}
          selectedEdge={selectedEdge}
          warnings={semanticWarnings}
          semanticScanState={semanticScanState}
          onSemanticScanStateChange={updateSemanticScanState}
          onSendSemanticFindingToArchitect={onSendSemanticFindingToArchitect}
        />
        <PresenceCursors />
        <CollaboratorAvatars />
        <ConnectionStatus status={realtimeStatus} />
        <SaveStatusIndicator status={saveStatus} />
      </div>
    </CanvasMutationProvider>
  )
}

function GraphBreadcrumb({
  projectId,
  graphId,
  graphTitle,
  parentGraphId,
  onNavigateRoot,
  onNavigateGraph,
}: {
  projectId: string
  graphId: string
  graphTitle: string
  parentGraphId: string | null
  onNavigateRoot: () => void
  onNavigateGraph: (graphId: string) => void
}) {
  const isRoot = graphId === ROOT_GRAPH_ID
  const parentLabel = parentGraphId && parentGraphId !== ROOT_GRAPH_ID ? "parent layer" : "System"

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-30 flex max-w-[min(34rem,calc(100%-2rem))] items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
      {isRoot ? (
        <span className="font-medium text-text-primary">System</span>
      ) : (
        <button
          type="button"
          onClick={() =>
            parentGraphId && parentGraphId !== graphId
              ? onNavigateGraph(parentGraphId)
              : onNavigateRoot()
          }
          aria-label={`Back to ${parentLabel}`}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-xl border border-accent-primary/25 bg-accent-primary/10 px-2.5 font-medium text-text-primary transition-colors hover:border-accent-primary/60 hover:bg-accent-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/45"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
          <span>{`Back to ${parentLabel}`}</span>
        </button>
      )}
      {!isRoot ? (
        <>
          <span className="text-text-faint">/</span>
          {parentGraphId && parentGraphId !== ROOT_GRAPH_ID ? (
            <>
              <button
                type="button"
                onClick={onNavigateRoot}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                System
              </button>
              <span className="text-text-faint">/</span>
            </>
          ) : null}
          <span className="truncate text-text-secondary">{graphTitle}</span>
        </>
      ) : null}
      <span className="sr-only">{projectId}</span>
    </div>
  )
}

function EmptySubcanvasGuide({
  graphScopeKind,
  graphTitle,
  isEmpty,
}: {
  graphScopeKind: string
  graphTitle: string
  isEmpty: boolean
}) {
  if (!isEmpty || graphScopeKind === "system-root") return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
      <div className="max-w-md rounded-2xl border border-border-default bg-bg-surface/90 px-5 py-4 text-center shadow-xl backdrop-blur-xl">
        <p className="text-sm font-medium text-text-primary">{graphTitle}</p>
        <p className="mt-2 text-xs leading-5 text-text-muted">
          Add internal detail for this architecture layer: modules, endpoints,
          entities, workers, events, rules, provider adapters, and policies.
        </p>
      </div>
    </div>
  )
}

function ConnectionStatus({ status }: { status: string }) {
  if (status === "connected") return null

  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 -translate-x-1/2">
      <span className="rounded-full border border-border-default bg-bg-surface/95 px-3 py-1 text-xs text-text-muted shadow-xl backdrop-blur-xl">
        {status === "connecting" ? "Connecting…" : "Realtime disconnected"}
      </span>
    </div>
  )
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") return null
  return (
    <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2">
      <span
        className={
          "rounded-full px-3 py-1 text-xs font-medium " +
          (status === "saving"
            ? "bg-bg-elevated text-text-faint"
            : status === "saved"
              ? "bg-bg-elevated text-text-secondary"
              : "bg-bg-elevated text-red-400")
        }
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed"}
      </span>
    </div>
  )
}

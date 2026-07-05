"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { CanvasNode, CanvasEdge } from "@/types/canvas"

export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function useCanvasAutosave(
  projectId: string,
  graphId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  options: {
    title?: string
    scopeKind?: string
    parentGraphId?: string | null
    parentNodeId?: string | null
    layer?: number | null
    layerKind?: string | null
    summary?: string | null
    panels?: Record<string, unknown>
  } = {}
): { status: SaveStatus; save: () => void } {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMountedRef = useRef(false)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const projectIdRef = useRef(projectId)
  const graphIdRef = useRef(graphId)
  const optionsRef = useRef(options)

  useEffect(() => {
    nodesRef.current = nodes
    edgesRef.current = edges
    projectIdRef.current = projectId
    graphIdRef.current = graphId
    optionsRef.current = options
  })

  // Reset to idle after showing saved/error so the button returns to "Save".
  useEffect(() => {
    if (status !== "saved" && status !== "error") return
    resetTimerRef.current = setTimeout(() => setStatus("idle"), 2000)
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    }
  }, [status])

  const doSave = useCallback(async () => {
    setStatus("saving")
    try {
      const params = new URLSearchParams({ graphId: graphIdRef.current })
      const res = await fetch(`/api/projects/${projectIdRef.current}/canvas?${params}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: nodesRef.current,
          edges: edgesRef.current,
          title: optionsRef.current.title,
          scopeKind: optionsRef.current.scopeKind,
          parentGraphId: optionsRef.current.parentGraphId,
          parentNodeId: optionsRef.current.parentNodeId,
          layer: optionsRef.current.layer,
          layerKind: optionsRef.current.layerKind,
          summary: optionsRef.current.summary,
          panels: optionsRef.current.panels,
        }),
      })
      setStatus(res.ok ? "saved" : "error")
    } catch {
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    // Skip saving on the initial render before any user/collaboration changes.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(doSave, 2000)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, options.panels])

  const save = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    doSave()
  }, [doSave])

  return { status, save }
}

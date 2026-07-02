import "server-only"

import { prisma } from "@/lib/prisma"
import { createCanvasDocV1 } from "@/lib/canvas/canvas-doc"
import { emptyCanvasSnapshot } from "@/lib/canvas/canvas-state"
import { readCanvasDoc } from "@/lib/canvas/canvas-persistence"
import {
  compileCanvasDocsToDesignIrResult,
  type DesignIrCompileOptions,
  type DesignIrCompileResult,
} from "@/lib/canvas/design-ir"
import { ROOT_GRAPH_ID, isValidGraphId } from "@/lib/canvas/graph-ids"

export async function compileProjectDesignIr(
  projectId: string,
  options: DesignIrCompileOptions = {}
): Promise<DesignIrCompileResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  })
  const projectName = options.projectName ?? project?.name ?? "System"
  const rootDoc =
    (await readCanvasDoc(projectId, ROOT_GRAPH_ID)) ??
    createCanvasDocV1(emptyCanvasSnapshot(), {
      projectId,
      title: projectName,
    })
  const docs = [rootDoc]

  if (!options.rootOnly) {
    const seenGraphIds = new Set([rootDoc.graphId])
    const pendingGraphIds = rootDoc.nodes
      .map((node) => node.data.subcanvasRef?.graphId)
      .filter((graphId): graphId is string => Boolean(graphId?.trim()))
      .filter((graphId) => isValidGraphId(graphId))
      .sort((a, b) => a.localeCompare(b, "en"))

    while (pendingGraphIds.length > 0) {
      const graphId = pendingGraphIds.shift()
      if (!graphId || seenGraphIds.has(graphId)) continue
      seenGraphIds.add(graphId)

      const childDoc = await readCanvasDoc(projectId, graphId)
      if (!childDoc) continue

      docs.push(childDoc)
      const nestedGraphIds = childDoc.nodes
        .map((node) => node.data.subcanvasRef?.graphId)
        .filter((nestedGraphId): nestedGraphId is string => Boolean(nestedGraphId?.trim()))
        .filter((nestedGraphId) => isValidGraphId(nestedGraphId))
        .sort((a, b) => a.localeCompare(b, "en"))
      pendingGraphIds.push(...nestedGraphIds)
    }
  }

  return compileCanvasDocsToDesignIrResult(docs, {
    ...options,
    projectId,
    projectName,
  })
}

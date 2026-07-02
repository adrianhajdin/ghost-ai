import "server-only"

import { compileProjectDesignIr } from "@/lib/canvas/design-ir-project"
import {
  compileDesignIrToPromptPack,
  type PromptPackMode,
  type PromptPackTargetAgent,
  type PromptPackV1,
} from "@/lib/prompt-pack/prompt-pack"

export interface ProjectPromptPackOptions {
  targetAgent?: PromptPackTargetAgent
  mode?: PromptPackMode
  rootOnly?: boolean
  includeValidation?: boolean
}

export interface ProjectPromptPackResult {
  promptPack: PromptPackV1
  markdown: string
  status: PromptPackV1["status"]
  targetAgent: PromptPackTargetAgent
  irHash: string
  warnings: PromptPackV1["warnings"]
}

export async function compileProjectPromptPack(
  projectId: string,
  options: ProjectPromptPackOptions = {}
): Promise<ProjectPromptPackResult> {
  const designIrResult = await compileProjectDesignIr(projectId, {
    rootOnly: options.rootOnly,
    includeValidation: options.includeValidation,
  })
  const promptPack = compileDesignIrToPromptPack(designIrResult.ir, {
    targetAgent: options.targetAgent,
    mode: options.mode,
  })

  return {
    promptPack,
    markdown: promptPack.output.markdown,
    status: promptPack.status,
    targetAgent: promptPack.targetAgent,
    irHash: promptPack.source.irHash,
    warnings: promptPack.warnings,
  }
}

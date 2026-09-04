import { z } from "zod"
import { AI_PROVIDER_IDS } from "@/types/ai"

const identifierSchema = z.string().trim().min(1).max(120)

export const designRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  roomId: z.string().trim().min(1).max(200),
  providerConfigId: z.string().trim().min(1).max(200).optional(),
})

export const designPayloadSchema = designRequestSchema.extend({
  projectId: z.string().trim().min(1).max(200),
  userId: z.string().trim().min(1).max(200),
})

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4_000),
})

export const nodeDataSchema = z
  .object({
    label: z.string().trim().max(200).optional(),
    shape: z.string().trim().max(40).optional(),
    color: z.string().trim().max(40).optional(),
  })
  .strip()

export const nodeSchema = z
  .object({
    id: identifierSchema,
    type: z.string().trim().max(80).optional(),
    position: z
      .object({
        x: z.number().min(-100_000).max(100_000),
        y: z.number().min(-100_000).max(100_000),
      })
      .optional(),
    data: nodeDataSchema.optional(),
  })
  .strip()

export const edgeSchema = z
  .object({
    id: identifierSchema,
    source: identifierSchema,
    target: identifierSchema,
    data: z
      .object({ label: z.string().trim().max(120).optional() })
      .strip()
      .optional(),
  })
  .strip()

export const specRequestSchema = z.object({
  roomId: z.string().trim().min(1).max(200),
  chatHistory: z.array(chatMessageSchema).max(100),
  nodes: z.array(nodeSchema).max(250),
  edges: z.array(edgeSchema).max(500),
  providerConfigId: z.string().trim().min(1).max(200).optional(),
})

export const specPayloadSchema = specRequestSchema.extend({
  projectId: z.string().trim().min(1).max(200),
})

const optionalBaseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .optional()

export const aiProviderConfigCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.enum(AI_PROVIDER_IDS),
  model: z.string().trim().min(1).max(160),
  baseUrl: optionalBaseUrlSchema,
  apiKey: z.string().trim().min(1).max(1_000).optional(),
  isDefault: z.boolean().optional().default(false),
})

export const aiProviderConfigUpdateSchema = aiProviderConfigCreateSchema
  .partial()
  .extend({
    clearApiKey: z.boolean().optional().default(false),
  })

export type DesignPayload = z.infer<typeof designPayloadSchema>
export type SpecPayload = z.infer<typeof specPayloadSchema>
export type AiChatMessage = z.infer<typeof chatMessageSchema>
export type AiCanvasNode = z.infer<typeof nodeSchema>
export type AiCanvasEdge = z.infer<typeof edgeSchema>

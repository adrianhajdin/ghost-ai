"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Check,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  TestTube2,
  Trash2,
  X,
} from "lucide-react"
import { AI_PROVIDER_DEFINITIONS, AI_PROVIDER_IDS, type AiProviderId, type AiProviderSummary } from "@/types/ai"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface AiProviderSettingsProps {
  projectId: string
}

interface ProviderForm {
  name: string
  provider: AiProviderId
  model: string
  baseUrl: string
  apiKey: string
  isDefault: boolean
  clearApiKey: boolean
}

const EMPTY_FORM: ProviderForm = {
  name: "",
  provider: "ollama",
  model: AI_PROVIDER_DEFINITIONS.ollama.defaultModel,
  baseUrl: AI_PROVIDER_DEFINITIONS.ollama.defaultBaseUrl ?? "",
  apiKey: "",
  isDefault: false,
  clearApiKey: false,
}

function isProviderSummary(value: unknown): value is AiProviderSummary {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.provider === "string" &&
    AI_PROVIDER_IDS.includes(candidate.provider as AiProviderId) &&
    typeof candidate.model === "string" &&
    (candidate.baseUrl === null || typeof candidate.baseUrl === "string") &&
    typeof candidate.isDefault === "boolean" &&
    typeof candidate.hasApiKey === "boolean" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string"
  )
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error: unknown }).error
    if (typeof error === "string" && error.trim()) return error
  }

  return fallback
}

export function AiProviderSettings({ projectId }: AiProviderSettingsProps) {
  const [open, setOpen] = useState(false)
  const [providers, setProviders] = useState<AiProviderSummary[]>([])
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedDefinition = useMemo(
    () => AI_PROVIDER_DEFINITIONS[form.provider],
    [form.provider]
  )
  const showsBaseUrl =
    selectedDefinition.isLocal || form.provider === "custom" || form.provider === "azure"
  const baseUrlPlaceholder =
    form.provider === "azure"
      ? "https://resource.openai.azure.com/openai/v1"
      : selectedDefinition.defaultBaseUrl ?? "https://your-gateway.example/v1"

  const loadProviders = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/projects/${projectId}/ai/providers`)
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Unable to load AI providers."))
      }

      const rawProviders =
        typeof data === "object" && data !== null && "providers" in data
          ? (data as { providers: unknown }).providers
          : null
      if (!Array.isArray(rawProviders) || !rawProviders.every(isProviderSummary)) {
        throw new Error("The server returned an invalid provider list.")
      }

      setProviders(rawProviders)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load AI providers.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (nextOpen) {
        setNotice(null)
        void loadProviders()
      }
    },
    [loadProviders]
  )

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }, [])

  const handleProviderChange = useCallback((provider: AiProviderId) => {
    const definition = AI_PROVIDER_DEFINITIONS[provider]
    setForm((current) => ({
      ...current,
      provider,
      model: definition.defaultModel,
      baseUrl: definition.defaultBaseUrl ?? "",
      apiKey: "",
      clearApiKey: false,
    }))
  }, [])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setNotice(null)

    const body: Record<string, unknown> = {
      name: form.name,
      provider: form.provider,
      model: form.model,
      baseUrl: form.baseUrl,
      isDefault: form.isDefault,
    }
    if (form.apiKey.trim()) body.apiKey = form.apiKey
    if (editingId && form.clearApiKey) body.clearApiKey = true

    try {
      const endpoint = editingId
        ? `/api/projects/${projectId}/ai/providers/${editingId}`
        : `/api/projects/${projectId}/ai/providers`
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(getErrorMessage(data, "Unable to save the AI provider."))
      }

      resetForm()
      setNotice("Provider saved.")
      await loadProviders()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the AI provider.")
    } finally {
      setSaving(false)
    }
  }, [editingId, form, loadProviders, projectId, resetForm])

  const handleEdit = useCallback((provider: AiProviderSummary) => {
    setEditingId(provider.id)
    setForm({
      name: provider.name,
      provider: provider.provider,
      model: provider.model,
      baseUrl: provider.baseUrl ?? AI_PROVIDER_DEFINITIONS[provider.provider].defaultBaseUrl ?? "",
      apiKey: "",
      isDefault: provider.isDefault,
      clearApiKey: false,
    })
    setError(null)
    setNotice(null)
  }, [])

  const handleSetDefault = useCallback(
    async (providerId: string) => {
      setError(null)
      setNotice(null)

      try {
        const response = await fetch(`/api/projects/${projectId}/ai/providers/${providerId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(getErrorMessage(data, "Unable to change the default provider."))
        }

        setNotice("Default provider updated.")
        await loadProviders()
      } catch (defaultError) {
        setError(
          defaultError instanceof Error
            ? defaultError.message
            : "Unable to change the default provider."
        )
      }
    },
    [loadProviders, projectId]
  )

  const handleTest = useCallback(
    async (providerId: string) => {
      setTestingId(providerId)
      setError(null)
      setNotice(null)

      try {
        const response = await fetch(
          `/api/projects/${projectId}/ai/providers/${providerId}/test`,
          { method: "POST" }
        )
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(getErrorMessage(data, "Provider test failed."))
        }

        const output =
          typeof data === "object" && data !== null && "response" in data
            ? (data as { response: unknown }).response
            : "Connection successful."
        setNotice(typeof output === "string" && output ? `Connected: ${output}` : "Connection successful.")
      } catch (testError) {
        setError(testError instanceof Error ? testError.message : "Provider test failed.")
      } finally {
        setTestingId(null)
      }
    },
    [projectId]
  )

  const handleDelete = useCallback(
    async (provider: AiProviderSummary) => {
      if (!window.confirm(`Remove "${provider.name}" from this project?`)) return

      setDeletingId(provider.id)
      setError(null)
      setNotice(null)

      try {
        const response = await fetch(`/api/projects/${projectId}/ai/providers/${provider.id}`, {
          method: "DELETE",
        })
        const data: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(getErrorMessage(data, "Unable to remove the AI provider."))
        }

        if (editingId === provider.id) resetForm()
        setNotice("Provider removed.")
        await loadProviders()
      } catch (deleteError) {
        setError(
          deleteError instanceof Error ? deleteError.message : "Unable to remove the AI provider."
        )
      } finally {
        setDeletingId(null)
      }
    },
    [editingId, loadProviders, projectId, resetForm]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => handleOpenChange(true)}
        aria-label="AI provider settings"
        title="AI provider settings"
        className="text-text-muted hover:bg-bg-subtle hover:text-text-primary"
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto border-border-default bg-bg-surface">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-8 text-text-primary">
            <Settings2 className="h-4 w-4 text-accent-ai-text" />
            AI providers
          </DialogTitle>
          <DialogDescription className="text-text-muted">
            Add local or cloud model APIs for this project. Credentials are encrypted and never shown again.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-xl border border-state-error/30 bg-state-error/10 px-3 py-2 text-xs text-state-error">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="rounded-xl border border-state-success/30 bg-state-success/10 px-3 py-2 text-xs text-state-success">
            {notice}
          </div>
        ) : null}

        <div className="rounded-2xl border border-border-subtle bg-bg-elevated p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">
                {editingId ? "Edit provider" : "Add provider"}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                The default provider is used by design and spec generation.
              </p>
            </div>
            {editingId ? (
              <Button variant="ghost" size="icon-sm" onClick={resetForm} aria-label="Cancel editing">
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Name</span>
              <Input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Local architect"
                className="border-border-subtle bg-bg-surface text-text-primary placeholder:text-text-faint"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Provider</span>
              <select
                value={form.provider}
                onChange={(event) => handleProviderChange(event.target.value as AiProviderId)}
                className="h-8 w-full rounded-lg border border-border-subtle bg-bg-surface px-2.5 text-sm text-text-primary outline-none focus:border-accent-primary"
              >
                {AI_PROVIDER_IDS.map((providerId) => (
                  <option key={providerId} value={providerId}>
                    {AI_PROVIDER_DEFINITIONS[providerId].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-text-secondary">Model ID</span>
              <Input
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
                placeholder="Model name"
                className="border-border-subtle bg-bg-surface text-text-primary placeholder:text-text-faint"
              />
            </label>

            {showsBaseUrl ? (
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-text-secondary">Base URL</span>
                <Input
                  value={form.baseUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  placeholder={baseUrlPlaceholder}
                  className="border-border-subtle bg-bg-surface text-text-primary placeholder:text-text-faint"
                />
              </label>
            ) : null}

            <label className={cn("space-y-1.5", !showsBaseUrl && "sm:col-span-2")}>
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <KeyRound className="h-3 w-3" />
                API key {editingId ? "(optional)" : ""}
              </span>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, apiKey: event.target.value, clearApiKey: false }))
                }
                placeholder={editingId ? "Leave blank to keep the saved key" : "Paste provider key"}
                className="border-border-subtle bg-bg-surface text-text-primary placeholder:text-text-faint"
              />
            </label>
          </div>

          {editingId ? (
            <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={form.clearApiKey}
                onChange={(event) =>
                  setForm((current) => ({ ...current, clearApiKey: event.target.checked, apiKey: "" }))
                }
                className="accent-accent-primary"
              />
              Clear the saved API key
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isDefault: event.target.checked }))
                }
                className="accent-accent-primary"
              />
              Use as default
            </label>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.model.trim()}
              className="gap-1.5 bg-accent-ai text-white hover:bg-accent-ai/80"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {editingId ? "Save changes" : "Add provider"}
            </Button>
          </div>

          {selectedDefinition.isLocal ? (
            <p className="mt-3 text-[11px] leading-4 text-state-warning">
              Local endpoints are reachable only when the Trigger worker runs on the same machine.
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-text-faint">Configured providers</p>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
          </div>

          {!loading && providers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-subtle px-4 py-6 text-center">
              <p className="text-sm text-text-secondary">No project providers yet.</p>
              <p className="mt-1 text-xs text-text-muted">Add one above to enable app-managed AI.</p>
            </div>
          ) : null}

          {providers.map((provider) => {
            const definition = AI_PROVIDER_DEFINITIONS[provider.provider]
            return (
              <div
                key={provider.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-elevated px-3 py-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-ai/15">
                  <KeyRound className="h-4 w-4 text-accent-ai-text" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-text-primary">{provider.name}</p>
                    {provider.isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-primary-dim px-2 py-0.5 text-[10px] text-accent-primary">
                        <Check className="h-2.5 w-2.5" />
                        Default
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {definition.label} · {provider.model} · {provider.hasApiKey ? "Key saved" : "No key"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void handleTest(provider.id)}
                    disabled={testingId === provider.id}
                    aria-label={`Test ${provider.name}`}
                    title="Test connection"
                  >
                    {testingId === provider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <TestTube2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {!provider.isDefault ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => void handleSetDefault(provider.id)}
                      aria-label={`Use ${provider.name} as default`}
                      title="Use as default"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleEdit(provider)}
                    aria-label={`Edit ${provider.name}`}
                    title="Edit provider"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void handleDelete(provider)}
                    disabled={deletingId === provider.id}
                    aria-label={`Remove ${provider.name}`}
                    title="Remove provider"
                    className="text-state-error hover:bg-state-error/10 hover:text-state-error"
                  >
                    {deletingId === provider.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

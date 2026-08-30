Manage project AI providers from the application instead of requiring environment-file edits for every model change.

## Behavior

- Project owners can add, edit, test, remove, and select a default AI provider from the AI Workspace settings.
- Supported providers are Ollama, LM Studio, Azure OpenAI/Microsoft Foundry, OpenAI, Anthropic, OpenRouter, and custom OpenAI-compatible endpoints.
- A provider stores a display name, provider type, model ID, optional local/custom base URL, and an encrypted API key.
- API keys are never returned in API responses and are never included in Trigger.dev task payloads.
- Design and spec tasks resolve the selected project provider at execution time.
- Environment-based provider configuration remains a fallback for projects without an app-managed default.

## Security

- Provider configuration mutations and connection tests are owner-only.
- `AI_CONFIG_ENCRYPTION_KEY` is a server/worker bootstrap secret and must be identical in the Next.js and Trigger.dev environments.
- Local endpoints are supported for local Trigger workers; deployed Trigger workers require cloud or publicly reachable endpoints.

## API

- `GET/POST /api/projects/[projectId]/ai/providers`
- `PATCH/DELETE /api/projects/[projectId]/ai/providers/[providerConfigId]`
- `POST /api/projects/[projectId]/ai/providers/[providerConfigId]/test`

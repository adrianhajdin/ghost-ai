# Deprecated AI Design Logic Spec

This historical feature spec has been retired.

Current product state:

- Architect conversation is the active LLM architecture workflow.
- The LLM may propose non-destructive canvas patch operations.
- Deterministic code loads/saves canvas state, sanitizes transport, enforces auth/access, runs async tasks, persists Architect messages, and applies only user-approved proposals.
- Deterministic code must not author architecture content, auto-fix architecture, execute code, build apps, or write external repositories.

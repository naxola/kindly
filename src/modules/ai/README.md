# Módulo `ai`

AI Copilot (Fase 8): sugerencia contextual en la conversación, nunca un
chatbot ni un agente, y nunca envía nada.

```
tarjeta (inbox/[id]/copilot-card.tsx)
  → /api/conversations/[id]/copilot   (DTO sin modelo/prompt: dto.ts, http.ts)
  → service.ts (contexto acotado, freno, auditoría)
  → knowledge/retrieval.ts → knowledge/reranker.ts (identidad)
  → llm-provider.ts (OpenAI: openai-llm-provider.ts)
  → domain.ts (abstención, citas reconstruidas de fragmentos reales)
```

Decisiones en `docs/DECISIONS.md` ("Fase 8"). Ajustes: `OPENAI_LLM_MODEL`,
`OPENAI_EMBEDDING_MODEL`, `KNOWLEDGE_MIN_SIMILARITY` (`.env.example`).
Evaluación del retrieval: `tests/eval/README.md`.

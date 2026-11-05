# Evaluación del retrieval (Fase 8, paso 6)

Mide cuánto acierta `retrieveKnowledge` con preguntas reales. **No bloquea la
fase**: el dataset real (50-100 preguntas) lo aporta el usuario después; aquí
está el formato, las métricas y el script.

## Dataset (`tests/eval/dataset.jsonl`, no versionado todavía)

JSONL, una pregunta por línea (`tests/eval/dataset.example.jsonl` es un
ejemplo del formato, no datos reales):

| Campo | Obligatorio | Significado |
|---|---|---|
| `id` | sí | Único. |
| `question` | sí | Tal y como la escribiría la persona. |
| `atDate` | no | `YYYY-MM-DD`: versión aplicable a esa fecha (por defecto, hoy). |
| `jurisdiction` | no | Filtro duro de jurisdicción. |
| `expected` | sí | Fuentes que responden a la pregunta; **vacío = la base no la responde** (el copiloto debería abstenerse). |

Cada elemento de `expected`: `documentTitle` (obligatorio, exacto sin
mayúsculas), `article` (p. ej. `"34"`), `contains` (texto que debe contener el
fragmento, p. ej. el inicio de un apartado). Todos los campos dados deben
coincidir. Conviene incluir preguntas **sin respuesta** (`expected: []`) y
preguntas con fecha pasada (versiones antiguas).

## Ejecución

```
env DATABASE_URL='<url>' OPENAI_API_KEY='<key>' npm run eval:retrieval -- \
  --dataset tests/eval/dataset.jsonl [--organization-id <uuid>] [--limit 8] [--verbose]
```

Sin `--organization-id` solo se busca en el conocimiento GLOBAL.

## Métricas

- **recall@k**: % de preguntas con respuesta que tienen un fragmento relevante en los k primeros.
- **MRR**: media de 1/posición del primer fragmento relevante.
- **relevant chunk survives the gate**: % de preguntas cuyo fragmento relevante supera el umbral de relevancia del copiloto (`KNOWLEDGE_MIN_SIMILARITY`) — es lo que el modelo puede llegar a citar.
- **unanswerable with nothing offered**: % de preguntas sin respuesta para las que el umbral no deja pasar ningún candidato.
- **mean candidates offered**: cuántos fragmentos recibe el modelo de media.

## Calibrar el umbral

Variar `KNOWLEDGE_MIN_SIMILARITY` y repetir: subirlo debe aumentar "nothing offered" sin bajar "survives the gate". Preferimos exceso de candidatos a perder recall (decisión 2026-10-01); la abstención del modelo es la segunda barrera.

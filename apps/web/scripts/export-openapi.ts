/** Exports the OpenAPI contract to docs/api/openapi.json (CI checks it is up to date). */
import { mkdirSync, writeFileSync } from 'node:fs'
import { api, OPENAPI_DOCUMENT_CONFIG } from '../src/server/api/app.ts'

const document = api.getOpenAPI31Document(OPENAPI_DOCUMENT_CONFIG)
const out = new URL('../../../docs/api/openapi.json', import.meta.url)
mkdirSync(new URL('.', out), { recursive: true })
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(`OpenAPI → ${out.pathname}`)

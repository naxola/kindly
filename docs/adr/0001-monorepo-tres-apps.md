# 0001 — Monolito modular en monorepo con `web`, `site` y `worker`

**Estado:** Aceptado (2026-11-06)

## Contexto

Un único desarrollador mantiene varios SaaS que comparten casi toda la
fontanería. Cada uno necesita una aplicación con sesión, una web pública con
blog y trabajo en segundo plano que no bloquee al usuario ni se pierda.

## Decisión

- Monorepo con pnpm workspaces + Turborepo (patrón probado en procurement).
- Tres aplicaciones, cada una un proceso que se arranca:
  - `apps/web`: el SaaS, con sesión (`app.producto.com`);
  - `apps/site`: la web pública (`producto.com`), ver ADR 0005;
  - `apps/worker`: consumidor de la cola, ver ADR 0004.
- Paquetes que se importan: `config`, `database`, `core`, `adapters`, `ui`, `content`.
- Dirección de dependencias fija:
  `apps/* → adapters → core → database → config`; `adapters` implementa las
  interfaces que define `core`; `ui` no conoce `core` ni `database`.
- Dentro de `core`, un módulo por carpeta con `index.ts` público. Un script de
  fronteras en `lint` impide importar el interior de otro módulo o saltarse la
  dirección de dependencias.

## Alternativas

- **Una sola app Next con todo** (como kindly hoy): el worker no puede reutilizar
  el dominio sin depender de Next, y publicar un post redespliega el SaaS.
- **Un paquete por módulo:** demasiada ceremonia para una persona.

## Consecuencias

- Ninguna app contiene reglas de negocio; el worker queda en unas pocas
  centenas de líneas.
- Las fronteras dependen del script de lint: debe ejecutarse en CI.

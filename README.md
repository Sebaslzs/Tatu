# Tatú

An open, interoperable payment solution built on Interledger Protocol (ILP) and Open Payments standards, enabling seamless peer-to-peer value transfer over HTTP.

## Requisitos

- Node.js LTS (ver `.nvmrc`) y pnpm (`corepack enable`)

## Cómo correrlo

```bash
cp .env.example .env   # completar; sin DATABASE_URL se usa PGlite local
pnpm install
pnpm dev               # API en :3000 y web en :5173 (Vite pasa /api a la API)
```

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | API (`server/`, Express + tsx) y web (`web/`, React + Vite) en paralelo |
| `pnpm test` | Vitest en todos los paquetes |
| `pnpm typecheck` | TypeScript en todos los paquetes |
| `pnpm build` | Typecheck de la API y build de la web |

## Documentación de la API

Con la API arriba: Swagger UI en <http://localhost:3000/api/docs> y el documento OpenAPI 3.1 en
`/api/openapi.json`. Para exportarlo a un archivo (Postman, Bruno):
`pnpm --filter server exec tsx scripts/volcar-openapi.ts`.

## Estructura

```text
server/   API: Express + Zod + SDK Open Payments + Drizzle (Supabase o PGlite)
web/      Web: React + Vite + Tailwind CSS + shadcn/ui, selector de rol
docs/     Documentación del equipo (arquitectura, estructura, historias)
prompts/  Texto real de los prompts usados con IA
```

El detalle está en [docs/Estructura del proyecto.md](docs/Estructura%20del%20proyecto.md) y en
el [Documento de Arquitectura](docs/Documento%20de%20Arquitectura%20—%20Hackathon%20Open%20Payments.md).

## Uso de IA

Ver [AI_USAGE.md](AI_USAGE.md).

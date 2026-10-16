# Uso de IA

Registro de cómo usamos herramientas de IA en Tatú. El texto completo de cada prompt está en
[`prompts/`](prompts/), un archivo por rol (CA-20.01).

| Fecha | Rol | Herramienta | Tarea | Qué hizo la IA | Qué revisó o decidió el equipo | Prompt |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-16 | Rol 1 | Claude Code (Claude Opus 5.5) | Inicialización del proyecto | Leyó `docs/Estructura del proyecto.md` y el Documento de Arquitectura; instaló Node LTS y pnpm en WSL; creó el monorepo pnpm (`server/` + `web/`) con las últimas versiones estables de cada dependencia; escribió el esqueleto de la API con las rutas del mapa respondiendo 501, la configuración validada con Zod, el adaptador único de Open Payments, la conexión Supabase/PGlite con migrador, la máquina de estados del cobro y la verificación del hash del callback con sus tests; armó la web con Tailwind, shadcn/ui y el selector de rol en `sessionStorage`; agregó `.gitignore`, `.env.example` y README; movió la documentación a `docs/` | Verificado: `pnpm typecheck` y `pnpm test` (14 tests) pasan, la API responde `/api/salud` y `/api/config`, y la web muestra el selector y recuerda el rol al recargar. Pendiente del equipo: revisar el esqueleto y completar la lógica de cada módulo | [prompts/rol-1.md](prompts/rol-1.md#2026-10-16--inicialización-del-proyecto) |

# AI Usage Disclosure

Cumple la política de IA del hackatón: qué herramientas usamos, dónde, qué hicimos nosotros y el
registro de prompts.

## Herramientas usadas

* **Claude Code** (CLI/app de escritorio de Anthropic) con los modelos Claude Opus 5.5 y Claude
  Sonnet 5.5.
  * Créditos consumidos: _el equipo debe completar este dato desde su panel de uso de Anthropic._

## Dónde y cómo usamos la IA

La IA se usó en el backend (`server/`) y en la infraestructura del repositorio. Se indica por
módulo; cada módulo se entregó en su propio commit.

### 1. Estructura del proyecto y configuración (`/`, `server/`, `web/`)

* Claude Code inicializó el monorepo pnpm con las últimas versiones LTS/estables, a partir de
  `docs/Estructura del proyecto.md` y del Documento de Arquitectura: `package.json`,
  `pnpm-workspace.yaml`, `.gitignore`, `.env.example`, `README.md`, esqueleto de `server/` y `web/`
  (Vite + Tailwind + shadcn/ui, selector de rol).
* La web quedó solo como esqueleto; **no se desarrolló con IA más allá de eso**.

### 2. Base de datos (`db/`, `server/src/db/`)

* `db/` es el esquema SQL que el equipo definió en la rama `main`; se copió tal cual, **sin
  modificarlo ni generarlo con IA**.
* `server/src/db/generado/schema.ts` lo genera `drizzle-kit pull` desde la base de Supabase
  (`pnpm db:pull`, con un ajuste automático en `scripts/ajustar-schema.mjs`). No se escribió SQL a
  mano.
* Claude Code escribió la conexión (`conexion.ts`), los repositorios, la unidad de trabajo y el
  esquema local para pruebas con PGlite (`esquemaLocal.ts`).

### 3. Backend — épica 1: conexión del subsidio (`server/src/programas`, `liquidacion`, `puntos`, `comun`)

* Claude Code implementó HU-01 (programas), HU-02 (liquidación, cliente y simulador) y HU-03
  (puntos) con SOLID y DRY: dependencias inyectadas, reglas puras, errores en un solo formato y
  validación con Zod en la frontera.
* Pruebas de integración por criterio de aceptación (`hu01.test.ts`, `hu02.test.ts`,
  `hu03.test.ts`) sobre PGlite en memoria.

### 4. Documentación de la API (`server/src/openapi/`)

* Claude Code generó el documento OpenAPI 3.1 y Swagger UI (`/api/docs`, `/api/openapi.json`). Los
  cuerpos de entrada salen de los mismos esquemas Zod que validan la API; las pruebas de contrato
  comparan las respuestas reales con los modelos publicados.

### 5. Backend — autorización con Open Payments (`server/src/programas/`, `server/src/openPaymentsService.ts`)

* Claude Code implementó HU-04 y HU-05 (permiso con tope, callback con verificación del hash,
  aprobación rechazada, vencida o cancelada) y HU-18 (pausar y reanudar): `autorizacion.ts`,
  `ciclo.ts`, `transiciones.ts`, `lector.ts`, `hash.ts` y las rutas.
* El adaptador `openPaymentsService.ts` (único archivo que importa el SDK) lo escribió Claude Code a
  partir de la documentación de Open Payments y de lo que ya definía la arquitectura del equipo.
  **Debe revisarse y probarse contra la Test Wallet real**: hasta ahora solo se probó con dobles.
* Pruebas por criterio de aceptación en `hu04.test.ts`.

### 6. Backend — cuentas, beneficiarios y banco puente (`server/src/cuentas`, `beneficiarios`, `puente`, `liquidacion`)

* Claude Code implementó HU-07: enlazar una llave Bre-B (cédula, celular, correo o alfanumérica) o
  una billetera, con PIN, verificación de titularidad y una sola cuenta vigente por persona; el
  registro del equipo de prueba; el banco puente de Bre-B simulado (contrato, enmascarado,
  simulador, router y cliente); y los nombres y el PIN de la liquidación (el PIN solo se guarda como
  hash y la plataforma nunca lo recibe de vuelta).
* Pruebas por criterio de aceptación en `hu07.test.ts`, `puente.test.ts`, `personas.test.ts` y
  `registro.test.ts`, más los modelos y rutas del Swagger de cada módulo.

### 7. Backend — cobros (`server/src/cobros`, `beneficiarios`, `puntos`, `programas/permisoToken.ts`)

* Claude Code implementó el flujo de cobro: solicitar (HU-09, HU-10), confirmar con PIN y cancelar
  (HU-11), pagar con Open Payments y reconciliar (HU-12), el catálogo de rechazos (HU-13), el
  bloqueo del doble cobro (HU-14), la rotación del token del permiso (HU-06) y el resumen del
  beneficiario (HU-08). Está dividido por responsabilidad: `solicitud`, `confirmacion`, `pagador`,
  `movimientos`, `vista` y `servicio`.
* Pruebas: `reglas.test.ts`, `estados.test.ts` y `hu10.test.ts` (HU-10 y HU-11). **Faltan** las
  pruebas por criterio de HU-06, HU-08, HU-09, HU-12, HU-13 y HU-14, y el Swagger de `/cobros`.
* `solicitud.ts` y `pagador.ts` implementan la lógica de dinero: **deben revisarse a mano** antes de
  usarse con pagos reales.

### 8. Módulos siguientes del backend

Cada módulo se registra aquí al entregarse (ver el historial de commits de `server/`).

## Qué hicimos nosotros

* Definir el alcance de cada tarea (por ejemplo, «solo backend», «sin SQL a mano»), elegir la base
  (Supabase) y la ubicación del esquema (`db/` en `main`).
* Revisar los cambios antes de aceptarlos y decidir qué se commitea; la IA no hace `push` ni toca
  las ramas `produccion` o `develop`.
* Proveer la conexión a Supabase y mantener los secretos fuera del repositorio (`.env` ignorado).
* _El equipo debe completar aquí las pruebas manuales y la verificación contra la Test Wallet._

## Archivos con poca o ninguna IA

* `db/` (esquema SQL del equipo).
* _El equipo debe indicar aquí los archivos que escribió o reescribió a mano (por ejemplo, el
  servicio de Open Payments si lo reescribe tras probarlo)._

## Registro de prompts

El texto real de los prompts está en [`prompts/`](prompts/): `prompts/rol-1.md`.

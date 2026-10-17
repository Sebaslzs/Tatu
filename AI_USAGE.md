# AI Usage Disclosure

Cumple la política de IA del hackatón: qué herramientas usamos, en qué parte del proyecto, qué
hicimos nosotros y dónde está el texto real de los prompts.

## Herramientas usadas

* **Claude Code** (app de escritorio / CLI de Anthropic), con los modelos Claude Opus 5.5 y Claude
  Sonnet 5.5. Lo usaron Juan Pablo Méndez Valencia, Fernando de Jesús Palacio Suárez y Sebastián
  López Sánchez.
* **Cursor** en modo agente (modelo automático, Grok 4.6 y Grok 4.7; los subagentes usaron Claude
  Opus 5 y Claude Sonnet 5.5). Lo usó Sebastián López Sánchez.
  * Créditos consumidos: _el equipo debe completar este dato desde su panel de uso de Anthropic y de
    Cursor._

## Dónde y cómo usamos la IA

La IA se usó **en todo el proyecto**: backend (`server/`), web (`web/`), base de datos (`db/`),
documentación (`docs/`) e infraestructura del repositorio. No hay módulos de producto escritos
sin ella. El desglose siguiente indica en qué archivos y con qué herramienta.

### 1. Repositorio, README y estructura (`/`, `docs/`)

* Claude Code inicializó el monorepo pnpm (versiones LTS) a partir de `docs/Estructura del
  proyecto.md` y del Documento de Arquitectura: `package.json`, `pnpm-workspace.yaml`,
  `.gitignore`, `.env.example`, esqueleto de `server/` y `web/` (Vite + Tailwind + shadcn/ui).
* Cursor ordenó la carpeta según la especificación de implementación, sin escribir código de
  producto en ese paso.
* Claude Code redactó el `README.md` (qué es Tatú, el problema, el flujo, los roles y el alcance).
  El equipo lo revisó.

### 2. Base de datos (`db/`, `server/src/db/`)

* Claude Code, con Fernando, diseñó y documentó el esquema: `db/esquema.sql`, `db/README.md`,
  `db/CONEXION.md` y `db/modelo-datos.svg`, contrastado con las historias de usuario.
* `server/src/db/generado/schema.ts` lo genera `drizzle-kit pull` desde Supabase (`pnpm db:pull`,
  con un ajuste en `scripts/ajustar-schema.mjs`).
* Claude Code escribió la conexión (`conexion.ts`), los repositorios, la unidad de trabajo y el
  esquema local de pruebas con PGlite (`esquemaLocal.ts`).

### 3. Backend (`server/src/`)

* **Épica 1 — conexión del subsidio** (`programas`, `liquidacion`, `puntos`, `comun`): Claude Code
  implementó HU-01 a HU-03 con SOLID y DRY, validación Zod y pruebas de integración en PGlite
  (`hu01.test.ts`, `hu02.test.ts`, `hu03.test.ts`).
* **API documentada** (`openapi/`): OpenAPI 3.1 y Swagger UI en `/api/docs` y `/api/openapi.json`,
  a partir de los mismos esquemas Zod. Juan Pablo pidió alinear los endpoints con el contrato del
  equipo (`Endpoints.md`).
* **Autorización Open Payments** (`programas/`, `openPaymentsService.ts`): HU-04, HU-05 y HU-18
  (permiso con tope, callback con hash, pausar y reanudar). El adaptador
  `openPaymentsService.ts` (único archivo que importa el SDK) lo escribió Claude Code a partir de
  la documentación de Open Payments y de la arquitectura del equipo. Pruebas en `hu04.test.ts`.
* **Cuentas, beneficiarios y banco puente** (`cuentas`, `beneficiarios`, `puente`): HU-07, llaves
  Bre-B o billetera, PIN, puente simulado y registro de prueba. Pruebas en `hu07.test.ts`,
  `puente.test.ts`, `personas.test.ts` y `registro.test.ts`.
* **Cobros** (`cobros`, `permisoToken.ts`): solicitar, confirmar con PIN, pagar y reconciliar,
  rechazos, doble cobro y resumen del beneficiario (HU-06, HU-08 a HU-14). Lógica de dinero en
  `solicitud.ts` y `pagador.ts`.
* **Punto — caja:** `GET /puntos/:id/resumen` y prueba `caja.test.ts`.
* **Pruebas extra:** Cursor mapeó los endpoints de `develop` y repartió pruebas de integración
  entre agentes (entre ellas HU-08 y entidades).
* **Runtime:** Juan Pablo usó Claude Code para diagnosticar permisos que se vencían, el error 401
  de firma y pagos duplicados en la Test Wallet (COMPLETED + PENDING). Sebastián aportó logs y el
  contexto de la llave en Vercel.

### 4. Web (`web/`)

* **Inicio y roles** (`vistas/inicio`, `componentes`): pantalla para elegir entidad, beneficiario
  o punto a partir del prototipo HTML del equipo y de `web/public/brand`. Lema bajo la marca
  («Creando túneles seguros hacia el futuro de los pagos») en claro y oscuro, adaptable a celular
  y computador. El logo oscuro (`tatu-logo-oscuro.svg`) quedó con fondo transparente para no
  desentonar con el tema.
* **Beneficiario** (`vistas/beneficiario`, `api`): subsidios, enlazar cuenta, cobrar y dónde
  cobrar, escrito de cero a partir de la arquitectura, el diseño y los endpoints (`/api/docs` y
  las HU de cobro).
* **Punto de retiro** (`vistas/punto`): flujo del cajero, cobro, espera, cobros del día y caja,
  más biometría simulada en caja (plan del equipo; implementación con Claude Code). Fernando
  pidió retiro parcial y registro de una venta durante el retiro, sin convertir a Tatú en un
  facturador.
* **Entidad** (`vistas/entidad`): programas, liquidación, aprobación en el banco, personas y
  carga desde archivo; ajustes de URLs en Vercel y de liquidación/puente simulados según
  arquitectura, diseño y endpoints de esa página.
* **Tatú y cargas** (`componentes/tatu`, `lib`): mascota que gira en loaders y pagos (verde si
  aprueba, roja si rechaza) y sigue el tema claro u oscuro.
* **Modo oscuro:** tokens CSS (`data-tema`), `BotonTema` y paleta «Noche».
* **Responsive:** Fernando, con Claude Code, ajustó celular / tablet / computador reutilizando
  `PantallaAdaptable` y el corte `pc:` (960 px), sin tocar backend ni Open Payments.

### 5. Documentación e investigación (`docs/`)

* Claude Code investigó reconocimiento facial en caja y cobro por partes ante la DIAN, y propuso
  el punto mixto (RUT) con confirmación ciega del efectivo.
* Claude Code resumió cifras de la respuesta de Prosperidad Social al derecho de petición del
  equipo y ubicó la fuente de la cifra de Colombia Mayor usada en el pitch.
* El plan de biometría simulada (rostro con cámara + huella con tecla; siempre aprueba en la
  demo) se diseñó con Claude Code y Cursor a partir de la especificación y las HU.

## Qué hicimos nosotros

* Definir el producto: arquitectura, historias de usuario, criterios de aceptación, contrato de
  endpoints, prototipo HTML y marca (`web/public/brand/`).
* Decidir las reglas de negocio (quién puede ser punto, cobro parcial, biometría de la demo,
  llaves Bre-B) y el alcance de cada tarea que se le daba a la IA.
* Revisar, probar y entender el código o el texto que entregaba la IA antes de publicarlo. El
  equipo es responsable de lo que hay en el repositorio, lo haya escrito una persona o una
  herramienta.
* Elegir Supabase, mantener los secretos fuera del git (`.env` ignorado) y decidir qué entra en
  cada commit. La IA no publica sola: el push a GitHub lo hace el equipo.
* Probar en local y en Vercel, incluida la Test Wallet de Interledger.

## Archivos con poca o ninguna IA

No hay archivos de producto escritos sin IA. Lo que no salió de estos logs de prompts es el
insumo de diseño del equipo:

* Identidad visual en `web/public/brand/` (logos y colores que la IA usó como material de
  trabajo, no como algo que hubiera generado aquí).
* `server/src/openPaymentsService.ts` **sí** lo escribió Claude Code, a partir de la
  documentación de Open Payments. El equipo lo trata como archivo crítico: hay que seguir
  revisándolo y probándolo contra la Test Wallet real; hasta ahora parte de las pruebas fueron
  con dobles. `solicitud.ts` y `pagador.ts` (lógica de dinero) tienen la misma exigencia.

## Registro de prompts

El texto real de los prompts está en [`prompts/`](prompts/):

* [`prompts/rol-1.md`](prompts/rol-1.md) — Juan Pablo Méndez Valencia (Claude Code: backend,
  Swagger, biometría, permisos, Test Wallet).
* [`prompts/Fernando/backend-payments.md`](prompts/Fernando/backend-payments.md) — Fernando de
  Jesús Palacio Suárez (Claude Code: base de datos, docs SQL, web responsive, retiro parcial).
* [`prompts/sebastian-lopez-sanchez.md`](prompts/sebastian-lopez-sanchez.md) — Sebastián López
  Sánchez (Claude Code y Cursor: web, punto, entidad, investigación, pitch, logo y lema).

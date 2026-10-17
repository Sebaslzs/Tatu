# Estructura del proyecto

> **Nota (14 de octubre de 2026):** este es el diseño del repositorio **del evento** y lo decide el
> Rol 1. El piloto (`piloto-v2`) usa `server/` en lugar de `api/`, Supabase con Drizzle y un solo
> despliegue en Vercel para la web y la API, lo que ya cierra P-02 y P-20: ver
> [Arquitectura, § 3.5 y § 3.6](./Documento%20de%20Arquitectura%20—%20Hackathon%20Open%20Payments.md).

> **Estado: diseño, sin código.** Este documento define cómo quedará el repositorio cuando
> empiece la implementación. Hoy solo existe documentación (ver `docs/README.md`); no hay
> carpetas `api/`, `web/`, ni archivos de código. Es la referencia que seguirá quien construya
> el esqueleto, y cierra por escrito los pendientes de estructura (P-02, P-11, P-15, P-20).
>
> **Fecha:** 6 de octubre de 2026 · **Fuente:** Documento Guía § Estructura del repositorio y
> § API REST · Documento de Arquitectura § 3.2-3.5 y AD-01…AD-20 · Historias § Modelo de datos
> y § Variables · `Hallazgos — Investigación de Fuentes.md`.

---

## 1. Principios que gobiernan la estructura

| Principio | Fuente | Consecuencia en el árbol |
|---|---|---|
| Monolito modular en un solo proceso (sin microservicios ni colas) | AD-01 | Un solo `api/` con módulos internos; nada de `worker/`, `queue/` o servicios extra |
| Un único adaptador de Open Payments | AD-07, Guía § Revisión | Solo `openPaymentsService.ts` importa `@interledger/open-payments`; el resto habla con él |
| Las rutas reciben y validan; los servicios deciden | Arquitectura § 3.2 | `*/rutas.ts` delgado; la lógica en `servicio.ts`/`orquestacion.ts` |
| Frontend delgado sin secretos | RNF-01, Guía § Qué no usar | `web/` solo llama a nuestra API; nunca al SDK ni a tokens |
| Repo público el sábado 11:00 | RNF-01 | `.gitignore` desde el primer commit; secretos solo en `.env` (nunca commit) |
| Nada nuevo para el equipo | Guía § Stack | TypeScript, Express+tsx, Vite, Tailwind, Vitest; workspaces npm solo si ya lo usaron |
| Documentación separada del código | Acuerdo del equipo (oct 6) | Todo vive en `docs/`; la raíz queda para entregables (`AI_USAGE.md`, `README.md`) |

---

## 2. Árbol propuesto (plan futuro)

```text
/
├── AI_USAGE.md                  # obligatorio (entregable sábado 11:00)
├── prompts/                     # obligatorio: texto real de los prompts
├── README.md                    # qué es, cómo correrlo, link al video
├── .gitignore                   # .env, *.key, private.key → primer commit
├── .env.example                 # sin secretos (ver § 6)
├── package.json                 # workspaces npm: api + web → `npm run dev` único
│
├── docs/                        # ← YA EXISTE: toda la documentación vive aquí
│   ├── README.md                # índice de este directorio
│   ├── Documento Guía — Hackathon Open Payments.md
│   ├── Documento de Arquitectura — Hackathon Open Payments.md
│   ├── Historias de Usuario — Bonos con Destino.md
│   ├── ENDPOINTS.md
│   ├── Hallazgos — Investigación de Fuentes.md
│   ├── Estructura del proyecto.md        # este documento
│   └── script-incoming-payment-grant.ts  # pre-request de Bruno (guía de fondos)
│
├── api/                         # ❌ NO EXISTE AÚN — Node 24 + Express + tsx + Zod + SDK 7.4.0
│   ├── package.json
│   ├── tsconfig.json
│   ├── scripts/
│   │   └── primer-cobro.ts      # E2E con SDK → hito crítico viernes 14:00
│   └── src/
│       ├── main.ts              # arranque Express + montaje de rutas
│       ├── config.ts            # env validada con Zod (una sola lectura de process.env)
│       ├── openPaymentsService.ts   # ÚNICO archivo que importa el SDK (AD-07)
│       ├── programas/
│       │   ├── rutas.ts         # POST /programas · POST /:id/autorizar · POST /:id/cerrar
│       │   │                    # GET /:id/tablero · GET /callback/:id
│       │   ├── servicio.ts      # tope = RN-08, transiciones, cuándo llamar al adaptador
│       │   └── hash.ts          # verificación HU-04 con las 3 variantes base64 (Hallazgos § 3.5)
│       ├── cuentas/
│       │   ├── rutas.ts         # POST /cuentas · GET /cuentas/callback/:id (P-11)
│       │   └── servicio.ts      # verificación de propiedad vía subject (HU-07)
│       ├── cobros/
│       │   ├── rutas.ts         # POST /cobros · POST /:id/confirmar · GET /solo reciben y validan (Zod)
│       │   ├── orquestacion.ts  # P-20: liquidación → transición → pagar → guardar
│       │   ├── estados.ts       # máquina pura Solicitado→PorConfirmar→Pagando→Pagado/Fallido/…
│       │   └── mensajes.ts      # catálogo único de rechazos (HU-13, relacionado con P-16)
│       ├── liquidacion/         # AD-13/P-02: simulador como módulo con router propio
│       │   ├── router.ts        # expuesto bajo /liquidacion/*; LIQUIDACION_URL puede apuntar
│       │   │                    # a la misma API o a otro proceso SIN cambiar código
│       │   ├── datos.ts         # cédulas de prueba, montos, PIN de prueba
│       │   └── contrato.ts      # tipos + Zod del contrato HTTP (P-10: escribirlo antes del evento)
│       ├── db/
│       │   ├── pool.ts          # pg con SQL directo o Drizzle (AD-06, por decidir)
│       │   ├── migraciones/     # 001_init.sql: 6 tablas + índice único parcial (RN-02) + version (RN-10)
│       │   └── repositorios/    # programas.ts · cobros.ts · cuentas.ts · puntos.ts · eventos.ts
│       └── extras.ts            # flags EXTRA_* → GET /config (RNF-10)
│
└── web/                         # ❌ NO EXISTE AÚN — React + Vite + Tailwind + shadcn/ui
    ├── package.json · vite.config.ts · tailwind.config · index.html
    └── src/
        ├── App.tsx              # selector de rol HU-19 + enrutamiento (P-15)
        ├── contexto/Rol.tsx     # rol en sessionStorage; nunca datos sensibles
        ├── api/client.ts        # fetch tipado + POLL_INTERVALO_MS (AD-16)
        ├── vistas/
        │   ├── entidad/         # programas, autorizar, tablero HU-15/HU-16, cierre HU-17
        │   ├── beneficiario/    # enlazar cuenta HU-07, ver cobro HU-14
        │   └── punto/           # cédula, PIN HU-11, resultado HU-12/HU-13
        ├── componentes/         # ui shadcn · MontoEspera (>10 s, P-18) · QR (extra)
        └── extras/              # bono HU-21 · QR HU-22 · PDF417 HU-23 (cada uno tras su EXTRA_*)
```

**Tests:** Vitest junto al código (`estados.test.ts`, `hash.test.ts`, `servicio.test.ts`).
RNF-01 exige al menos el test «hash alterado → rechazado».

---

## 3. Decisiones que cierra esta estructura

| Pendiente | Decisión | Detalle |
|---|---|---|
| **P-20** (¿dónde vive la orquestación del cobro?) | `cobros/orquestacion.ts` | Las rutas solo reciben y validan; el módulo consulta la liquidación, aplica la transición, paga con el adaptador y guarda (Arquitectura § 3.4, pasos 1-10) |
| **AD-13 / P-02** (¿liquidación aparte o módulo?) | **Módulo con router propio** dentro de `api/` | Monolito físico (AD-01) y «servicio aparte» conceptual: `LIQUIDACION_URL` apunta al router `/liquidacion/*` de la misma API, o a otro proceso, sin cambiar código |
| **P-11** (ruta del callback de cuentas) | `GET {API_BASE_URL}/cuentas/callback/:id` | Paralelo al callback de programas `GET /callback/:id`; queda para HU-07 |
| **P-15** (enrutamiento/estado frontend) | Selector de rol + `Rol.tsx` en `sessionStorage` | Criterio: «nada nuevo para el equipo»; pendiente confirmar la librería (react-router o vista condicional) al construir `web/` |

Siguen **fuera** de esta estructura (no los decide este documento): **AD-06** (`pg` vs Drizzle),
**P-14** (Supabase vs Neon), **P-16** (quién genera `idempotency_key`), **P-20** ya cerrado arriba,
y **AD-17** (despliegue: Vercel + Render/Railway, que es extra HU-25).

---

## 4. Mapa: rutas API → archivo

Las 9 rutas de la Guía § API REST más las nuevas necesarias:

| Ruta | Método | Archivo | Operación |
|---|---|---|---|
| `/programas` | POST | `programas/rutas.ts` | O1 |
| `/programas/:id/autorizar` | POST | `programas/rutas.ts` | O2 |
| `/callback/:id` | GET | `programas/rutas.ts` | O2 (hash + `grant.continue`) |
| `/programas/:id/tablero` | GET | `programas/rutas.ts` | O7 |
| `/programas/:id/cerrar` | POST | `programas/rutas.ts` | O8 |
| `/cuentas` | POST | `cuentas/rutas.ts` | O3 |
| `/cuentas/callback/:id` | GET | `cuentas/rutas.ts` | O3 (nueva, P-11) |
| `/cobros` | POST | `cobros/rutas.ts` → `orquestacion.ts` | O4/O5 |
| `/cobros/:id/confirmar` | POST | `cobros/rutas.ts` → `orquestacion.ts` | O5 |
| `/cobros/:id` | GET | `cobros/rutas.ts` | O6 |
| `/config` | GET | `extras.ts` | Banderas `EXTRA_*` (nueva, RNF-10) |
| `/liquidacion/*` | varios | `liquidacion/router.ts` | Simulador (nueva, P-02) |

---

## 5. Mapa: historia de usuario → archivo

| HU | Qué cubre | Archivo principal |
|---|---|---|
| HU-04 / HU-05 | Permiso con tope, callback con hash | `programas/servicio.ts` + `programas/hash.ts` |
| HU-07 | Verificación de propiedad de la cuenta | `cuentas/servicio.ts` |
| HU-11 / HU-12 / HU-13 | Cobro en el punto (PIN, punto de no retorno, mensajes) | `cobros/orquestacion.ts` + `cobros/estados.ts` + `cobros/mensajes.ts` |
| HU-09 | Cobro a la cuenta (sin PIN) | `cobros/orquestacion.ts` (disparo por decidir: P-09) |
| HU-14 / HU-15 / HU-16 | Consulta de cobro, tablero de la entidad | `cobros/rutas.ts` (GET) + `programas/rutas.ts` (tablero) + `web/vistas/entidad/` |
| HU-17 | Cierre del programa | `programas/rutas.ts` → `token.revoke` (Hallazgos § 3.6) |
| HU-19 | Selector de rol | `web/App.tsx` |
| HU-21…HU-25 | Extras tras banderas | `web/extras/` + `api/extras.ts` |

---

## 6. Variables de entorno (`.env.example` sin secretos)

| Variable | Ejemplo | Para qué | Fuente |
|---|---|---|---|
| `DATABASE_URL` | `postgres://…` | Conexión a PostgreSQL (Supabase o Neon) | Historias § Variables |
| `LIQUIDACION_URL` | `http://localhost:3000/liquidacion` | Consulta por cédula y validación del PIN | Historias § Variables |
| `APP_BASE_URL` | `https://…` | Volver a la app tras aprobar (`interact.finish.uri`) | Historias § Variables |
| `API_BASE_URL` | `https://…` | Callbacks `{API_BASE_URL}/callback/:id` y `/cuentas/callback/:id` | Historias § Variables |
| `POLL_INTERVALO_MS` | `1000` | Cadencia de consulta del estado (AD-16) | Historias § Variables |
| `EXTRA_BONO`, `EXTRA_QR`, `EXTRA_PDF417`, `EXTRA_CONTRATO`, `EXTRA_DEPLOY` | `false` | Enciende cada extra; apagado no rompe el flujo principal | RNF-10 |
| Secretos Test Wallet (wallet, `OP_KEY_ID`, `OP_PRIVATE_KEY_PEM`) | — | Firma con el SDK; **solo backend, nunca en el repo** | RNF-01, Hallazgos |

---

## 7. Orden de construcción (según la Guía § Plan de implementación)

1. **Antes del viernes:** `.gitignore` + `AI_USAGE.md` + `/prompts` + esqueleto de la API,
   tablas y liquidación simulada (Rol 2); `api/scripts/primer-cobro.ts` corriendo contra la
   Test Wallet (Rol 1, hito viernes 14:00).
2. **Viernes:** estados y validación del punto (Rol 3); conexión con datos falsos (Rol 4);
   cuentas de demo (Rol 5).
3. **Sábado:** solo correcciones; repo público todo en `main` antes de las 11:00.
4. **Pruebas bloqueantes primero** (Hallazgos § 5): T-1/T-2 (P-05), T-4 (P-07), T-5 (hash),
   T-6 (P-08), T-7 (P-13) — sin ellas, el diseño del cobro puede cambiar.

---

## 8. Qué NO existe todavía

- ❌ Carpetas `api/` y `web/`, `package.json`, `tsconfig`, `.env` de aplicación, migraciones.
- ❌ Ninguna línea de código de producto (el repo es solo documentación).
- ✅ Existe y está organizado: `docs/` con los 5 documentos del equipo + Hallazgos + este
  documento + `docs/README.md` (índice).

El esqueleto se construye en la primera sesión de implementación siguiendo § 2, y este
documento se actualiza si el equipo cambia alguna decisión.

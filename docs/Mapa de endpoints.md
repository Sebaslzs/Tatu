# Mapa de endpoints

> Estado: 17 de octubre de 2026, rama `develop` (después del PR #9). Generado leyendo el código: las
> rutas de `server/src/**/rutas.ts` y `router.ts`, las llamadas de `web/src` y el documento OpenAPI
> (`/api/openapi.json`).

Todas las rutas van bajo `/api` (por ejemplo, `GET /programas` es `GET /api/programas`). Swagger UI
está en `/api/docs` y el contrato OpenAPI en `/api/openapi.json`.

## Resumen

| Concepto | Cantidad |
|---|---|
| Operaciones que expone la API | **46** (más `/openapi.json` y `/docs`) |
| Documentadas en Swagger | **46 de 46** |
| Las usa la web | **28** |
| Las usa el navegador al volver del banco | 2 |
| Las usa la propia API por HTTP (servicios simulados) | 11 |
| Sin uso actual en la web | 5 |

## Todas las operaciones, por módulo

| Módulo | Operación | Quién la usa |
|---|---|---|
| Sistema | `GET /salud` | Monitoreo (sin uso en la web) |
| Sistema | `GET /estado` | Diagnóstico (sin uso en la web) |
| Sistema | `GET /config` | Web: entidad y punto |
| Entidades | `GET /entidades` | Web: entidad |
| Programas | `GET /programas` | Web: entidad |
| Programas | `POST /programas` | Web: entidad |
| Programas | `GET /programas/{id}` | Web: entidad |
| Programas | `PATCH /programas/{id}` | Web: entidad |
| Programas | `GET /programas/{id}/liquidacion` | Web: entidad |
| Programas | `POST /programas/{id}/autorizar` | Web: entidad |
| Programas | `GET /callback/{id}` | Navegador, al volver del banco |
| Programas | `POST /programas/{id}/cancelar-aprobacion` | Web: entidad |
| Programas | `GET /programas/{id}/tablero` | Web: entidad |
| Programas | `POST /programas/{id}/pausar` | Web: entidad |
| Programas | `POST /programas/{id}/reanudar` | Web: entidad |
| Programas | `POST /programas/{id}/cerrar` | Web: entidad |
| Billeteras | `GET /billeteras/resolver` | Web: entidad |
| Puntos | `GET /puntos` | Web: punto |
| Puntos | `POST /puntos` | Web: entidad |
| Puntos | `GET /puntos/{id}/pagos` | Web: punto |
| Puntos | `GET /puntos/{id}/cobros` | Web: punto |
| Puntos | `GET /puntos/{id}/resumen` | Web: punto |
| Beneficiarios | `GET /beneficiarios` | Web: entidad |
| Beneficiarios | `POST /beneficiarios` | Web: entidad |
| Beneficiarios | `GET /beneficiarios/demo` | Sin uso en la web |
| Beneficiarios | `POST /beneficiarios/{documento}/pin` | Sin uso en la web |
| Beneficiarios | `GET /beneficiarios/{documento}/resumen` | Web: beneficiario |
| Cuentas | `POST /cuentas` | Web: beneficiario |
| Cuentas | `GET /cuentas/llaves/{tipo}/{valor}` | Web: beneficiario |
| Cuentas | `GET /cuentas/callback/{id}` | Navegador, al volver del banco |
| Cuentas | `GET /cuentas/{documento}` | Sin uso en la web |
| Cobros | `POST /cobros` | Web: punto y beneficiario |
| Cobros | `GET /cobros/{id}` | Web: entidad, punto y beneficiario |
| Cobros | `POST /cobros/{id}/confirmar` | Web: punto |
| Cobros | `POST /cobros/{id}/cancelar` | Web: punto |
| Liquidación (simulada) | `GET /liquidacion/programas/{programaId}/resumen` | La API |
| Liquidación (simulada) | `GET /liquidacion/programas/{programaId}/pagos/{documento}` | La API |
| Liquidación (simulada) | `GET /liquidacion/personas` | La API |
| Liquidación (simulada) | `POST /liquidacion/personas` | La API |
| Liquidación (simulada) | `POST /liquidacion/personas/{documento}/pin` | La API |
| Liquidación (simulada) | `POST /liquidacion/pin/validar` | La API |
| Banco puente Bre-B (simulado) | `GET /puente/llaves/{tipo}/{valor}` | La API |
| Banco puente Bre-B (simulado) | `DELETE /puente/llaves/{tipo}/{valor}` | La API |
| Banco puente Bre-B (simulado) | `POST /puente/llaves/{tipo}/{valor}/pertenece` | La API |
| Banco puente Bre-B (simulado) | `GET /puente/llaves` | La API |
| Banco puente Bre-B (simulado) | `POST /puente/llaves` | La API |

## 1. Entidad (web: `web/src/vistas/entidad/`)

| Operación | Pantalla que la usa |
|---|---|
| `GET /entidades` | `ConectarPrograma`, encabezado (`MarcoEntidad`) |
| `GET /programas` | `ListaProgramas` |
| `POST /programas` | `ConectarPrograma` |
| `GET /programas/{id}` | `AprobarEnBanco`, `ConectarPrograma`, tablero (`useTablero`), `BeneficiariosPrograma` |
| `PATCH /programas/{id}` | `ConectarPrograma` (editar un borrador) |
| `GET /programas/{id}/liquidacion` | `AprobarEnBanco`, `ConectarPrograma` |
| `POST /programas/{id}/autorizar` | `AprobarEnBanco` |
| `POST /programas/{id}/cancelar-aprobacion` | `AprobarEnBanco` |
| `GET /programas/{id}/tablero` | `ListaProgramas`, `Tablero` |
| `POST /programas/{id}/pausar` · `/reanudar` | `Tablero` |
| `POST /programas/{id}/cerrar` | `CerrarPrograma` |
| `GET /billeteras/resolver` | `ConectarPrograma` (validar la wallet) |
| `POST /puntos` | `ConectarPrograma` (registrar un punto) |
| `GET /beneficiarios` | `BeneficiariosPrograma` |
| `POST /beneficiarios` | `FormularioPersona`, `SubirPersonas` (Excel o CSV) |
| `GET /cobros/{id}` | `DetalleCobro` (consulta cada 2 s) |
| `GET /config` | `ConectarPrograma` |

## 2. Punto de pago (web: `web/src/api/punto.ts`, `vistas/punto/`)

| Operación | Pantalla que la usa |
|---|---|
| `GET /puntos` | Entrada del punto (`EntrarPunto`), `RutasPunto` |
| `GET /puntos/{id}/pagos` | Nuevo cobro, `VentaConBono` |
| `GET /puntos/{id}/cobros` | Cobros de hoy, `MiCaja` |
| `GET /puntos/{id}/resumen` | `MiCaja` |
| `POST /cobros` (retiro o compra) | Nuevo cobro, `VentaConBono` |
| `GET /cobros/{id}` | `CobroEnPunto` (consulta cada segundo) |
| `POST /cobros/{id}/confirmar` | `CobroEnPunto`: `{ metodo }` (rostro o huella) en un retiro, `{ pin }` en una compra con bono |
| `POST /cobros/{id}/cancelar` | `CobroEnPunto` |
| `GET /config` | `CobroEnPunto` |

## 3. Beneficiario (web: `web/src/api/beneficiario.ts`, `vistas/beneficiario/`)

| Operación | Pantalla que la usa |
|---|---|
| `GET /beneficiarios/{documento}/resumen` | Entrada (`EntrarBeneficiario`), mis subsidios |
| `GET /cuentas/llaves/{tipo}/{valor}` | `EnlazarCuenta` («¿Eres Ana M*** R***?») |
| `POST /cuentas` | `EnlazarCuenta` |
| `POST /cobros` (a la cuenta) | `Cobro` |
| `GET /cobros/{id}` | `Cobro` |

## 4. Las usa el navegador al volver del banco

No las llama el código de la web: la Interledger Test Wallet redirige al navegador a estas rutas, y
la API responde con un `302` hacia la web.

| Operación | Para qué |
|---|---|
| `GET /callback/{id}` | Fin de la aprobación del permiso de un programa |
| `GET /cuentas/callback/{id}` | Fin de la verificación de una cuenta en el banco |

## 5. Servicios simulados (la API los consume por HTTP)

La liquidación del gobierno y el banco puente de Bre-B son servicios aparte que, en la demo, viven en
la misma API. Tatú los llama por `LIQUIDACION_URL` y `PUENTE_URL`; la web no los usa. Los scripts de
datos de prueba (`server/scripts/poblar.mjs`) también los usan.

| Operación | Quién la usa dentro de la API |
|---|---|
| `GET /liquidacion/programas/{programaId}/resumen` | Programas (tope al autorizar), tablero |
| `GET /liquidacion/programas/{programaId}/pagos/{documento}` | Cobros, resumen del beneficiario, pagos del punto |
| `GET /liquidacion/personas` · `POST /liquidacion/personas` | Nombres y PIN; registro de personas |
| `POST /liquidacion/personas/{documento}/pin` | Poner o cambiar el PIN |
| `POST /liquidacion/pin/validar` | Confirmar un cobro con PIN |
| `GET /puente/llaves/{tipo}/{valor}` | Enlazar una llave y resolverla antes de pagar |
| `POST /puente/llaves/{tipo}/{valor}/pertenece` | Verificar que la llave sea de la persona |
| `GET /puente/llaves` · `POST /puente/llaves` | Llaves de una persona; registrarlas |
| `DELETE /puente/llaves/{tipo}/{valor}` | Borrar una llave (equipo de prueba) |

## 6. Sin uso actual en la web

Existen, funcionan y están documentadas, pero ninguna pantalla las llama hoy.

| Operación | Comentario |
|---|---|
| `GET /beneficiarios/demo` | Selector de personas: la entrada del beneficiario pide la cédula a mano |
| `POST /beneficiarios/{documento}/pin` | Poner el PIN desde Tatú: hoy se pone al registrar la persona |
| `GET /cuentas/{documento}` | Estado de la cuenta mientras se aprueba en el banco |
| `GET /estado` | Diagnóstico: pagos reales o simulados, base y puente |
| `GET /salud` | Chequeo de salud del despliegue |

## 7. Observaciones

1. **La web manda `cedula`** en `GET /puntos/{id}/pagos`, `POST /cuentas` y `POST /cobros`. La API
   acepta `cedula` y `documento` como el mismo campo.
2. **`POST /cobros/{id}/confirmar` tiene dos cuerpos válidos:** `{ metodo }` para la biometría del
   retiro y `{ pin }` para la compra con bono.
3. **La web tiene dos clientes HTTP** (`api/http.ts` y `api/client.ts`), y `listarPuntos` está
   repetido en `api/punto.ts` y `api/client.ts`. Conviene dejar uno solo.
4. **Consultas frecuentes:** `GET /cobros/{id}` (cada 1 a 2 s) y `GET /programas/{id}/tablero`. Las
   dos reconcilian con el banco; están protegidas para que varias instancias de Vercel no paguen ni
   roten el token a la vez.

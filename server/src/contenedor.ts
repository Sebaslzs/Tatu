// Raíz de composición: el único lugar que decide qué implementación recibe cada servicio.
// main.ts y las pruebas lo usan con distintas piezas (p. ej. billeteras falsas).
import type { PuertoBilleteras } from './comun/billeteras.ts'
import { relojDelSistema, type Reloj } from './comun/fechas.ts'
import type { Config } from './config.ts'
import type { Db } from './db/conexion.ts'
import { crearUnidadDeTrabajo, type UnidadDeTrabajo } from './db/unidadDeTrabajo.ts'
import type { ConfigPublica } from './extras.ts'
import { ClienteLiquidacion } from './liquidacion/cliente.ts'
import type { PuertoLiquidacion } from './liquidacion/contrato.ts'
import { LiquidacionSimulada } from './liquidacion/simulador.ts'
import { OpenPaymentsService } from './openPaymentsService.ts'
import { ServicioProgramas } from './programas/servicio.ts'
import { ServicioPuntos } from './puntos/servicio.ts'

export interface Contenedor {
  config: ConfigPublica
  uow: UnidadDeTrabajo
  programas: ServicioProgramas
  puntos: ServicioPuntos
  simuladorLiquidacion: LiquidacionSimulada
}

export interface PiezasContenedor {
  db: Db
  config: Config
  billeteras?: PuertoBilleteras
  liquidacion?: PuertoLiquidacion
  simuladorLiquidacion?: LiquidacionSimulada
  reloj?: Reloj
}

export function crearContenedor(piezas: PiezasContenedor): Contenedor {
  const { config } = piezas
  const uow = crearUnidadDeTrabajo(piezas.db)
  const billeteras = piezas.billeteras ?? new OpenPaymentsService(config)
  const liquidacion =
    piezas.liquidacion ?? new ClienteLiquidacion({ baseUrl: config.LIQUIDACION_URL, timeoutMs: config.LIQUIDACION_TIMEOUT_MS })

  return {
    config,
    uow,
    simuladorLiquidacion: piezas.simuladorLiquidacion ?? new LiquidacionSimulada(),
    programas: new ServicioProgramas({
      uow,
      billeteras,
      liquidacion,
      reloj: piezas.reloj ?? relojDelSistema,
      aprobacionTtlMs: config.APROBACION_TTL_MIN * 60_000,
      bonoHabilitado: config.EXTRA_BONO,
    }),
    puntos: new ServicioPuntos({ uow, billeteras }),
  }
}

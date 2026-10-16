// Raíz de composición: el único lugar que decide qué implementación recibe cada servicio.
// main.ts y las pruebas lo usan con distintas piezas (p. ej. billeteras, permisos y pagos falsos).
import { PagosPendientes } from './beneficiarios/pagosPendientes.ts'
import { ConsultaResumenBeneficiario } from './beneficiarios/resumen.ts'
import { ServicioBeneficiarios } from './beneficiarios/servicio.ts'
import { ConfirmacionCobro } from './cobros/confirmacion.ts'
import { MovimientosCobro } from './cobros/movimientos.ts'
import { PagadorCobros } from './cobros/pagador.ts'
import type { PuertoPagos } from './cobros/puertos.ts'
import { ServicioCobros } from './cobros/servicio.ts'
import { SolicitudCobro } from './cobros/solicitud.ts'
import { VistasCobro } from './cobros/vista.ts'
import type { PuertoBilleteras } from './comun/billeteras.ts'
import { relojDelSistema, type Reloj } from './comun/fechas.ts'
import type { Config } from './config.ts'
import type { PuertoVerificacionCuenta } from './cuentas/puertos.ts'
import { ServicioCuentas } from './cuentas/servicio.ts'
import type { Db } from './db/conexion.ts'
import { crearUnidadDeTrabajo, type UnidadDeTrabajo } from './db/unidadDeTrabajo.ts'
import type { ConfigPublica } from './extras.ts'
import { ClienteLiquidacion } from './liquidacion/cliente.ts'
import type { PuertoLiquidacion } from './liquidacion/contrato.ts'
import { LiquidacionSimulada } from './liquidacion/simulador.ts'
import { OpenPaymentsService } from './openPaymentsService.ts'
import { ServicioAutorizacion } from './programas/autorizacion.ts'
import { CicloPrograma } from './programas/ciclo.ts'
import { LectorProgramas } from './programas/lector.ts'
import { ServicioPermisoToken } from './programas/permisoToken.ts'
import type { PuertoPermisos } from './programas/puertos.ts'
import type { ServiciosProgramas } from './programas/rutas.ts'
import { ServicioProgramas } from './programas/servicio.ts'
import { Transiciones } from './programas/transiciones.ts'
import { ClientePuente } from './puente/cliente.ts'
import type { PuertoPuente } from './puente/contrato.ts'
import { PuenteSimulado } from './puente/simulador.ts'
import { ConsultasPunto } from './puntos/consultas.ts'
import { ServicioPuntos } from './puntos/servicio.ts'

export interface Contenedor {
  config: ConfigPublica
  uow: UnidadDeTrabajo
  programas: ServiciosProgramas
  puntos: ServicioPuntos
  consultasPunto: ConsultasPunto
  cuentas: ServicioCuentas
  beneficiarios: ServicioBeneficiarios
  resumenBeneficiario: ConsultaResumenBeneficiario
  cobros: ServicioCobros
  token: ServicioPermisoToken
  simuladorLiquidacion: LiquidacionSimulada
  simuladorPuente: PuenteSimulado
}

export interface PiezasContenedor {
  db: Db
  config: Config
  billeteras?: PuertoBilleteras
  permisos?: PuertoPermisos
  verificacion?: PuertoVerificacionCuenta
  pagos?: PuertoPagos
  liquidacion?: PuertoLiquidacion
  puente?: PuertoPuente
  simuladorLiquidacion?: LiquidacionSimulada
  simuladorPuente?: PuenteSimulado
  reloj?: Reloj
  nuevoNonce?: () => string
}

export function crearContenedor(piezas: PiezasContenedor): Contenedor {
  const { config } = piezas
  const reloj = piezas.reloj ?? relojDelSistema
  const uow = crearUnidadDeTrabajo(piezas.db)
  const openPayments = new OpenPaymentsService(config)
  const billeteras = piezas.billeteras ?? openPayments
  const permisos = piezas.permisos ?? openPayments
  const verificacion = piezas.verificacion ?? openPayments
  const pagos = piezas.pagos ?? openPayments
  const liquidacion =
    piezas.liquidacion ?? new ClienteLiquidacion({ baseUrl: config.LIQUIDACION_URL, timeoutMs: config.LIQUIDACION_TIMEOUT_MS })
  const puente = piezas.puente ?? new ClientePuente({ baseUrl: config.PUENTE_URL, timeoutMs: config.PUENTE_TIMEOUT_MS })

  // Programas
  const lector = new LectorProgramas(uow)
  const transiciones = new Transiciones({ uow, lector, permisos, reloj, aprobacionTtlMs: config.APROBACION_TTL_MIN * 60_000 })
  const token = new ServicioPermisoToken({ uow, lector, permisos, reloj })

  // Cuentas
  const cuentas = new ServicioCuentas({
    uow,
    puente,
    liquidacion,
    billeteras,
    verificacion,
    reloj,
    modoVerificacion: config.VERIFICACION_CUENTA,
    verificacionTtlMs: config.APROBACION_TTL_MIN * 60_000,
    apiBaseUrl: config.API_BASE_URL,
    appBaseUrl: config.APP_BASE_URL,
  })

  // Cobros
  const movimientos = new MovimientosCobro(uow)
  const vistas = new VistasCobro(uow, liquidacion, { confirmacionTtlSeg: config.CONFIRMACION_TTL_SEG, pinMaxIntentos: config.PIN_MAX_INTENTOS })
  const pagador = new PagadorCobros({ uow, movimientos, pagos, token })
  const confirmacion = new ConfirmacionCobro({
    uow,
    liquidacion,
    movimientos,
    vistas,
    pagador,
    reloj,
    confirmacionTtlSeg: config.CONFIRMACION_TTL_SEG,
    pinMaxIntentos: config.PIN_MAX_INTENTOS,
    pinBloqueoMin: config.PIN_BLOQUEO_MIN,
  })
  const solicitud = new SolicitudCobro({ uow, lector, liquidacion, cuentas, billeteras, vistas, pagador, reloj })
  const pagosPendientes = new PagosPendientes({ uow, liquidacion, reloj })

  return {
    config,
    uow,
    token,
    simuladorLiquidacion: piezas.simuladorLiquidacion ?? new LiquidacionSimulada(),
    simuladorPuente: piezas.simuladorPuente ?? new PuenteSimulado(),
    cuentas,
    beneficiarios: new ServicioBeneficiarios({ uow, liquidacion, puente, billeteras, reloj }),
    resumenBeneficiario: new ConsultaResumenBeneficiario({ uow, pagosPendientes, vistas }),
    cobros: new ServicioCobros({ solicitud, confirmacion, pagador, movimientos, vistas }),
    programas: {
      programas: new ServicioProgramas({ uow, billeteras, liquidacion, lector, transiciones, bonoHabilitado: config.EXTRA_BONO }),
      autorizacion: new ServicioAutorizacion({
        uow,
        lector,
        transiciones,
        permisos,
        liquidacion,
        reloj,
        apiBaseUrl: config.API_BASE_URL,
        appBaseUrl: config.APP_BASE_URL,
        ...(piezas.nuevoNonce ? { nuevoNonce: piezas.nuevoNonce } : {}),
      }),
      ciclo: new CicloPrograma({ lector, transiciones }),
    },
    puntos: new ServicioPuntos({ uow, billeteras }),
    consultasPunto: new ConsultasPunto({ uow, pagosPendientes, vistas, reloj }),
  }
}

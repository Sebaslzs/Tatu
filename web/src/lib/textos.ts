// Nombres en español sencillo, fechas y horas. Los mensajes de rechazo los manda la API.
import type { EstadoCobro, EstadoPrograma } from '@/api/tipos'

/** Las vigencias se guardan como días completos en Bogotá (UTC−5, sin horario de verano). */
const ZONA = 'America/Bogota'

export const NOMBRE_ESTADO_COBRO: Record<EstadoCobro, string> = {
  Solicitado: 'Solicitado',
  PorConfirmar: 'Por confirmar',
  Pagando: 'Pagando',
  Pagado: 'Pagado',
  Rechazado: 'Rechazado',
  Fallido: 'Fallido',
}

export const NOMBRE_ESTADO_PROGRAMA: Record<EstadoPrograma, string> = {
  Borrador: 'Borrador',
  EsperandoAprobacion: 'Esperando aprobación',
  Activo: 'Activo',
  Pausado: 'Pausado',
  Cerrado: 'Cerrado',
}

/** Texto corto del motivo para la etiqueta del tablero: «Rechazado · ya cobrado». */
export const MOTIVO_CORTO: Record<string, string> = {
  YaCobrado: 'ya cobrado',
  EnProceso: 'en proceso',
  TopeSuperado: 'tope del banco',
  ProgramaCerrado: 'programa cerrado',
  SinPagoDisponible: 'sin pago',
  CuentaNoVerificada: 'cuenta sin verificar',
  PinBloqueado: 'PIN bloqueado',
  TiempoAgotado: 'tiempo agotado',
  ProgramaNoRecibe: 'programa en pausa',
  SinFondos: 'sin fondos',
  LiquidacionNoResponde: 'liquidación sin respuesta',
  PermisoVencido: 'permiso vencido',
  Cancelado: 'cancelado',
  ErrorPago: 'error del banco',
  LlaveNoExiste: 'llave Bre-B borrada',
  PuenteNoResponde: 'Bre-B sin respuesta',
  ComercioNoAutorizado: 'comercio no autorizado',
  SoloEnComercios: 'solo en comercios',
}

/** Explicación debajo del mensaje de la API en el resultado de un cobro (wireframes 17 a 19). */
export function explicacionMotivo(codigo: string | undefined, estado: EstadoCobro): string {
  switch (codigo) {
    case 'YaCobrado':
      return 'Esta cédula ya cobró en este programa. No se creó ningún pago.'
    case 'EnProceso':
      return 'Hay otro cobro de esta cédula en curso. No se creó un pago nuevo.'
    case 'TopeSuperado':
      return 'La cuenta del programa no autorizó más pagos. La plata no se movió.'
    case 'ProgramaCerrado':
      return 'La entidad cerró este subsidio y revocó el permiso. No se creó ningún pago.'
    case 'ProgramaNoRecibe':
      return 'La entidad pausó los cobros por ahora. No se creó ningún pago.'
    case 'PinBloqueado':
      return 'Se equivocó 3 veces con el PIN. Puede intentarlo de nuevo en 15 minutos. No se movió dinero.'
    case 'TiempoAgotado':
      return 'El PIN no se confirmó a tiempo. Empieza un cobro nuevo. No se movió dinero.'
    case 'SinFondos':
      return 'La cuenta del programa no tiene saldo en este momento. La plata no se movió.'
    case 'PermisoVencido':
      return 'La entidad debe aprobar de nuevo el permiso en su banco. La plata no se movió.'
    case 'LiquidacionNoResponde':
      return 'Intenta de nuevo en un momento. No se creó ningún pago.'
    case 'Cancelado':
      return 'Puedes empezar un cobro nuevo cuando quieras.'
    case 'CuentaNoVerificada':
      return 'La cuenta todavía no está verificada. No se movió dinero.'
    case 'ErrorPago':
      return 'Intenta de nuevo en unos minutos. Si se repite, avisa a la entidad.'
    case 'ComercioNoAutorizado':
      return 'El bono solo se acepta en comercios verificados de sus categorías. Cobra la compra completa por otro medio.'
    case 'SoloEnComercios':
      return 'Es un bono con destino: no se entrega en efectivo ni va a la cuenta. Se usa al pagar en un comercio autorizado.'
    case 'SinPagoDisponible':
      return 'Revisa el número de la cédula. No se creó ningún pago.'
    default:
      return estado === 'Fallido' ? 'El pago no se completó. La plata no se movió.' : 'No se creó ningún pago.'
  }
}

/** «16 de octubre de 2026» a partir de un instante ISO o de «2026-10-16», en Bogotá. */
export function formatFecha(iso: string): string {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00-05:00`) : new Date(iso)
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONA })
}

/** El día en Bogotá de un instante ISO, como «2026-12-31» (para un <input type="date">). */
export function diaEnBogota(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10)
}

/** Hoy en Bogotá, «2026-10-16». */
export function hoyEnBogota(): string {
  return diaEnBogota(new Date().toISOString())
}

/** «15:02:07» */
export function formatHora(iso: string, conSegundos = true): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: conSegundos ? '2-digit' : undefined,
    hour12: false,
    timeZone: ZONA,
  })
}

/** «16 de octubre de 2026, 15:02» */
export function formatFechaHora(iso: string): string {
  return `${formatFecha(iso)}, ${formatHora(iso, false)}`
}

/** https://ilp.interledger-test.dev/ana → …/ana */
export function billeteraCorta(url: string): string {
  const limpia = url.replace(/\/+$/, '')
  const i = limpia.lastIndexOf('/')
  return i > limpia.indexOf('//') + 1 ? `…${limpia.slice(i)}` : limpia
}

export function plural(n: number, singular: string, pluralTexto = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`
}

/** «2,4 s» */
export function formatSegundos(s: number): string {
  return `${s.toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`
}

/** 114 → «01:54» (lo que falta para confirmar con el PIN) */
export function formatCuentaRegresiva(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «2026-10-31» → «31 oct», para «Hasta el 31 oct». */
export function formatDiaMesCorto(fecha: string): string {
  const [, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1]}`
}

/** «52418300» → «52 418 300» */
export function conEspacios(documento: string): string {
  return documento.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

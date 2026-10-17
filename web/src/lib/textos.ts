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

/** «52418300» → «52 418 300» */
export function conEspacios(documento: string): string {
  return documento.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// Reglas de negocio del cobro como funciones puras: sin red ni base de datos, con tablas de casos.
// RN-08 vive en programas/autorizacion.ts; RN-09 no se valida aquí (lo hace el banco, CA-02.07).
import type { Moneda } from '../comun/montos.ts'
import type { Canal } from '../programas/reglas.ts'
import type { EstadoCobro } from './estados.ts'
import type { Motivo } from './mensajes.ts'

/** Una regla que se cumple devuelve null; si no, el motivo del rechazo. */
export type Resultado = Motivo | null

/** RN-01 · la cédula tiene un pago disponible en la liquidación del programa. */
export function rn01PagoDisponible(pago: { disponible: boolean } | null): Resultado {
  return pago?.disponible ? null : 'SinPagoDisponible'
}

/** RN-02 · un solo cobro vivo o pagado por persona y programa (la base lo arbitra; esto decide el mensaje). */
export function rn02CobroExistente(estadoExistente: EstadoCobro | null): Resultado {
  if (!estadoExistente) return null
  return estadoExistente === 'Pagado' ? 'YaCobrado' : 'EnProceso'
}

/** RN-03 · destino libre: cuenta y retiro · destino restringido (bono): solo compra en comercios autorizados. */
export function rn03CanalPermitido(args: { destino: 'libre' | 'restringido'; canal: Canal; puntoAutorizado?: boolean }): Resultado {
  if (args.destino === 'libre') return args.canal === 'cuenta' || args.canal === 'retiro' ? null : 'ProgramaNoRecibe'
  if (args.canal !== 'compra') return 'SoloEnComercios'
  return args.puntoAutorizado ? null : 'ComercioNoAutorizado'
}

/** RN-04 · el canal cuenta exige una cuenta Verificada y en la misma moneda del programa. */
export function rn04CuentaLista(args: { cuenta: { estado: string } | null; monedaCuenta: Moneda | null; monedaPrograma: Moneda }): Resultado {
  if (!args.cuenta || args.cuenta.estado !== 'Verificada') return 'CuentaNoVerificada'
  const { monedaCuenta, monedaPrograma } = args
  if (!monedaCuenta || monedaCuenta.assetCode !== monedaPrograma.assetCode || monedaCuenta.assetScale !== monedaPrograma.assetScale) {
    return 'CuentaNoVerificada'
  }
  return null
}

/** RN-05 · el monto lo calcula el backend: subsidio = valor completo; bono = min(valor, total de la compra). */
export function rn05Monto(args: { tipo: 'subsidio' | 'bono'; valorDisponible: number; totalCompra?: number | undefined }): number {
  if (!Number.isSafeInteger(args.valorDisponible) || args.valorDisponible <= 0) throw new Error('Valor disponible inválido')
  if (args.tipo === 'subsidio') return args.valorDisponible
  if (!args.totalCompra || !Number.isSafeInteger(args.totalCompra) || args.totalCompra <= 0) {
    throw new Error('Un bono necesita el total de la compra')
  }
  return Math.min(args.valorDisponible, args.totalCompra)
}

/** RN-06 · el programa está Activo y dentro de su vigencia; uno Cerrado rechaza todo cobro. */
export function rn06ProgramaRecibe(args: { estado: string; vigenciaInicio: string; vigenciaFin: string; ahora: Date }): Resultado {
  if (args.estado === 'Cerrado') return 'ProgramaCerrado'
  if (args.estado !== 'Activo') return 'ProgramaNoRecibe'
  const t = args.ahora.getTime()
  if (t < Date.parse(args.vigenciaInicio) || t > Date.parse(args.vigenciaFin)) return 'ProgramaNoRecibe'
  return null
}

export type ResultadoPin =
  | { resultado: 'correcto' }
  | { resultado: 'incorrecto'; intentos: number; restantes: number }
  | { resultado: 'bloqueado'; intentos: number }

/** RN-07 · el PIN lo valida la liquidación; al último intento fallido, rechazado y bloqueo de la cédula. */
export function rn07EvaluarPin(args: { valido: boolean; intentosPrevios: number; maxIntentos: number }): ResultadoPin {
  if (args.valido) return { resultado: 'correcto' }
  const intentos = args.intentosPrevios + 1
  if (intentos >= args.maxIntentos) return { resultado: 'bloqueado', intentos }
  return { resultado: 'incorrecto', intentos, restantes: args.maxIntentos - intentos }
}

/** RN-07 · la persona está bloqueada en el programa mientras no pase `bloqueadoHasta`. */
export function rn07Bloqueada(args: { bloqueadoHasta: string | null; ahora: Date }): boolean {
  return args.bloqueadoHasta !== null && args.ahora.getTime() < Date.parse(args.bloqueadoHasta)
}

/** RN-11 · todo monto se valida en el backend: entero positivo en unidades mínimas. */
export function rn11MontoValido(args: { monto: string; escala: number }): boolean {
  return /^\d+$/.test(args.monto) && BigInt(args.monto) > 0n && Number.isInteger(args.escala) && args.escala >= 0
}

/** RN-12 · un cobro PorConfirmar sin PIN en N segundos pasa a Rechazado (se evalúa al consultar). */
export function rn12Vencio(args: { estado: EstadoCobro; desde: string; ahora: Date; ttlSeg: number }): boolean {
  return args.estado === 'PorConfirmar' && args.ahora.getTime() - Date.parse(args.desde) > args.ttlSeg * 1000
}

export function confirmarAntesDe(desde: string, ttlSeg: number): string {
  return new Date(Date.parse(desde) + ttlSeg * 1000).toISOString()
}

/**
 * RN-10 · el pago saliente no tiene estado: Pagado si no falló y envió todo, o si el pago entrante se
 * completó; Fallido si falló; si no se sabe, sigue Pagando.
 */
export function rn10Resultado(args: {
  saliente: { fallido: boolean; debitado: string; enviado: string } | null
  entrante?: { completado: boolean; recibido: string; esperado?: string | undefined } | null
}): 'Pagado' | 'Fallido' | 'Pagando' {
  if (args.saliente?.fallido) return 'Fallido'
  if (args.saliente && BigInt(args.saliente.enviado) >= BigInt(args.saliente.debitado)) return 'Pagado'
  const e = args.entrante
  if (e && (e.completado || (e.esperado !== undefined && BigInt(e.recibido) >= BigInt(e.esperado)))) return 'Pagado'
  return 'Pagando'
}

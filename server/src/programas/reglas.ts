// Reglas puras del programa (sin red ni base de datos): se prueban con tablas de casos.
import { conflicto, entradaInvalida } from '../comun/errores.ts'
import type { Destino, EstadoPrograma, TipoPrograma } from './estados.ts'

export type Canal = 'cuenta' | 'retiro' | 'compra'

export const MAX_CATEGORIAS = 10

/** CA-01.01 y CA-01.05: el subsidio es de destino libre; el bono, restringido. */
export function destinoDe(tipo: TipoPrograma): Destino {
  return tipo === 'subsidio' ? 'libre' : 'restringido'
}

/** CA-01.01: el subsidio se cobra a la cuenta y en el punto de retiro; el bono, en compras. */
export function canalesDe(tipo: TipoPrograma): Canal[] {
  return tipo === 'subsidio' ? ['cuenta', 'retiro'] : ['compra']
}

/** CA-01.04: la vigencia debe terminar después de empezar. */
export function vigenciaValida(inicio: Date, fin: Date): boolean {
  return fin.getTime() > inicio.getTime()
}

export function exigirVigencia(inicio: Date, fin: Date): void {
  if (!vigenciaValida(inicio, fin)) throw entradaInvalida('vigenciaFin: la vigencia debe terminar después de empezar')
}

/** CA-01.06: solo un programa en Borrador se edita. */
export function exigirEditable(estado: EstadoPrograma): void {
  if (estado !== 'Borrador') {
    throw conflicto('EstadoNoPermite', `El programa está en ${estado}; solo se edita en Borrador`)
  }
}

/** CA-01.05: un bono sin categorías no se puede autorizar (lo usa la autorización, HU-04). */
export function exigirAutorizable(programa: { tipo: TipoPrograma; categorias: readonly string[] }): void {
  if (programa.tipo === 'bono' && programa.categorias.length === 0) {
    throw conflicto('BonoSinCategorias', 'Elige al menos una categoría de comercio que acepte el bono')
  }
}

/** CA-01.08 / HU-05: una aprobación pedida hace más del TTL ya venció. */
export function aprobacionVencida(
  programa: { estado: EstadoPrograma; aprobacionSolicitadaEn: string | null },
  ahora: Date,
  ttlMs: number,
): boolean {
  if (programa.estado !== 'EsperandoAprobacion' || !programa.aprobacionSolicitadaEn) return false
  return ahora.getTime() - Date.parse(programa.aprobacionSolicitadaEn) > ttlMs
}

interface EstadoPermiso {
  estado: EstadoPrograma
  tokenAcceso: string | null
  permisoVencidoEn: string | null
}

/** CA-01.08: hay un permiso usable en el banco. */
export function permisoActivo(p: EstadoPermiso): boolean {
  return p.tokenAcceso !== null && p.permisoVencidoEn === null
}

/** CA-01.08: el programa estaba cobrando y el banco ya no acepta su permiso. */
export function permisoVencido(p: EstadoPermiso): boolean {
  return (p.estado === 'Activo' || p.estado === 'Pausado') && p.permisoVencidoEn !== null
}

import type { EstadoCobro, EstadoPrograma } from '@/api/tipos'

/** A dónde va la entidad según el estado de su programa. */
export function rutaDelPrograma(id: string, estado: EstadoPrograma): string {
  switch (estado) {
    case 'Borrador':
      return `/entidad/programas/${id}/editar`
    case 'EsperandoAprobacion':
      return `/entidad/programas/${id}/aprobar`
    default:
      return `/entidad/programas/${id}`
  }
}

/** Autorizado y cobrado solo existen cuando el permiso ya se aprobó. */
export function tienePermiso(estado: EstadoPrograma): boolean {
  return estado === 'Activo' || estado === 'Pausado' || estado === 'Cerrado'
}

export function esEstadoFinal(estado: EstadoCobro | undefined): boolean {
  return estado === 'Pagado' || estado === 'Rechazado' || estado === 'Fallido'
}

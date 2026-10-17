// Estados y tipos del programa, tomados de los enums de la base (fuente de verdad: Supabase).
import { destinoPrograma, estadoPrograma, tipoPrograma } from '../db/generado/schema.ts'

export type EstadoPrograma = (typeof estadoPrograma.enumValues)[number]
export type TipoPrograma = (typeof tipoPrograma.enumValues)[number]
export type Destino = (typeof destinoPrograma.enumValues)[number]

export const TIPOS_PROGRAMA = tipoPrograma.enumValues

const TRANSICIONES: Record<EstadoPrograma, readonly EstadoPrograma[]> = {
  Borrador: ['EsperandoAprobacion'],
  // Aprobado → Activo; rechazado o vencido → vuelve a Borrador (HU-05)
  EsperandoAprobacion: ['Activo', 'Borrador'],
  Activo: ['Pausado', 'Cerrado'],
  Pausado: ['Activo', 'Cerrado'],
  Cerrado: [],
}

export function puedeTransicionar(desde: EstadoPrograma, hacia: EstadoPrograma): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

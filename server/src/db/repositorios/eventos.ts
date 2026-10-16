// Registro de auditoría de solo inserción (HU-16, RNF-09).
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { evento } from '../generado/schema.ts'

export type FilaEvento = typeof evento.$inferSelect
export type TipoEntidadEvento = 'programa' | 'cuenta' | 'cobro' | 'beneficiario' | 'punto' | 'comercio' | 'entidad'

/**
 * Quién hizo el cambio: el rol y, si aplica, su id (`evento.actor` exige «rol» o «rol:uuid»). Nunca
 * la cédula.
 */
export type Actor = 'sistema' | 'entidad' | 'banco' | 'punto' | 'beneficiario' | `punto:${string}` | `beneficiario:${string}`

export interface NuevoEvento {
  tipoEntidad: TipoEntidadEvento
  idEntidad: string
  estadoAnterior?: string | null
  /** Sin estado nuevo cuando el evento no es una transición (p. ej. un callback inválido). */
  estadoNuevo?: string | null
  detalle: Record<string, unknown>
  actor?: Actor
}

export interface RepoEventos {
  registrar(nuevo: NuevoEvento): Promise<void>
  de(tipoEntidad: TipoEntidadEvento, idEntidad: string): Promise<FilaEvento[]>
  /** Los eventos de varias entidades en una consulta, en orden. */
  deVarias(tipoEntidad: TipoEntidadEvento, ids: readonly string[]): Promise<Map<string, FilaEvento[]>>
  /** El último evento que llevó la entidad a ese estado (para tiempos y para el cierre). */
  ultimoHacia(tipoEntidad: TipoEntidadEvento, idEntidad: string, estado: string): Promise<FilaEvento | undefined>
}

/** Ninguna clave del detalle puede parecer un secreto (CA-01.07, CA-16.03, RNF-09). */
const CLAVE_PROHIBIDA = /token|pin|llave|secret|private|password|nonce/i

export function exigirDetalleSeguro(detalle: unknown, ruta = 'detalle'): void {
  if (Array.isArray(detalle)) return detalle.forEach((v, i) => exigirDetalleSeguro(v, `${ruta}[${i}]`))
  if (detalle === null || typeof detalle !== 'object') return
  for (const [clave, valor] of Object.entries(detalle)) {
    if (CLAVE_PROHIBIDA.test(clave)) throw new Error(`El evento no puede guardar «${ruta}.${clave}»`)
    exigirDetalleSeguro(valor, `${ruta}.${clave}`)
  }
}

export const detalleDe = (e: FilaEvento): Record<string, unknown> => (e.detalle ?? {}) as Record<string, unknown>

/** Lo mismo que `ultimoHacia`, sobre una lista ya cargada. */
export const ultimoHaciaEn = (lista: readonly FilaEvento[] | undefined, estado: string): FilaEvento | undefined =>
  lista?.findLast((e) => e.estadoNuevo === estado)

export function repoEventos(db: Db): RepoEventos {
  return {
    async registrar({ tipoEntidad, idEntidad, estadoAnterior, estadoNuevo, detalle, actor }) {
      exigirDetalleSeguro(detalle)
      await db.insert(evento).values({
        tipoEntidad,
        idEntidad,
        estadoAnterior: estadoAnterior ?? null,
        estadoNuevo: estadoNuevo ?? null,
        detalle,
        actor: actor ?? 'sistema',
      })
    },

    de(tipoEntidad, idEntidad) {
      return db
        .select()
        .from(evento)
        .where(and(eq(evento.tipoEntidad, tipoEntidad), eq(evento.idEntidad, idEntidad)))
        .orderBy(asc(evento.id))
    },

    async deVarias(tipoEntidad, ids) {
      const mapa = new Map<string, FilaEvento[]>()
      if (!ids.length) return mapa
      const filas = await db
        .select()
        .from(evento)
        .where(and(eq(evento.tipoEntidad, tipoEntidad), inArray(evento.idEntidad, [...new Set(ids)])))
        .orderBy(asc(evento.id))
      for (const e of filas) mapa.set(e.idEntidad, [...(mapa.get(e.idEntidad) ?? []), e])
      return mapa
    },

    async ultimoHacia(tipoEntidad, idEntidad, estado) {
      const [fila] = await db
        .select()
        .from(evento)
        .where(and(eq(evento.tipoEntidad, tipoEntidad), eq(evento.idEntidad, idEntidad), eq(evento.estadoNuevo, estado)))
        .orderBy(desc(evento.id))
        .limit(1)
      return fila
    },
  }
}

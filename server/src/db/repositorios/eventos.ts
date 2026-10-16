// Registro de auditoría de solo inserción (HU-16, RNF-09).
import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { evento } from '../generado/schema.ts'

export type FilaEvento = typeof evento.$inferSelect
export type TipoEntidadEvento = 'programa' | 'cuenta' | 'cobro' | 'beneficiario' | 'punto' | 'comercio' | 'entidad'
export type Actor = 'sistema' | 'entidad' | 'beneficiario' | 'punto' | 'banco'

export interface NuevoEvento {
  tipoEntidad: TipoEntidadEvento
  idEntidad: string
  estadoAnterior?: string | null
  estadoNuevo: string
  detalle: Record<string, unknown>
  actor: Actor
}

export interface RepoEventos {
  registrar(nuevo: NuevoEvento): Promise<void>
  de(tipoEntidad: TipoEntidadEvento, idEntidad: string): Promise<FilaEvento[]>
}

/** Ninguna clave del detalle puede parecer un secreto (CA-01.07, RNF-09). */
const CLAVE_PROHIBIDA = /token|pin|llave|secret|private|password|nonce/i

export function exigirDetalleSeguro(detalle: unknown, ruta = 'detalle'): void {
  if (Array.isArray(detalle)) return detalle.forEach((v, i) => exigirDetalleSeguro(v, `${ruta}[${i}]`))
  if (detalle === null || typeof detalle !== 'object') return
  for (const [clave, valor] of Object.entries(detalle)) {
    if (CLAVE_PROHIBIDA.test(clave)) throw new Error(`El evento no puede guardar «${ruta}.${clave}»`)
    exigirDetalleSeguro(valor, `${ruta}.${clave}`)
  }
}

export function repoEventos(db: Db): RepoEventos {
  return {
    async registrar(nuevo) {
      exigirDetalleSeguro(nuevo.detalle)
      await db.insert(evento).values({ ...nuevo, estadoAnterior: nuevo.estadoAnterior ?? null })
    },
    de(tipoEntidad, idEntidad) {
      return db
        .select()
        .from(evento)
        .where(and(eq(evento.tipoEntidad, tipoEntidad), eq(evento.idEntidad, idEntidad)))
        .orderBy(asc(evento.id))
    },
  }
}

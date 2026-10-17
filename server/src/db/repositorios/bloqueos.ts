// RN-07: al tercer PIN errado la persona queda bloqueada en ese programa (HU-11). La base guarda
// hasta cuándo; si sigue vigente lo decide quien tiene el reloj.
import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { bloqueoPin } from '../generado/schema.ts'

export type FilaBloqueo = typeof bloqueoPin.$inferSelect

export interface RepoBloqueos {
  /** El bloqueo de la persona en el programa, venza o no. */
  de(programaId: string, beneficiarioId: string): Promise<FilaBloqueo | undefined>
  /** Bloquea hasta `hasta`; si ya tuvo un bloqueo, lo reemplaza. */
  bloquear(args: { programaId: string; beneficiarioId: string; cobroId: string; hasta: string }): Promise<void>
}

export function repoBloqueos(db: Db): RepoBloqueos {
  return {
    async de(programaId, beneficiarioId) {
      const [fila] = await db
        .select()
        .from(bloqueoPin)
        .where(and(eq(bloqueoPin.programaId, programaId), eq(bloqueoPin.beneficiarioId, beneficiarioId)))
        .limit(1)
      return fila
    },

    async bloquear({ programaId, beneficiarioId, cobroId, hasta }) {
      await db
        .insert(bloqueoPin)
        .values({ programaId, beneficiarioId, cobroId, bloqueadoHasta: hasta })
        .onConflictDoUpdate({
          target: [bloqueoPin.programaId, bloqueoPin.beneficiarioId],
          set: { bloqueadoHasta: hasta, cobroId, creadoEn: sql`now()` },
        })
    },
  }
}

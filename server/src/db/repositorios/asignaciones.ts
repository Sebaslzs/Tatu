// La asignación de cada persona en cada programa (ACTUALIZACIÓN 01 y 02 de db/esquema.sql). La API
// solo escribe `asignado`, que es lo que dice la liquidación; `comprometido` y `cobrado` los mueve el
// trigger `cobro_mueve_saldo` de la base con el estado de cada cobro. El saldo que decide la API se
// calcula desde los cobros (cobros/saldo.ts), así funciona igual en PGlite, que no tiene triggers.
import { sql } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { asignacion } from '../generado/schema.ts'

export interface RepoAsignaciones {
  /**
   * Crea la fila o sube `asignado` al valor de la liquidación. Nunca lo deja por debajo de lo ya
   * cobrado o comprometido (la base lo exige con `sin_sobregiro`).
   */
  asegurar(programaId: string, beneficiarioId: string, asignado: number): Promise<void>
}

export function repoAsignaciones(db: Db): RepoAsignaciones {
  return {
    async asegurar(programaId, beneficiarioId, asignado) {
      await db
        .insert(asignacion)
        .values({ programaId, beneficiarioId, asignado })
        .onConflictDoUpdate({
          target: [asignacion.programaId, asignacion.beneficiarioId],
          set: { asignado: sql`greatest(excluded.asignado, ${asignacion.cobrado} + ${asignacion.comprometido})` },
        })
    },
  }
}

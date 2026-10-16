// Acceso a datos de puntos de retiro y sedes, y su relación con programas.
import { asc, eq } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { programaPunto, punto } from '../generado/schema.ts'

export type FilaPunto = typeof punto.$inferSelect
export type NuevoPunto = typeof punto.$inferInsert

export interface RepoPuntos {
  crear(nuevo: NuevoPunto): Promise<FilaPunto>
  porBilletera(billetera: string): Promise<FilaPunto | undefined>
  listar(): Promise<FilaPunto[]>
  asociarPrograma(programaId: string, puntoId: string): Promise<void>
}

export function repoPuntos(db: Db): RepoPuntos {
  return {
    async crear(nuevo) {
      const [fila] = await db.insert(punto).values(nuevo).returning()
      return fila!
    },
    async porBilletera(billetera) {
      const [fila] = await db.select().from(punto).where(eq(punto.billetera, billetera)).limit(1)
      return fila
    },
    listar() {
      return db.select().from(punto).orderBy(asc(punto.nombre))
    },
    async asociarPrograma(programaId, puntoId) {
      await db.insert(programaPunto).values({ programaId, puntoId }).onConflictDoNothing()
    },
  }
}

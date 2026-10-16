// Acceso a datos de puntos de retiro y sedes, y su relación con programas.
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { programaPunto, punto } from '../generado/schema.ts'

export type FilaPunto = typeof punto.$inferSelect
export type NuevoPunto = typeof punto.$inferInsert

export interface RepoPuntos {
  crear(nuevo: NuevoPunto): Promise<FilaPunto>
  obtener(id: string): Promise<FilaPunto | undefined>
  deIds(ids: readonly string[]): Promise<Map<string, FilaPunto>>
  porBilletera(billetera: string): Promise<FilaPunto | undefined>
  listar(): Promise<FilaPunto[]>
  asociarPrograma(programaId: string, puntoId: string): Promise<void>
  /** ¿La entidad autorizó este comercio para el bono? (RN-03) */
  autorizadoEnPrograma(programaId: string, puntoId: string): Promise<boolean>
}

export function repoPuntos(db: Db): RepoPuntos {
  return {
    async crear(nuevo) {
      const [fila] = await db.insert(punto).values(nuevo).returning()
      return fila!
    },
    async obtener(id) {
      const [fila] = await db.select().from(punto).where(eq(punto.id, id)).limit(1)
      return fila
    },
    async deIds(ids) {
      const unicos = [...new Set(ids)]
      if (!unicos.length) return new Map()
      const filas = await db.select().from(punto).where(inArray(punto.id, unicos))
      return new Map(filas.map((p) => [p.id, p]))
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
    async autorizadoEnPrograma(programaId, puntoId) {
      const [fila] = await db
        .select()
        .from(programaPunto)
        .where(and(eq(programaPunto.programaId, programaId), eq(programaPunto.puntoId, puntoId)))
        .limit(1)
      return fila !== undefined
    },
  }
}

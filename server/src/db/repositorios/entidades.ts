// Acceso a datos de entidades financiadoras.
import { asc, eq } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { entidad } from '../generado/schema.ts'

export type FilaEntidad = typeof entidad.$inferSelect
export type NuevaEntidad = typeof entidad.$inferInsert

export interface RepoEntidades {
  crear(nueva: NuevaEntidad): Promise<FilaEntidad>
  obtener(id: string): Promise<FilaEntidad | undefined>
  listar(): Promise<FilaEntidad[]>
}

export function repoEntidades(db: Db): RepoEntidades {
  return {
    async crear(nueva) {
      const [fila] = await db.insert(entidad).values(nueva).returning()
      return fila!
    },
    async obtener(id) {
      const [fila] = await db.select().from(entidad).where(eq(entidad.id, id)).limit(1)
      return fila
    },
    listar() {
      return db.select().from(entidad).orderBy(asc(entidad.nombre))
    },
  }
}

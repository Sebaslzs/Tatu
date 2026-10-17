// Acceso a datos de programas y sus categorías. Sin reglas de negocio.
import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { programa, programaCategoria } from '../generado/schema.ts'
import type { EstadoPrograma } from '../../programas/estados.ts'

export type FilaPrograma = typeof programa.$inferSelect
export type NuevoPrograma = typeof programa.$inferInsert
export type CamposPrograma = Partial<Omit<NuevoPrograma, 'id' | 'creadoEn'>>

export interface RepoProgramas {
  crear(nuevo: NuevoPrograma): Promise<FilaPrograma>
  obtener(id: string): Promise<FilaPrograma | undefined>
  deIds(ids: readonly string[]): Promise<Map<string, FilaPrograma>>
  listar(): Promise<FilaPrograma[]>
  /** Activos o Pausados con un permiso que el banco todavía acepta: los que hay que renovar. */
  conPermisoVigente(): Promise<{ id: string }[]>
  /** Cambia solo si sigue en `estadoEsperado` (bloqueo optimista); undefined si otro ganó. */
  actualizar(id: string, campos: CamposPrograma, estadoEsperado: EstadoPrograma): Promise<FilaPrograma | undefined>
  ponerCategorias(id: string, categorias: readonly string[]): Promise<void>
  categoriasDe(ids: readonly string[]): Promise<Map<string, string[]>>
}

export function repoProgramas(db: Db): RepoProgramas {
  return {
    async crear(nuevo) {
      const [fila] = await db.insert(programa).values(nuevo).returning()
      return fila!
    },

    async obtener(id) {
      const [fila] = await db.select().from(programa).where(eq(programa.id, id)).limit(1)
      return fila
    },

    async deIds(ids) {
      const unicos = [...new Set(ids)]
      if (!unicos.length) return new Map()
      const filas = await db.select().from(programa).where(inArray(programa.id, unicos))
      return new Map(filas.map((p) => [p.id, p]))
    },

    listar() {
      return db.select().from(programa).orderBy(asc(programa.creadoEn))
    },

    conPermisoVigente() {
      return db
        .select({ id: programa.id })
        .from(programa)
        .where(and(inArray(programa.estado, ['Activo', 'Pausado']), isNotNull(programa.tokenAcceso), isNull(programa.permisoVencidoEn)))
    },

    async actualizar(id, campos, estadoEsperado) {
      const [fila] = await db
        .update(programa)
        .set(campos)
        .where(and(eq(programa.id, id), eq(programa.estado, estadoEsperado)))
        .returning()
      return fila
    },

    async ponerCategorias(id, categorias) {
      await db.delete(programaCategoria).where(eq(programaCategoria.programaId, id))
      if (categorias.length) {
        await db.insert(programaCategoria).values(categorias.map((categoria) => ({ programaId: id, categoria })))
      }
    },

    async categoriasDe(ids) {
      const mapa = new Map<string, string[]>(ids.map((id) => [id, []]))
      if (!ids.length) return mapa
      const filas = await db
        .select()
        .from(programaCategoria)
        .where(inArray(programaCategoria.programaId, [...ids]))
        .orderBy(asc(programaCategoria.categoria))
      for (const f of filas) mapa.get(f.programaId)?.push(f.categoria)
      return mapa
    },
  }
}

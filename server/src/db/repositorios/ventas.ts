// Acceso a datos de las ventas: la compra que la persona hizo en el punto durante un retiro y su
// envío a facturación (HU-27). Sin reglas de negocio: las deciden cobros/ y facturacion/.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { venta } from '../generado/schema.ts'

export type FilaVenta = typeof venta.$inferSelect
export type EstadoVenta = FilaVenta['estado']
export type CamposVenta = Partial<Pick<typeof venta.$inferInsert, 'estado' | 'intentosEnvio' | 'ultimoError' | 'referenciaExterna' | 'enviadaEn'>>

/** Una venta nace Registrada, junto con su retiro y antes del PIN. */
export type NuevaVenta = Pick<typeof venta.$inferInsert, 'cobroId' | 'puntoId' | 'beneficiarioId' | 'valor'> & { descripcion?: string | null }

export interface RepoVentas {
  crear(datos: NuevaVenta): Promise<FilaVenta>
  obtener(id: string): Promise<FilaVenta | undefined>
  deCobro(cobroId: string): Promise<FilaVenta | undefined>
  /** Las ventas de varios cobros en una consulta, por id de cobro. */
  deCobros(cobroIds: readonly string[]): Promise<Map<string, FilaVenta>>
  enEstado(estado: EstadoVenta): Promise<FilaVenta[]>
  /** Bloqueo optimista, como en el cobro: cambia solo si la versión es la esperada. */
  actualizar(id: string, versionEsperada: number, campos: CamposVenta): Promise<boolean>
  /**
   * Mueve la venta del cobro solo si sigue Registrada. En Supabase el trigger `cobro_mueve_venta`
   * ya lo hizo en la misma transacción y aquí no cambia nada; en PGlite (sin triggers) lo hace esto.
   */
  seguirAlCobro(cobroId: string, hacia: 'PorEnviar' | 'Anulada'): Promise<void>
}

export function repoVentas(db: Db): RepoVentas {
  return {
    async crear(datos) {
      const [fila] = await db.insert(venta).values({ ...datos, estado: 'Registrada' }).returning()
      return fila!
    },

    async obtener(id) {
      const [fila] = await db.select().from(venta).where(eq(venta.id, id)).limit(1)
      return fila
    },

    async deCobro(cobroId) {
      const [fila] = await db.select().from(venta).where(eq(venta.cobroId, cobroId)).limit(1)
      return fila
    },

    async deCobros(cobroIds) {
      const ids = [...new Set(cobroIds)]
      if (!ids.length) return new Map()
      const filas = await db.select().from(venta).where(inArray(venta.cobroId, ids))
      return new Map(filas.map((v) => [v.cobroId, v]))
    },

    enEstado: (estado) => db.select().from(venta).where(eq(venta.estado, estado)).orderBy(asc(venta.actualizadoEn)),

    async actualizar(id, versionEsperada, campos) {
      const filas = await db
        .update(venta)
        .set({ ...campos, version: sql`${venta.version} + 1`, actualizadoEn: sql`now()` })
        .where(and(eq(venta.id, id), eq(venta.version, versionEsperada)))
        .returning({ id: venta.id })
      return filas.length === 1
    },

    async seguirAlCobro(cobroId, hacia) {
      await db
        .update(venta)
        .set({ estado: hacia, version: sql`${venta.version} + 1`, actualizadoEn: sql`now()` })
        .where(and(eq(venta.cobroId, cobroId), eq(venta.estado, 'Registrada')))
    },
  }
}

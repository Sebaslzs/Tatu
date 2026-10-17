// La persona en Tatú: solo tipo y número de documento («somos pasarela»). El nombre y el PIN son de
// la entidad: se piden a la liquidación.
import { asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { beneficiario } from '../generado/schema.ts'

export type FilaBeneficiario = typeof beneficiario.$inferSelect

export interface RepoBeneficiarios {
  /** La persona por su cédula (si está como C.C. y como otro tipo, gana la C.C.). */
  porCedula(documento: string): Promise<FilaBeneficiario | undefined>
  obtener(id: string): Promise<FilaBeneficiario | undefined>
  deIds(ids: readonly string[]): Promise<Map<string, FilaBeneficiario>>
  listar(): Promise<FilaBeneficiario[]>
  /** Registro del equipo: la cédula, como C.C. */
  crear(documento: string): Promise<FilaBeneficiario>
}

export function repoBeneficiarios(db: Db): RepoBeneficiarios {
  return {
    async porCedula(documento) {
      const [fila] = await db
        .select()
        .from(beneficiario)
        .where(eq(beneficiario.numeroDocumento, documento))
        .orderBy(desc(sql`${beneficiario.tipoDocumento} = 'CC'`))
        .limit(1)
      return fila
    },

    async obtener(id) {
      const [fila] = await db.select().from(beneficiario).where(eq(beneficiario.id, id)).limit(1)
      return fila
    },

    async deIds(ids) {
      const unicos = [...new Set(ids)]
      if (!unicos.length) return new Map()
      const filas = await db.select().from(beneficiario).where(inArray(beneficiario.id, unicos))
      return new Map(filas.map((b) => [b.id, b]))
    },

    listar() {
      return db.select().from(beneficiario).orderBy(asc(beneficiario.numeroDocumento))
    },

    async crear(documento) {
      const [fila] = await db.insert(beneficiario).values({ tipoDocumento: 'CC', numeroDocumento: documento }).returning()
      return fila!
    },
  }
}

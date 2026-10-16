// Cuentas de los beneficiarios, con historial: una sola vigente (PorVerificar o Verificada) por persona.
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { Db } from '../conexion.ts'
import { cuentaBeneficiario } from '../generado/schema.ts'

export type FilaCuenta = typeof cuentaBeneficiario.$inferSelect
export type NuevaCuenta = typeof cuentaBeneficiario.$inferInsert
export type EstadoCuenta = FilaCuenta['estado']
export type CamposCuenta = Partial<Omit<NuevaCuenta, 'id' | 'creadoEn'>>

const VIGENTES: EstadoCuenta[] = ['PorVerificar', 'Verificada']

export interface RepoCuentas {
  crear(nueva: NuevaCuenta): Promise<FilaCuenta>
  obtener(id: string): Promise<FilaCuenta | undefined>
  deIds(ids: readonly string[]): Promise<Map<string, FilaCuenta>>
  /** La cuenta vigente de la persona, si tiene. */
  vigenteDe(beneficiarioId: string): Promise<FilaCuenta | undefined>
  /** La vigente o, si no hay, la más reciente (para mostrar el estado). */
  ultimaDe(beneficiarioId: string): Promise<FilaCuenta | undefined>
  /** La última cuenta de cada persona, en una sola consulta. */
  ultimasDe(beneficiarioIds: readonly string[]): Promise<Map<string, FilaCuenta>>
  /** Cambia solo si sigue en `estadoEsperado` (si se indica); false si otra petición ganó. */
  actualizar(id: string, campos: CamposCuenta, estadoEsperado?: EstadoCuenta): Promise<boolean>
  /** La cuenta vigente que ya usa esa billetera, de cualquier persona. */
  vigentePorBilletera(billetera: string): Promise<FilaCuenta | undefined>
}

export function repoCuentas(db: Db): RepoCuentas {
  const ultimaDeUna = async (beneficiarioId: string) => {
    const [fila] = await db
      .select()
      .from(cuentaBeneficiario)
      .where(eq(cuentaBeneficiario.beneficiarioId, beneficiarioId))
      .orderBy(desc(cuentaBeneficiario.creadoEn))
      .limit(1)
    return fila
  }

  const vigenteDe: RepoCuentas['vigenteDe'] = async (beneficiarioId) => {
    const [fila] = await db
      .select()
      .from(cuentaBeneficiario)
      .where(and(eq(cuentaBeneficiario.beneficiarioId, beneficiarioId), inArray(cuentaBeneficiario.estado, VIGENTES)))
      .limit(1)
    return fila
  }

  return {
    async crear(nueva) {
      const [fila] = await db.insert(cuentaBeneficiario).values(nueva).returning()
      return fila!
    },

    async obtener(id) {
      const [fila] = await db.select().from(cuentaBeneficiario).where(eq(cuentaBeneficiario.id, id)).limit(1)
      return fila
    },

    async deIds(ids) {
      const unicos = [...new Set(ids)]
      if (!unicos.length) return new Map()
      const filas = await db.select().from(cuentaBeneficiario).where(inArray(cuentaBeneficiario.id, unicos))
      return new Map(filas.map((c) => [c.id, c]))
    },

    vigenteDe,

    async ultimaDe(beneficiarioId) {
      return (await vigenteDe(beneficiarioId)) ?? (await ultimaDeUna(beneficiarioId))
    },

    async ultimasDe(beneficiarioIds) {
      const mapa = new Map<string, FilaCuenta>()
      const unicos = [...new Set(beneficiarioIds)]
      if (!unicos.length) return mapa
      const filas = await db
        .select()
        .from(cuentaBeneficiario)
        .where(inArray(cuentaBeneficiario.beneficiarioId, unicos))
        .orderBy(desc(cuentaBeneficiario.creadoEn))
      for (const c of filas) {
        const actual = mapa.get(c.beneficiarioId)
        // La vigente gana; si no hay, la más reciente (la primera en llegar)
        if (!actual || (!VIGENTES.includes(actual.estado) && VIGENTES.includes(c.estado))) mapa.set(c.beneficiarioId, c)
      }
      return mapa
    },

    async actualizar(id, campos, estadoEsperado) {
      const condicion = estadoEsperado
        ? and(eq(cuentaBeneficiario.id, id), eq(cuentaBeneficiario.estado, estadoEsperado))
        : eq(cuentaBeneficiario.id, id)
      const filas = await db.update(cuentaBeneficiario).set(campos).where(condicion).returning({ id: cuentaBeneficiario.id })
      return filas.length === 1
    },

    async vigentePorBilletera(billetera) {
      const [fila] = await db
        .select()
        .from(cuentaBeneficiario)
        .where(and(eq(cuentaBeneficiario.billetera, billetera), inArray(cuentaBeneficiario.estado, VIGENTES)))
        .limit(1)
      return fila
    },
  }
}

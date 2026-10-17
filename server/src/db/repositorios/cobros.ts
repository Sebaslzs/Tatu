// Acceso a datos de cobros. Sin reglas de negocio: las decide cobros/.
import { and, asc, count, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { ESTADOS_EN_VUELO, ESTADOS_VIVOS, type EstadoCobro } from '../../cobros/estados.ts'
import type { Db } from '../conexion.ts'
import { cobro } from '../generado/schema.ts'

export type FilaCobro = typeof cobro.$inferSelect
export type CamposCobro = Partial<Omit<typeof cobro.$inferInsert, 'id' | 'version' | 'creadoEn' | 'actualizadoEn'>>

/** Un cobro nace Solicitado, PorConfirmar o Rechazado; la referencia (SUB-0001…) la pone la base. */
export type NuevoCobro = Pick<typeof cobro.$inferInsert, 'programaId' | 'beneficiarioId' | 'canal' | 'llaveIdempotencia'> &
  Partial<Pick<typeof cobro.$inferInsert, 'puntoId' | 'cuentaId' | 'totalCompra' | 'monto' | 'motivoRechazo' | 'creadoEn'>> & {
    estado: 'Solicitado' | 'PorConfirmar' | 'Rechazado'
  }

export interface RepoCobros {
  crear(datos: NuevoCobro): Promise<FilaCobro>
  obtener(id: string): Promise<FilaCobro | undefined>
  porLlave(llave: string): Promise<FilaCobro | undefined>
  /** El cobro vivo o pagado de la persona en el programa (RN-02 de los bonos). */
  vivoDe(programaId: string, beneficiarioId: string): Promise<FilaCobro | undefined>
  /** El cobro en vuelo de la persona en el programa: hay uno a lo sumo (índice `un_cobro_en_vuelo_por_persona`). */
  enVueloDe(programaId: string, beneficiarioId: string): Promise<FilaCobro | undefined>
  /** Todos los cobros de la persona en el programa: de ellos sale su saldo (cobros/saldo.ts). */
  dePersonaEnPrograma(programaId: string, beneficiarioId: string): Promise<FilaCobro[]>
  /**
   * Bloqueo optimista (CA-14.03): cambia solo si la versión es la esperada y la sube. Si no cambió
   * ninguna fila, otra petición ganó y devuelve false.
   */
  actualizar(id: string, versionEsperada: number, campos: CamposCobro): Promise<boolean>
  dePrograma(programaId: string): Promise<FilaCobro[]>
  dePunto(puntoId: string, desde?: string): Promise<FilaCobro[]>
  deBeneficiario(beneficiarioId: string): Promise<FilaCobro[]>
  enEstado(estado: EstadoCobro): Promise<FilaCobro[]>
  cuantosEnEstado(programaId: string, estado: EstadoCobro): Promise<number>
  /** Lo que ya salió o está saliendo (Pagado y Pagando). */
  sumaComprometida(programaId: string): Promise<number>
  sumaPagada(programaId: string): Promise<number>
}

export function repoCobros(db: Db): RepoCobros {
  const recientePrimero = [desc(cobro.creadoEn), desc(cobro.referencia)] as const

  const suma = async (programaId: string, estados: EstadoCobro[]): Promise<number> => {
    const [fila] = await db
      .select({ total: sql<number>`coalesce(sum(${cobro.monto}), 0)`.mapWith(Number) })
      .from(cobro)
      .where(and(eq(cobro.programaId, programaId), inArray(cobro.estado, estados)))
    return fila?.total ?? 0
  }

  return {
    async crear(datos) {
      const [fila] = await db.insert(cobro).values(datos).returning()
      return fila!
    },

    async obtener(id) {
      const [fila] = await db.select().from(cobro).where(eq(cobro.id, id)).limit(1)
      return fila
    },

    async porLlave(llave) {
      const [fila] = await db.select().from(cobro).where(eq(cobro.llaveIdempotencia, llave)).limit(1)
      return fila
    },

    async vivoDe(programaId, beneficiarioId) {
      const [fila] = await db
        .select()
        .from(cobro)
        .where(and(eq(cobro.programaId, programaId), eq(cobro.beneficiarioId, beneficiarioId), inArray(cobro.estado, [...ESTADOS_VIVOS])))
        .limit(1)
      return fila
    },

    async enVueloDe(programaId, beneficiarioId) {
      const [fila] = await db
        .select()
        .from(cobro)
        .where(and(eq(cobro.programaId, programaId), eq(cobro.beneficiarioId, beneficiarioId), inArray(cobro.estado, [...ESTADOS_EN_VUELO])))
        .limit(1)
      return fila
    },

    dePersonaEnPrograma: (programaId, beneficiarioId) =>
      db.select().from(cobro).where(and(eq(cobro.programaId, programaId), eq(cobro.beneficiarioId, beneficiarioId))).orderBy(...recientePrimero),

    async actualizar(id, versionEsperada, campos) {
      // La base también sube `version` con un trigger; hacerlo aquí mantiene el bloqueo en una base
      // local sin triggers (PGlite).
      const filas = await db
        .update(cobro)
        .set({ ...campos, version: sql`${cobro.version} + 1`, actualizadoEn: sql`now()` })
        .where(and(eq(cobro.id, id), eq(cobro.version, versionEsperada)))
        .returning({ id: cobro.id })
      return filas.length === 1
    },

    dePrograma: (programaId) => db.select().from(cobro).where(eq(cobro.programaId, programaId)).orderBy(...recientePrimero),

    dePunto(puntoId, desde) {
      const condicion = desde ? and(eq(cobro.puntoId, puntoId), gte(cobro.creadoEn, desde)) : eq(cobro.puntoId, puntoId)
      return db.select().from(cobro).where(condicion).orderBy(...recientePrimero)
    },

    deBeneficiario: (beneficiarioId) => db.select().from(cobro).where(eq(cobro.beneficiarioId, beneficiarioId)).orderBy(...recientePrimero),

    enEstado: (estado) => db.select().from(cobro).where(eq(cobro.estado, estado)).orderBy(asc(cobro.actualizadoEn)),

    async cuantosEnEstado(programaId, estado) {
      const [fila] = await db.select({ n: count() }).from(cobro).where(and(eq(cobro.programaId, programaId), eq(cobro.estado, estado)))
      return fila?.n ?? 0
    },

    sumaComprometida: (programaId) => suma(programaId, ['Pagado', 'Pagando']),
    sumaPagada: (programaId) => suma(programaId, ['Pagado']),
  }
}

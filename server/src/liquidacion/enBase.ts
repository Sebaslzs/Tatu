// Liquidación simulada guardada en la base (esquema `simulacion`): lo que se inscribe sobrevive a los
// reinicios de la API y lo ven todas las instancias de Vercel. Empieza vacía: solo están las personas
// que registra «Equipo de prueba».
import { eq, inArray } from 'drizzle-orm'
import type { Db } from '../db/conexion.ts'
import { personaLiquidada, prepararTablasSimulacion } from '../simulacion/tablas.ts'
import type { DatosLiquidacion, Pago, Persona, Resumen } from './contrato.ts'
import { hashPin, MONTO_POR_DEFECTO, pinCoincide } from './simulador.ts'

type FilaPersona = typeof personaLiquidada.$inferSelect

const aPersona = (f: FilaPersona): Persona => ({ documento: f.documento, nombre: f.nombre, tienePin: f.pinHash !== null })

export class LiquidacionEnBase implements DatosLiquidacion {
  private readonly db: Db

  montoPorPrograma: (programaId: string) => Promise<number | null> = async () => null

  constructor(db: Db) {
    this.db = db
  }

  async resumen(programaId: string): Promise<Resumen> {
    const [filas, base] = await Promise.all([this.todas(), this.montoPorPrograma(programaId)])
    const incluidas = filas.filter((f) => !f.novedad)
    return { cedulas: incluidas.length, total: String(incluidas.reduce((suma, f) => suma + (base ?? f.monto), 0)) }
  }

  async pago(programaId: string, documento: string): Promise<Pago | undefined> {
    const f = await this.fila(documento)
    if (!f) return undefined
    const base = f.novedad ? null : await this.montoPorPrograma(programaId)
    return { documento, disponible: true, monto: String(base ?? f.monto), novedad: f.novedad }
  }

  async buscar(documentos: readonly string[]): Promise<Persona[]> {
    const unicos = [...new Set(documentos)]
    if (!unicos.length) return []
    await prepararTablasSimulacion(this.db)
    const filas = await this.db.select().from(personaLiquidada).where(inArray(personaLiquidada.documento, unicos))
    return filas.map(aPersona).sort((a, b) => a.documento.localeCompare(b.documento))
  }

  async validarPin(documento: string, pin: string): Promise<boolean> {
    const guardado = (await this.fila(documento))?.pinHash
    return guardado ? pinCoincide(guardado, pin) : false
  }

  /** Inscribe o actualiza el nombre (y el PIN, si llega): un registro a medias se puede repetir. */
  async inscribir(documento: string, nombre: string, pin?: string): Promise<Persona> {
    await prepararTablasSimulacion(this.db)
    const pinHash = pin ? hashPin(pin) : undefined
    const [f] = await this.db
      .insert(personaLiquidada)
      .values({ documento, nombre, monto: MONTO_POR_DEFECTO, ...(pinHash ? { pinHash } : {}) })
      .onConflictDoUpdate({ target: personaLiquidada.documento, set: { nombre, ...(pinHash ? { pinHash } : {}) } })
      .returning()
    return aPersona(f!)
  }

  async ponerPin(documento: string, pin: string): Promise<boolean> {
    await prepararTablasSimulacion(this.db)
    const filas = await this.db
      .update(personaLiquidada)
      .set({ pinHash: hashPin(pin) })
      .where(eq(personaLiquidada.documento, documento))
      .returning({ documento: personaLiquidada.documento })
    return filas.length === 1
  }

  private async todas(): Promise<FilaPersona[]> {
    await prepararTablasSimulacion(this.db)
    return this.db.select().from(personaLiquidada)
  }

  private async fila(documento: string): Promise<FilaPersona | undefined> {
    await prepararTablasSimulacion(this.db)
    const [f] = await this.db.select().from(personaLiquidada).where(eq(personaLiquidada.documento, documento)).limit(1)
    return f
  }
}

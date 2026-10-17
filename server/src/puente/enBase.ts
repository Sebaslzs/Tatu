// Banco puente de Bre-B simulado guardado en la base (esquema `simulacion`): las llaves sobreviven a
// los reinicios de la API y las ven todas las instancias de Vercel.
import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/conexion.ts'
import { llaveBreB, prepararTablasSimulacion } from '../simulacion/tablas.ts'
import type { Llave, TipoLlave } from './contrato.ts'
import type { DatosPuente, ResultadoRegistro } from './simulador.ts'

type FilaLlave = typeof llaveBreB.$inferSelect

const aLlave = (f: FilaLlave): Llave => ({
  tipo: f.tipo as TipoLlave,
  valor: f.valor,
  documentoTitular: f.documentoTitular,
  nombreTitular: f.nombreTitular,
  billetera: f.billetera,
})

export class PuenteEnBase implements DatosPuente {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  async obtener(tipo: TipoLlave, valor: string): Promise<Llave | undefined> {
    await prepararTablasSimulacion(this.db)
    const [f] = await this.db
      .select()
      .from(llaveBreB)
      .where(and(eq(llaveBreB.tipo, tipo), eq(llaveBreB.valor, valor)))
      .limit(1)
    return f && aLlave(f)
  }

  async deTitular(documento: string): Promise<Llave[]> {
    await prepararTablasSimulacion(this.db)
    const filas = await this.db.select().from(llaveBreB).where(eq(llaveBreB.documentoTitular, documento))
    return filas.map(aLlave)
  }

  async registrar(llave: Llave): Promise<ResultadoRegistro> {
    const previa = await this.obtener(llave.tipo, llave.valor)
    if (previa && previa.documentoTitular !== llave.documentoTitular) return 'deOtro'
    await this.db
      .insert(llaveBreB)
      .values(llave)
      .onConflictDoUpdate({
        target: [llaveBreB.tipo, llaveBreB.valor],
        set: { nombreTitular: llave.nombreTitular, billetera: llave.billetera },
        // Si otra persona la tomó entre la lectura y la escritura, no se le quita
        setWhere: eq(llaveBreB.documentoTitular, llave.documentoTitular),
      })
    return previa ? 'actualizada' : 'creada'
  }

  async borrar(tipo: TipoLlave, valor: string): Promise<boolean> {
    await prepararTablasSimulacion(this.db)
    const filas = await this.db
      .delete(llaveBreB)
      .where(and(eq(llaveBreB.tipo, tipo), eq(llaveBreB.valor, valor)))
      .returning({ valor: llaveBreB.valor })
    return filas.length === 1
  }
}

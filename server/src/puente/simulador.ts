// Banco puente de Bre-B simulado (AD-21), en memoria: lo usan las pruebas. La API sirve el que se
// guarda en la base (enBase.ts). Solo lo usa su router: la API de Tatú lo pide por HTTP
// (cliente.ts), como haría con el banco real.
import type { Llave, TipoLlave } from './contrato.ts'

export type ResultadoRegistro = 'creada' | 'actualizada' | 'deOtro'

/** Lo que guarda el banco puente simulado y sirve su router (/api/puente). */
export interface DatosPuente {
  obtener(tipo: TipoLlave, valor: string): Llave | undefined | Promise<Llave | undefined>
  deTitular(documento: string): Llave[] | Promise<Llave[]>
  /**
   * Registra la llave o, si ya era de esa misma persona, cambia la billetera a la que llega (así se
   * prueba RN-18: la persona movió su llave a otro banco). Si es de otra persona, no se toca.
   */
  registrar(llave: Llave): ResultadoRegistro | Promise<ResultadoRegistro>
  borrar(tipo: TipoLlave, valor: string): boolean | Promise<boolean>
}

export class PuenteSimulado implements DatosPuente {
  private llaves = new Map<string, Llave>()

  obtener(tipo: TipoLlave, valor: string): Llave | undefined {
    return this.llaves.get(this.clave(tipo, valor))
  }

  deTitular(documento: string): Llave[] {
    return [...this.llaves.values()].filter((l) => l.documentoTitular === documento)
  }

  registrar(llave: Llave): ResultadoRegistro {
    const previa = this.obtener(llave.tipo, llave.valor)
    if (previa && previa.documentoTitular !== llave.documentoTitular) return 'deOtro'
    this.llaves.set(this.clave(llave.tipo, llave.valor), { ...llave })
    return previa ? 'actualizada' : 'creada'
  }

  borrar(tipo: TipoLlave, valor: string): boolean {
    return this.llaves.delete(this.clave(tipo, valor))
  }

  reiniciar(): void {
    this.llaves.clear()
  }

  private clave(tipo: TipoLlave, valor: string): string {
    return `${tipo}:${valor}`
  }
}

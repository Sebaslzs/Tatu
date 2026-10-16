// Doble de prueba del puerto de billeteras: sin red, con billeteras que el test registra.
import { ErrorBilletera, normalizarBilletera, type BilleteraResuelta, type PuertoBilleteras } from '../comun/billeteras.ts'
import type { Moneda } from '../comun/montos.ts'

export const COP: Moneda = { assetCode: 'COP', assetScale: 2 }
export const USD: Moneda = { assetCode: 'USD', assetScale: 2 }

export class BilleterasFalsas implements PuertoBilleteras {
  private readonly conocidas = new Map<string, Moneda>()
  /** Simula que el servidor de la billetera no responde. */
  caida = false

  registrar(url: string, moneda: Moneda = COP): string {
    const normalizada = normalizarBilletera(url)
    this.conocidas.set(normalizada, moneda)
    return normalizada
  }

  async resolver(url: string): Promise<BilleteraResuelta> {
    if (this.caida) throw new ErrorBilletera('SinRespuesta', 'caída simulada')
    const normalizada = normalizarBilletera(url)
    const moneda = this.conocidas.get(normalizada)
    if (!moneda) throw new ErrorBilletera('NoEncontrada', 'no registrada')
    return { url: normalizada, ...moneda, nombre: null }
  }

  limpiar(): void {
    this.conocidas.clear()
    this.caida = false
  }
}

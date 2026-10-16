// Doble de prueba del puerto de pagos: simula la Test Wallet sin red. Un pago saliente se completa al
// crearse, salvo que el test pida lo contrario, y el tope del permiso lo hace cumplir «el banco»
// (InsufficientGrant), como en la vida real (RN-09).
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import type { PagoEntrante, PagoSaliente, PuertoPagos } from '../cobros/puertos.ts'

export interface PagoEntranteRegistrado {
  url: string
  billetera: string
  monto: number
  referencia: string
}

export interface PagoSalienteRegistrado {
  url: string
  urlPagoEntrante: string
  monto: number
  referencia: string
  token: string
}

export class PagosFalsos implements PuertoPagos {
  entrantes: PagoEntranteRegistrado[] = []
  salientes: PagoSalienteRegistrado[] = []
  /** Lo que el banco ya descontó del permiso. */
  gastado = 0
  /** Tope del permiso en el banco; sin él, no hay límite. */
  tope: number | null = null
  /** Si es false, el pago saliente queda enviado en 0: sigue Pagando (RN-10). */
  completarSalientes = true
  /** Errores que se lanzan una vez, en orden, al crear el siguiente pago de cada tipo. */
  erroresEntrante: ErrorOpenPayments[] = []
  erroresSaliente: Error[] = []
  /** Se llama justo antes de crear el pago entrante: deja observar el estado del cobro en ese instante. */
  alCrearEntrante: (() => Promise<void>) | undefined
  /** Pagos salientes que el banco ya creó pero cuya respuesta se perdió (CA-12.03). */
  private readonly creados = new Map<string, PagoSaliente>()
  private n = 0

  async crearPagoEntrante(args: { billetera: string; monto: number; referencia: string }): Promise<PagoEntrante> {
    await this.alCrearEntrante?.()
    const error = this.erroresEntrante.shift()
    if (error) throw error
    const url = `https://ilp.interledger-test.dev/incoming-payments/${++this.n}`
    this.entrantes.push({ url, billetera: args.billetera, monto: args.monto, referencia: args.referencia })
    return { id: url, completado: false, recibido: '0', esperado: String(args.monto) }
  }

  async leerPagoEntrante(args: { url: string }): Promise<PagoEntrante> {
    const entrante = this.entrantes.find((p) => p.url === args.url)
    if (!entrante) throw new ErrorOpenPayments('ErrorOpenPayments', 404)
    const recibido = this.salientes.some((s) => s.urlPagoEntrante === args.url) && this.completarSalientes
    return { id: entrante.url, completado: recibido, recibido: recibido ? String(entrante.monto) : '0', esperado: String(entrante.monto) }
  }

  async crearPagoSaliente(args: { token: string; urlPagoEntrante: string; monto: number; referencia: string }): Promise<PagoSaliente> {
    const error = this.erroresSaliente.shift()
    if (error) throw error
    if (this.tope !== null && this.gastado + args.monto > this.tope) throw new ErrorOpenPayments('TopeSuperado', 403, 'InsufficientGrant')
    const url = `https://ilp.interledger-test.dev/outgoing-payments/${++this.n}`
    this.salientes.push({ url, urlPagoEntrante: args.urlPagoEntrante, monto: args.monto, referencia: args.referencia, token: args.token })
    if (this.completarSalientes) this.gastado += args.monto
    const pago: PagoSaliente = {
      id: url,
      fallido: false,
      debitado: String(args.monto),
      enviado: this.completarSalientes ? String(args.monto) : '0',
    }
    this.creados.set(url, pago)
    return pago
  }

  async leerPagoSaliente(args: { url: string }): Promise<PagoSaliente> {
    const pago = this.creados.get(args.url)
    if (!pago) throw new ErrorOpenPayments('ErrorOpenPayments', 404)
    return this.completarSalientes ? { ...pago, enviado: pago.debitado } : pago
  }

  reiniciar(): void {
    Object.assign(this, new PagosFalsos())
  }
}

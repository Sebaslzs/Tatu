// Cliente HTTP del sistema de facturación (FACTURACION_URL). Cada venta va con su id como
// `Idempotency-Key`: si un envío se repite (un reintento, o la respuesta se perdió en la red), el
// sistema devuelve la misma solicitud y no crea otra factura.
import { RespuestaFactura, type PuertoFacturacion, type ResultadoEnvio, type SolicitudFactura } from './contrato.ts'

export interface OpcionesClienteFacturacion {
  baseUrl: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

export class ClienteFacturacion implements PuertoFacturacion {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetch: typeof globalThis.fetch

  constructor({ baseUrl, timeoutMs, fetch = globalThis.fetch }: OpcionesClienteFacturacion) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetch = fetch
  }

  async enviar(solicitud: SolicitudFactura): Promise<ResultadoEnvio> {
    let res: Response
    try {
      res = await this.fetch(`${this.baseUrl}/facturas`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': solicitud.idVenta },
        body: JSON.stringify(solicitud),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      return { tipo: 'noDisponible', mensaje: 'El sistema de facturación no respondió' }
    }
    const cuerpo: unknown = await res.json().catch(() => null)
    // 409: ya la tenía con esa llave; cuenta como recibida
    if (res.ok || res.status === 409) {
      const r = RespuestaFactura.safeParse(cuerpo)
      return r.success ? { tipo: 'aceptada', referencia: r.data.id } : { tipo: 'noDisponible', mensaje: 'Facturación respondió algo que no entendemos' }
    }
    if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      return { tipo: 'rechazada', mensaje: `Facturación rechazó los datos (${res.status})${mensajeDe(cuerpo)}` }
    }
    return { tipo: 'noDisponible', mensaje: `Facturación no está disponible (${res.status})` }
  }
}

/** El mensaje de error del sistema, corto y sin datos personales que no hayamos mandado. */
function mensajeDe(cuerpo: unknown): string {
  const m = (cuerpo as { error?: { mensaje?: unknown } } | null)?.error?.mensaje
  return typeof m === 'string' && m.length ? `: ${m.slice(0, 160)}` : ''
}

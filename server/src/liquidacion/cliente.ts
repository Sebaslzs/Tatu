// Cliente HTTP de la liquidación (LIQUIDACION_URL). Cualquier falla de red, 5xx, timeout o
// respuesta fuera de contrato es `LiquidacionNoResponde` (CA-02.06).
import { ErrorApi } from '../comun/errores.ts'
import type { z } from 'zod'
import { Pago, Persona, Personas, RespuestaPin, Resumen, type ConsultaPago, type PuertoLiquidacion } from './contrato.ts'

export class LiquidacionNoResponde extends ErrorApi {
  constructor() {
    super(503, 'LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento')
  }
}

export interface OpcionesClienteLiquidacion {
  baseUrl: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

export class ClienteLiquidacion implements PuertoLiquidacion {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetch: typeof globalThis.fetch

  constructor({ baseUrl, timeoutMs, fetch = globalThis.fetch }: OpcionesClienteLiquidacion) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetch = fetch
  }

  async resumen(programaId: string) {
    const { cuerpo } = await this.pedir(`/programas/${encodeURIComponent(programaId)}/resumen`)
    const r = leer(Resumen, cuerpo)
    return { cedulas: r.cedulas, total: Number(r.total) }
  }

  async pago(programaId: string, cedula: string): Promise<ConsultaPago> {
    const ruta = `/programas/${encodeURIComponent(programaId)}/pagos/${encodeURIComponent(cedula)}`
    const { status, cuerpo } = await this.pedir(ruta)
    if (status === 404) return { tipo: 'noExiste' }
    const p = leer(Pago, cuerpo)
    return p.disponible ? { tipo: 'disponible', monto: Number(p.monto), novedad: p.novedad } : { tipo: 'pagado' }
  }

  async personas(cedulas: readonly string[]): Promise<Map<string, Persona>> {
    const unicas = [...new Set(cedulas)]
    if (!unicas.length) return new Map()
    const { cuerpo } = await this.pedir(`/personas?cedulas=${encodeURIComponent(unicas.join(','))}`)
    return new Map(leer(Personas, cuerpo).map((p) => [p.cedula, p]))
  }

  async validarPin(cedula: string, pin: string): Promise<boolean> {
    const { cuerpo } = await this.pedir('/pin/validar', 'POST', { cedula, pin })
    return leer(RespuestaPin, cuerpo).valido
  }

  async inscribir(cedula: string, nombre: string, pin?: string): Promise<Persona> {
    const { status, cuerpo } = await this.pedir('/personas', 'POST', { cedula, nombre, ...(pin ? { pin } : {}) })
    if (status !== 200) throw new LiquidacionNoResponde()
    return leer(Persona, cuerpo)
  }

  async ponerPin(cedula: string, pin: string): Promise<boolean> {
    const { status } = await this.pedir(`/personas/${encodeURIComponent(cedula)}/pin`, 'POST', { pin })
    if (status === 404) return false
    if (status !== 200) throw new LiquidacionNoResponde()
    return true
  }

  private async pedir(ruta: string, metodo = 'GET', cuerpo?: unknown): Promise<{ status: number; cuerpo: unknown }> {
    let res: Response
    try {
      res = await this.fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new LiquidacionNoResponde()
    }
    if (res.status >= 500) throw new LiquidacionNoResponde()
    return { status: res.status, cuerpo: await res.json().catch(() => null) }
  }
}

function leer<T extends z.ZodType>(esquema: T, valor: unknown): z.output<T> {
  const r = esquema.safeParse(valor)
  if (!r.success) throw new LiquidacionNoResponde()
  return r.data
}

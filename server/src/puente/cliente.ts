// Cliente HTTP del banco puente de Bre-B (PUENTE_URL). Si no responde: `PuenteNoResponde`.
import type { z } from 'zod'
import { ErrorApi } from '../comun/errores.ts'
import { Coincidencia, Llave, Llaves, Resolucion, type PuertoPuente, type TipoLlave } from './contrato.ts'

export class PuenteNoResponde extends ErrorApi {
  constructor() {
    super(503, 'PuenteNoResponde', 'No pudimos consultar Bre-B; intenta en un momento')
  }
}

/** Una llave que el banco no aceptó al registrarla («Equipo de prueba»). */
export class LlaveRechazada extends ErrorApi {}

export interface OpcionesClientePuente {
  baseUrl: string
  timeoutMs: number
  fetch?: typeof globalThis.fetch
}

const ruta = (tipo: TipoLlave, valor: string) => `/llaves/${encodeURIComponent(tipo)}/${encodeURIComponent(valor)}`

export class ClientePuente implements PuertoPuente {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetch: typeof globalThis.fetch

  constructor({ baseUrl, timeoutMs, fetch = globalThis.fetch }: OpcionesClientePuente) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.timeoutMs = timeoutMs
    this.fetch = fetch
  }

  async resolverLlave(tipo: TipoLlave, valor: string) {
    const { status, cuerpo } = await this.pedir(ruta(tipo, valor))
    if (status === 404) return null
    return leer(Resolucion, cuerpo)
  }

  async pertenece(tipo: TipoLlave, valor: string, cedula: string) {
    const { status, cuerpo } = await this.pedir(`${ruta(tipo, valor)}/pertenece`, 'POST', { cedula })
    if (status === 404) return null
    return leer(Coincidencia, cuerpo).pertenece
  }

  async llavesDe(cedula: string) {
    const { status, cuerpo } = await this.pedir(`/llaves?cedula=${encodeURIComponent(cedula)}`)
    if (status !== 200) throw new PuenteNoResponde()
    return leer(Llaves, cuerpo)
  }

  async registrarLlave(llave: Llave) {
    const { status, cuerpo } = await this.pedir('/llaves', 'POST', llave)
    if (status === 200 || status === 201) return leer(Llave, cuerpo)
    const e = (cuerpo as { error?: { codigo?: string; mensaje?: string } } | null)?.error
    if (e?.codigo && e.mensaje && [400, 409, 422].includes(status)) throw new LlaveRechazada(status, e.codigo, e.mensaje)
    throw new PuenteNoResponde()
  }

  async borrarLlave(tipo: TipoLlave, valor: string) {
    const { status } = await this.pedir(ruta(tipo, valor), 'DELETE')
    if (status === 404) return false
    if (status !== 204) throw new PuenteNoResponde()
    return true
  }

  private async pedir(rutaRelativa: string, metodo = 'GET', cuerpo?: unknown): Promise<{ status: number; cuerpo: unknown }> {
    let res: Response
    try {
      res = await this.fetch(`${this.baseUrl}${rutaRelativa}`, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { 'content-type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch {
      throw new PuenteNoResponde()
    }
    if (res.status >= 500) throw new PuenteNoResponde()
    return { status: res.status, cuerpo: res.status === 204 ? null : await res.json().catch(() => null) }
  }
}

function leer<T extends z.ZodType>(esquema: T, valor: unknown): z.output<T> {
  const r = esquema.safeParse(valor)
  if (!r.success) throw new PuenteNoResponde()
  return r.data
}

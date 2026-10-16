// Cliente delgado: el navegador solo habla con nuestra API, nunca con Open Payments
// ni con tokens (Arquitectura § 2.1). En local, Vite pasa /api a la API.

const BASE = '/api'

export class ErrorApi extends Error {
  readonly estado: number
  readonly cuerpo: unknown

  constructor(estado: number, cuerpo: unknown) {
    super(`La API respondió ${estado}`)
    this.estado = estado
    this.cuerpo = cuerpo
  }
}

export async function api<T>(ruta: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${ruta}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const cuerpo: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ErrorApi(res.status, cuerpo)
  return cuerpo as T
}

export interface ConfigPublica {
  pollIntervaloMs: number
  extras: Record<'bono' | 'qr' | 'pdf417' | 'contrato' | 'deploy', boolean>
}

/** Banderas EXTRA_* y cadencia de consulta del estado (AD-16, RNF-10). */
export const obtenerConfig = () => api<ConfigPublica>('/config')

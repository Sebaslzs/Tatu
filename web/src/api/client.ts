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

/** Código de error de la API (`{ error: { codigo, mensaje } }`), o null si no vino. */
export function codigoDeError(e: unknown): string | null {
  if (!(e instanceof ErrorApi)) return null
  const error = (e.cuerpo as { error?: { codigo?: unknown } } | null)?.error
  return typeof error?.codigo === 'string' ? error.codigo : null
}

/** Mensaje para la persona: el de la API si lo trae; si no, uno genérico de conexión. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof ErrorApi) {
    const error = (e.cuerpo as { error?: { mensaje?: unknown } } | null)?.error
    if (typeof error?.mensaje === 'string') return error.mensaje
    if (e.estado >= 500) return 'Algo falló de nuestro lado. Intenta en un momento.'
  }
  return 'No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.'
}

export interface ConfigPublica {
  pollIntervaloMs: number
  extras: Record<'bono' | 'qr' | 'pdf417' | 'contrato' | 'deploy', boolean>
}

/** Banderas EXTRA_* y cadencia de consulta del estado (AD-16, RNF-10). */
export const obtenerConfig = () => api<ConfigPublica>('/config')

export interface PuntoRegistrado {
  id: string
  nombre: string
  direccion: string
  billetera: string
  tipo: 'retiro' | 'compra'
}

/** Puntos registrados por el equipo (HU-03). El punto elige el suyo para entrar. */
export const listarPuntos = () => api<PuntoRegistrado[]>('/puntos')

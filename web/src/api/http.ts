// Cliente de la API para las vistas de la entidad: entiende el error `{ error: { codigo, mensaje } }`
// y distingue «la API está apagada» (el proxy de Vite responde 502/504 sin JSON).

export const SIN_CONEXION = 'No pudimos conectar con el servidor. Intenta de nuevo'

export class ErrorHttp extends Error {
  readonly codigo: string
  readonly status: number

  constructor(codigo: string, mensaje: string, status: number) {
    super(mensaje)
    this.name = 'ErrorHttp'
    this.codigo = codigo
    this.status = status
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH'

async function pedir<T>(metodo: Metodo, ruta: string, cuerpo?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorHttp('SinConexion', SIN_CONEXION, 0)
  }

  const texto = await res.text().catch(() => '')
  let datos: unknown = null
  if (texto) {
    try {
      datos = JSON.parse(texto)
    } catch {
      throw new ErrorHttp('SinConexion', SIN_CONEXION, res.status)
    }
  }
  if (res.ok) return datos as T

  const err = (datos as { error?: { codigo?: string; mensaje?: string } } | null)?.error
  throw new ErrorHttp(err?.codigo ?? 'Error', err?.mensaje ?? SIN_CONEXION, res.status)
}

export const http = {
  get: <T>(ruta: string) => pedir<T>('GET', ruta),
  post: <T>(ruta: string, cuerpo: unknown = {}) => pedir<T>('POST', ruta, cuerpo),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>('PATCH', ruta, cuerpo),
}

/** Mensaje para mostrar de cualquier error que lance `http`. */
export function mensajeDeError(e: unknown): string {
  return e instanceof ErrorHttp ? e.message : SIN_CONEXION
}

/** La ruta existe en la API pero todavía responde 501 (épicas siguientes). */
export function esNoImplementado(e: unknown): boolean {
  return e instanceof ErrorHttp && e.status === 501
}

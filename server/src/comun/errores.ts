// Errores de la API: un solo formato `{ error: { codigo, mensaje } }` con su status HTTP.
import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { z } from 'zod'

export class ErrorApi extends Error {
  readonly status: number
  readonly codigo: string

  constructor(status: number, codigo: string, mensaje: string) {
    super(mensaje)
    this.status = status
    this.codigo = codigo
  }
}

export const entradaInvalida = (mensaje: string) => new ErrorApi(400, 'EntradaInvalida', mensaje)
export const noEncontrado = (mensaje: string, codigo = 'NoEncontrado') => new ErrorApi(404, codigo, mensaje)
export const conflicto = (codigo: string, mensaje: string) => new ErrorApi(409, codigo, mensaje)
export const noDisponible = (codigo: string, mensaje: string) => new ErrorApi(503, codigo, mensaje)

/** Valida en la frontera con Zod; un fallo es un 400 `EntradaInvalida` legible. */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos)
  if (resultado.success) return resultado.data
  const detalle = resultado.error.issues
    .map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`)
    .join('; ')
  throw entradaInvalida(detalle)
}

export const rutaNoEncontrada: RequestHandler = (req, _res, next) => {
  next(noEncontrado(`No existe ${req.method} ${req.originalUrl}`))
}

export const manejarErrores: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErrorApi) {
    res.status(err.status).json({ error: { codigo: err.codigo, mensaje: err.message } })
    return
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { codigo: 'EntradaInvalida', mensaje: 'El cuerpo no es JSON válido' } })
    return
  }
  console.error(err)
  res.status(500).json({ error: { codigo: 'ErrorInterno', mensaje: 'Algo falló de nuestro lado' } })
}

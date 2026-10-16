import type { RequestHandler } from 'express'

/** Respuesta provisional de las rutas que aún no tienen lógica (épicas siguientes). */
export const noImplementado: RequestHandler = (req, res) => {
  res.status(501).json({ error: { codigo: 'NoImplementado', mensaje: `${req.method} ${req.originalUrl} aún no está implementada` } })
}

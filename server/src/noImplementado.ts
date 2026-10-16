import type { RequestHandler } from 'express'

/** Respuesta provisional de las rutas del esqueleto que aún no tienen lógica. */
export const noImplementado: RequestHandler = (req, res) => {
  res.status(501).json({ error: 'NoImplementado', ruta: `${req.method} ${req.baseUrl}${req.path}` })
}

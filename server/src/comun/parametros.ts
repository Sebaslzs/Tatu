// Parámetros de ruta comunes. Un id que no es UUID no puede existir: responde 404 sin ir a la base.
import type { Request } from 'express'
import { z } from 'zod'
import { noEncontrado } from './errores.ts'

const uuid = z.uuid()

export function idDe(req: Request, nombre = 'id'): string {
  const r = uuid.safeParse(req.params[nombre])
  if (!r.success) throw noEncontrado('No existe')
  return r.data
}

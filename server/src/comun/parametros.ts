// Parámetros de ruta comunes. Un id que no es UUID no puede existir: responde 404 sin ir a la base.
import type { Request } from 'express'
import { z } from 'zod'
import { noEncontrado } from './errores.ts'

const uuid = z.uuid()

export const esUuid = (valor: unknown): valor is string => uuid.safeParse(valor).success

export function idDe(req: Request, nombre = 'id'): string {
  const valor = req.params[nombre]
  if (!esUuid(valor)) throw noEncontrado('No existe')
  return valor
}

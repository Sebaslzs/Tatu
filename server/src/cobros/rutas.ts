// O4/O5/O6 · Las rutas reciben y validan (Zod); la lógica vive en orquestacion.ts.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export function rutasCobros(): Router {
  const r = Router()
  r.post('/', noImplementado) // O4/O5 · solicitar cobro (canal cuenta o retiro)
  r.post('/:id/confirmar', noImplementado) // O5 · PIN y pago
  r.get('/:id', noImplementado) // O6 · consultar estado
  return r
}

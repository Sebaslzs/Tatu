// O4/O5/O6 · Las rutas reciben y validan (Zod); la lógica vive en orquestacion.ts.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export const rutasCobros = Router()

rutasCobros.post('/', noImplementado) // O4/O5 · solicitar cobro (canal cuenta o retiro)
rutasCobros.post('/:id/confirmar', noImplementado) // O5 · PIN y pago
rutasCobros.get('/:id', noImplementado) // O6 · consultar estado

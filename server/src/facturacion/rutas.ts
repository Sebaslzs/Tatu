// /ventas · HU-27: reenviar a facturación la compra registrada en un retiro.
import { Router } from 'express'
import { idDe } from '../comun/parametros.ts'
import type { ServicioFacturacion } from './servicio.ts'

export function rutasVentas(servicio: ServicioFacturacion): Router {
  const r = Router()

  r.post('/:id/reenviar', async (req, res) => {
    res.json(await servicio.reenviar(idDe(req)))
  })

  return r
}

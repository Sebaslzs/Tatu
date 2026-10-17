// /cobros · O4, O5 y O6. Las rutas reciben y validan (Zod); el servicio decide.
import { Router } from 'express'
import { validar } from '../comun/errores.ts'
import { conAliasCedula } from '../comun/alias.ts'
import { idDe } from '../comun/parametros.ts'
import { Confirmacion, EntradaCobro } from './esquemas.ts'
import type { ServicioCobros } from './servicio.ts'

export function rutasCobros(servicio: ServicioCobros): Router {
  const r = Router()

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.solicitar(validar(EntradaCobro, conAliasCedula(req.body))))
  })

  r.post('/:id/confirmar', async (req, res) => {
    const { status, cobro } = await servicio.confirmar(idDe(req), validar(Confirmacion, req.body))
    res.status(status).json(cobro)
  })

  r.post('/:id/cancelar', async (req, res) => {
    res.json(await servicio.cancelar(idDe(req)))
  })

  r.get('/:id', async (req, res) => {
    res.json(await servicio.consultar(idDe(req)))
  })

  return r
}

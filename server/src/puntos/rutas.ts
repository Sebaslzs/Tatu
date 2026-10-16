// /puntos · HU-03.
import { Router } from 'express'
import { validar } from '../comun/errores.ts'
import { EntradaPunto } from './esquemas.ts'
import type { ServicioPuntos } from './servicio.ts'

export function rutasPuntos(servicio: ServicioPuntos): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    res.json(await servicio.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.registrar(validar(EntradaPunto, req.body)))
  })

  return r
}

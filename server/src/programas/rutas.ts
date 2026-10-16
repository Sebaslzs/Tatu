// /programas · Las rutas reciben y validan; el servicio decide.
import { Router } from 'express'
import { validar } from '../comun/errores.ts'
import { idDe } from '../comun/parametros.ts'
import { noImplementado } from '../noImplementado.ts'
import { EdicionPrograma, EntradaPrograma } from './esquemas.ts'
import type { ServicioProgramas } from './servicio.ts'

export function rutasProgramas(servicio: ServicioProgramas): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    res.json(await servicio.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.crear(validar(EntradaPrograma, req.body)))
  })

  r.get('/:id', async (req, res) => {
    res.json(await servicio.leer(idDe(req)))
  })

  r.patch('/:id', async (req, res) => {
    res.json(await servicio.editar(idDe(req), validar(EdicionPrograma, req.body)))
  })

  r.get('/:id/liquidacion', async (req, res) => {
    res.json(await servicio.resumenLiquidacion(idDe(req)))
  })

  r.post('/:id/autorizar', noImplementado) // O2 · grant interactivo con tope (HU-04)
  r.get('/:id/tablero', noImplementado) // O7 · autorizado / cobrado / nunca salió (HU-15)
  r.post('/:id/cerrar', noImplementado) // O8 · grant.cancel o token.revoke (HU-17)

  return r
}

/** GET /callback/:id · vuelve de la Test Wallet; verifica el hash y hace grant.continue (O2). */
export function rutasCallbackProgramas(): Router {
  const r = Router()
  r.get('/:id', noImplementado)
  return r
}

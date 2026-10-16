// /programas y /callback · Las rutas reciben y validan; los servicios deciden.
import { Router } from 'express'
import { z } from 'zod'
import { validar } from '../comun/errores.ts'
import { idDe } from '../comun/parametros.ts'
import { noImplementado } from '../noImplementado.ts'
import type { ServicioAutorizacion } from './autorizacion.ts'
import type { CicloPrograma } from './ciclo.ts'
import { EdicionPrograma, EntradaPrograma } from './esquemas.ts'
import type { ServicioProgramas } from './servicio.ts'

export interface ServiciosProgramas {
  programas: ServicioProgramas
  autorizacion: ServicioAutorizacion
  ciclo: CicloPrograma
}

export function rutasProgramas({ programas, autorizacion, ciclo }: ServiciosProgramas): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    res.json(await programas.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await programas.crear(validar(EntradaPrograma, req.body)))
  })

  r.get('/:id', async (req, res) => {
    res.json(await programas.leer(idDe(req)))
  })

  r.patch('/:id', async (req, res) => {
    res.json(await programas.editar(idDe(req), validar(EdicionPrograma, req.body)))
  })

  r.get('/:id/liquidacion', async (req, res) => {
    res.json(await programas.resumenLiquidacion(idDe(req)))
  })

  r.post('/:id/autorizar', async (req, res) => {
    res.json(await autorizacion.autorizar(idDe(req)))
  })

  r.post('/:id/cancelar-aprobacion', async (req, res) => {
    res.json(await autorizacion.cancelarAprobacion(idDe(req)))
  })

  r.post('/:id/pausar', async (req, res) => {
    res.json(await ciclo.pausar(idDe(req)))
  })

  r.post('/:id/reanudar', async (req, res) => {
    res.json(await ciclo.reanudar(idDe(req)))
  })

  r.get('/:id/tablero', noImplementado) // O7 · autorizado / cobrado / nunca salió (HU-15)
  r.post('/:id/cerrar', noImplementado) // O8 · revocar el permiso (HU-17)

  return r
}

const ParametrosCallback = z.object({
  hash: z.string().optional(),
  interact_ref: z.string().optional(),
  result: z.string().optional(),
})

/** GET /callback/:id · vuelve de la Test Wallet; verifica el hash y hace grant.continue (O2). */
export function rutasCallbackProgramas(autorizacion: ServicioAutorizacion): Router {
  const r = Router()

  r.get('/:id', async (req, res) => {
    // Un query malformado se trata como «sin datos»: el callback siempre tiene a dónde volver
    const q = ParametrosCallback.safeParse(req.query)
    res.redirect(302, await autorizacion.callback(req.params.id ?? '', q.success ? q.data : {}))
  })

  return r
}

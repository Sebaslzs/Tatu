// /cuentas · O3 y HU-07. Las rutas reciben y validan; el servicio decide.
import { Router } from 'express'
import { z } from 'zod'
import { conAliasCedula } from '../comun/alias.ts'
import { validar } from '../comun/errores.ts'
import { documento } from '../liquidacion/contrato.ts'
import { TipoLlave } from '../puente/contrato.ts'
import { EntradaCuenta } from './esquemas.ts'
import type { ServicioCuentas } from './servicio.ts'

const ParametrosCallback = z.object({
  hash: z.string().optional(),
  interact_ref: z.string().optional(),
  result: z.string().optional(),
})

export function rutasCuentas(servicio: ServicioCuentas): Router {
  const r = Router()

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.enlazar(validar(EntradaCuenta, conAliasCedula(req.body))))
  })

  // «¿Eres Ana M*** R***?» antes de enlazar una llave (CA-07.01)
  r.get('/llaves/:tipo/:valor', async (req, res) => {
    res.json(await servicio.consultarLlave(validar(TipoLlave, req.params.tipo), req.params.valor ?? ''))
  })

  // Va antes de /:documento para que «callback» no se lea como cédula
  r.get('/callback/:id', async (req, res) => {
    const q = ParametrosCallback.safeParse(req.query)
    res.redirect(302, await servicio.callback(req.params.id ?? '', q.success ? q.data : {}))
  })

  r.get('/:documento', async (req, res) => {
    res.json(await servicio.estado(validar(documento, req.params.documento)))
  })

  return r
}

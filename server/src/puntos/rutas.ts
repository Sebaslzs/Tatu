// /puntos · HU-03 (registro) y HU-10 (lo que el punto consulta, con su caja).
import { Router } from 'express'
import { z } from 'zod'
import { conAliasCedula } from '../comun/alias.ts'
import { validar } from '../comun/errores.ts'
import { idDe } from '../comun/parametros.ts'
import { documento } from '../liquidacion/contrato.ts'
import type { ConsultasPunto } from './consultas.ts'
import { EntradaPunto } from './esquemas.ts'
import type { ServicioPuntos } from './servicio.ts'

const Periodo = z.enum(['hoy', '7d', 'todo']).catch('hoy')

export function rutasPuntos(servicio: ServicioPuntos, consultas: ConsultasPunto): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    res.json(await servicio.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.registrar(validar(EntradaPunto, req.body)))
  })

  // CA-10.01: el punto digita la cédula y ve qué subsidios puede pagarle hoy
  r.get('/:id/pagos', async (req, res) => {
    const { documento: c } = validar(z.object({ documento }), conAliasCedula(req.query))
    res.json(await consultas.pagosDe(idDe(req), c))
  })

  r.get('/:id/cobros', async (req, res) => {
    res.json(await consultas.cobrosDe(idDe(req), Periodo.parse(req.query.desde)))
  })

  // La caja del punto: cuánto entregó, cuánto le reembolsaron y en cuánto tiempo
  r.get('/:id/resumen', async (req, res) => {
    res.json(await consultas.caja(idDe(req), Periodo.parse(req.query.desde)))
  })

  return r
}

// /beneficiarios · el equipo de prueba (quién está registrado, con qué billetera y si tiene PIN) y
// el resumen «tengo $230.000» (HU-08).
import { Router } from 'express'
import { conAliasCedula } from '../comun/alias.ts'
import { validar } from '../comun/errores.ts'
import { documento } from '../liquidacion/contrato.ts'
import { EntradaPersona, EntradaPin } from './esquemas.ts'
import type { ConsultaResumenBeneficiario } from './resumen.ts'
import type { ServicioBeneficiarios } from './servicio.ts'

export function rutasBeneficiarios(servicio: ServicioBeneficiarios, resumen: ConsultaResumenBeneficiario): Router {
  const r = Router()

  // Para el selector de la entrada; va antes de /:documento para que «demo» no se lea como cédula
  r.get('/demo', async (_req, res) => {
    res.json(await servicio.demo())
  })

  // HU-08: «Tienes $230.000», su cuenta, los puntos y el historial
  r.get('/:documento/resumen', async (req, res) => {
    res.json(await resumen.de(validar(documento, req.params.documento)))
  })

  r.get('/', async (_req, res) => {
    res.json(await servicio.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.registrar(validar(EntradaPersona, conAliasCedula(req.body))))
  })

  r.post('/:documento/pin', async (req, res) => {
    res.json(await servicio.ponerPin(validar(documento, req.params.documento), validar(EntradaPin, req.body).pin))
  })

  return r
}

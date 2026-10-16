// /beneficiarios · el equipo de prueba: quién está registrado, con qué billetera y si tiene PIN.
// El resumen «tengo $230.000» (HU-08) se suma con los cobros.
import { Router } from 'express'
import { validar } from '../comun/errores.ts'
import { cedula } from '../liquidacion/contrato.ts'
import { EntradaPersona, EntradaPin } from './esquemas.ts'
import type { ServicioBeneficiarios } from './servicio.ts'

export function rutasBeneficiarios(servicio: ServicioBeneficiarios): Router {
  const r = Router()

  r.get('/', async (_req, res) => {
    res.json(await servicio.listar())
  })

  r.post('/', async (req, res) => {
    res.status(201).json(await servicio.registrar(validar(EntradaPersona, req.body)))
  })

  r.post('/:cedula/pin', async (req, res) => {
    res.json(await servicio.ponerPin(validar(cedula, req.params.cedula), validar(EntradaPin, req.body).pin))
  })

  return r
}

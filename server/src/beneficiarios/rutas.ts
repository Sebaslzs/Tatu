// /beneficiarios · el equipo de prueba (quién está registrado, con qué billetera y si tiene PIN) y
// el resumen «tengo $230.000» (HU-08).
import { Router } from 'express'
import { validar } from '../comun/errores.ts'
import { cedula } from '../liquidacion/contrato.ts'
import { EntradaPersona, EntradaPin } from './esquemas.ts'
import type { ConsultaResumenBeneficiario } from './resumen.ts'
import type { ServicioBeneficiarios } from './servicio.ts'

export function rutasBeneficiarios(servicio: ServicioBeneficiarios, resumen: ConsultaResumenBeneficiario): Router {
  const r = Router()

  // HU-08: «Tienes $230.000», su cuenta, los puntos y el historial
  r.get('/:cedula/resumen', async (req, res) => {
    res.json(await resumen.de(validar(cedula, req.params.cedula)))
  })

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

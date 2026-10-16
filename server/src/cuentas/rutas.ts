// O3 · Enlazar la cuenta del beneficiario (llave Bre-B o wallet Open Payments).
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export function rutasCuentas(): Router {
  const r = Router()
  r.post('/', noImplementado) // O3 · enlazar cuenta (HU-07)
  r.get('/callback/:id', noImplementado) // O3 · callback de verificación (P-11)
  return r
}

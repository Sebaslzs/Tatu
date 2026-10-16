// O3 · Enlazar la cuenta del beneficiario (llave Bre-B o wallet Open Payments).
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export const rutasCuentas = Router()

rutasCuentas.post('/', noImplementado) // O3 · enlazar cuenta
rutasCuentas.get('/callback/:id', noImplementado) // O3 · callback de verificación (P-11)

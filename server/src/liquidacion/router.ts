// Liquidación simulada de la entidad (AD-13): módulo con router propio en /api/liquidacion.
// Tatú la consulta por HTTP en LIQUIDACION_URL, nunca por SQL, para poder separarla
// cambiando solo la variable.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export const routerLiquidacion = Router()

routerLiquidacion.get('/:programa/:cedula', noImplementado) // pago disponible por cédula
routerLiquidacion.post('/pin', noImplementado) // validación del PIN de prueba (AD-14)

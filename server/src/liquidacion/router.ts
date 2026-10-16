// Liquidación simulada de la entidad (AD-13): router propio en /api/liquidacion.
// La plataforma la consulta por HTTP en LIQUIDACION_URL, nunca por SQL, para poder separarla
// cambiando solo la variable.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'
import { cedula, MENSAJE_CEDULA_NO_ENCONTRADA } from './contrato.ts'
import type { LiquidacionSimulada } from './simulador.ts'

export function routerLiquidacion(simulador: LiquidacionSimulada): Router {
  const r = Router()

  r.get('/programas/:programaId/resumen', (req, res) => {
    res.json(simulador.resumen(req.params.programaId))
  })

  r.get('/programas/:programaId/pagos/:cedula', (req, res) => {
    const valida = cedula.safeParse(req.params.cedula)
    const pago = valida.success ? simulador.pago(req.params.programaId, valida.data) : undefined
    if (!pago) {
      // CA-02.04: un formato inválido responde igual que una cédula inexistente
      res.status(404).json({ error: { codigo: 'CedulaNoEncontrada', mensaje: MENSAJE_CEDULA_NO_ENCONTRADA } })
      return
    }
    res.json(pago)
  })

  r.post('/pin', noImplementado) // validación del PIN de prueba (AD-14, HU-11)

  return r
}

// Liquidación simulada de la entidad (AD-13): router propio en /api/liquidacion.
// La plataforma la consulta por HTTP en LIQUIDACION_URL, nunca por SQL, para poder separarla
// cambiando solo la variable.
import { Router, type Response } from 'express'
import { z } from 'zod'
import { cedula, Inscripcion, MENSAJE_CEDULA_NO_ENCONTRADA, NuevoPin, PedidoPin } from './contrato.ts'
import type { LiquidacionSimulada } from './simulador.ts'

/** Máximo de cédulas por consulta de nombres. */
const MAX_CEDULAS = 500

function error(res: Response, status: number, codigo: string, mensaje: string) {
  res.status(status).json({ error: { codigo, mensaje } })
}

const cedulaNoEncontrada = (res: Response) => error(res, 404, 'CedulaNoEncontrada', MENSAJE_CEDULA_NO_ENCONTRADA)

export function routerLiquidacion(simulador: LiquidacionSimulada): Router {
  const r = Router()

  r.get('/programas/:programaId/resumen', (req, res) => {
    res.json(simulador.resumen(req.params.programaId))
  })

  r.get('/programas/:programaId/pagos/:cedula', (req, res) => {
    const valida = cedula.safeParse(req.params.cedula)
    const pago = valida.success ? simulador.pago(req.params.programaId, valida.data) : undefined
    // CA-02.04: un formato inválido responde igual que una cédula inexistente
    if (pago) res.json(pago)
    else cedulaNoEncontrada(res)
  })

  // Nombre y si tiene PIN de varias cédulas: ?cedulas=1000000001,1000000002
  r.get('/personas', (req, res) => {
    const lista = String(req.query.cedulas ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    const validas = z.array(cedula).max(MAX_CEDULAS).safeParse(lista)
    if (!validas.success) return error(res, 400, 'EntradaInvalida', `Hasta ${MAX_CEDULAS} cédulas válidas, separadas por coma`)
    res.json(simulador.buscar(validas.data))
  })

  // «Equipo de prueba» hace el papel del gobierno: inscribe a la persona o la actualiza
  r.post('/personas', (req, res) => {
    const e = Inscripcion.safeParse(req.body)
    if (!e.success) return error(res, 400, 'EntradaInvalida', e.error.issues.map((i) => i.message).join('; '))
    res.json(simulador.inscribir(e.data.cedula, e.data.nombre, e.data.pin))
  })

  r.post('/personas/:cedula/pin', (req, res) => {
    const doc = cedula.safeParse(req.params.cedula)
    const cuerpo = NuevoPin.safeParse(req.body)
    if (!doc.success || !cuerpo.success) return error(res, 400, 'EntradaInvalida', 'Cédula o PIN inválido')
    if (!simulador.ponerPin(doc.data, cuerpo.data.pin)) return cedulaNoEncontrada(res)
    res.json({ cedula: doc.data, tienePin: true })
  })

  // AD-14: el PIN lo valida el servicio simulado; la plataforma no lo guarda
  r.post('/pin/validar', (req, res) => {
    const pedido = PedidoPin.safeParse(req.body)
    res.json({ valido: pedido.success && simulador.validarPin(pedido.data.cedula, pedido.data.pin) })
  })

  return r
}

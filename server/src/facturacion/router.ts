// Facturación simulada (HU-27): router propio en /api/facturacion, como la liquidación y el puente.
// Tatú la consulta por HTTP en FACTURACION_URL: cambiar esa variable conecta el sistema real.
import { Router, type Response } from 'express'
import { z } from 'zod'
import { SolicitudFactura } from './contrato.ts'
import type { FacturacionSimulada } from './simulador.ts'

function error(res: Response, status: number, codigo: string, mensaje: string) {
  res.status(status).json({ error: { codigo, mensaje } })
}

const Modo = z.strictObject({ modo: z.enum(['normal', 'caido', 'rechaza']) })

export function routerFacturacion(simulador: FacturacionSimulada): Router {
  const r = Router()

  r.post('/facturas', (req, res) => {
    simulador.intentos += 1
    if (simulador.modo === 'caido') return error(res, 503, 'NoDisponible', 'Facturación está en mantenimiento')
    const llave = req.get('idempotency-key')
    if (!llave) return error(res, 400, 'FaltaLlave', 'Falta la cabecera Idempotency-Key')
    const solicitud = SolicitudFactura.safeParse(req.body)
    if (!solicitud.success) return error(res, 400, 'EntradaInvalida', 'La solicitud no cumple el contrato')
    if (simulador.modo === 'rechaza') return error(res, 422, 'DatosInvalidos', 'El comprador no tiene los datos que exige la factura')
    const { factura, nueva } = simulador.recibir(llave, solicitud.data)
    res.status(nueva ? 201 : 200).json({ id: factura.id, recibidaEn: factura.recibidaEn })
  })

  // Lo que recibió, para ver en la demo que cada venta llegó una sola vez
  r.get('/facturas', (_req, res) => {
    res.json(simulador.listar().map(({ id, idVenta, recibidaEn, solicitud }) => ({ id, idVenta, recibidaEn, valor: solicitud.venta.valor, referenciaCobro: solicitud.medioDePago.referenciaCobro })))
  })

  // Solo en la demo: poner el sistema caído o rechazando para ver el reintento
  r.post('/modo', (req, res) => {
    const pedido = Modo.safeParse(req.body)
    if (!pedido.success) return error(res, 400, 'EntradaInvalida', 'modo: normal, caido o rechaza')
    simulador.modo = pedido.data.modo
    res.json({ modo: simulador.modo })
  })

  return r
}

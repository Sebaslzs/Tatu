// Liquidación simulada de la entidad (AD-13): router propio en /api/liquidacion.
// La plataforma la consulta por HTTP en LIQUIDACION_URL, nunca por SQL, para poder separarla
// cambiando solo la variable.
import { Router, type Response } from 'express'
import { z } from 'zod'
import { documento, Inscripcion, MENSAJE_CEDULA_NO_ENCONTRADA, NuevoPin, PedidoPin, type DatosLiquidacion } from './contrato.ts'

/** Máximo de cédulas por consulta de nombres. */
const MAX_CEDULAS = 500

function error(res: Response, status: number, codigo: string, mensaje: string) {
  res.status(status).json({ error: { codigo, mensaje } })
}

const cedulaNoEncontrada = (res: Response) => error(res, 404, 'CedulaNoEncontrada', MENSAJE_CEDULA_NO_ENCONTRADA)

export function routerLiquidacion(simulador: DatosLiquidacion): Router {
  const r = Router()

  r.get('/programas/:programaId/resumen', async (req, res) => {
    res.json(await simulador.resumen(req.params.programaId))
  })

  r.get('/programas/:programaId/pagos/:documento', async (req, res) => {
    const valida = documento.safeParse(req.params.documento)
    const pago = valida.success ? await simulador.pago(req.params.programaId, valida.data) : undefined
    // CA-02.04: un formato inválido responde igual que una cédula inexistente
    if (pago) res.json(pago)
    else cedulaNoEncontrada(res)
  })

  // Nombre y si tiene PIN de varias cédulas: ?documentos=1000000001,1000000002
  r.get('/personas', async (req, res) => {
    const lista = String(req.query.documentos ?? '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
    const validas = z.array(documento).max(MAX_CEDULAS).safeParse(lista)
    if (!validas.success) return error(res, 400, 'EntradaInvalida', `Hasta ${MAX_CEDULAS} cédulas válidas, separadas por coma`)
    res.json(await simulador.buscar(validas.data))
  })

  // «Equipo de prueba» hace el papel del gobierno: inscribe a la persona o la actualiza
  r.post('/personas', async (req, res) => {
    const e = Inscripcion.safeParse(req.body)
    if (!e.success) return error(res, 400, 'EntradaInvalida', e.error.issues.map((i) => i.message).join('; '))
    res.json(await simulador.inscribir(e.data.documento, e.data.nombre, e.data.pin))
  })

  r.post('/personas/:documento/pin', async (req, res) => {
    const doc = documento.safeParse(req.params.documento)
    const cuerpo = NuevoPin.safeParse(req.body)
    if (!doc.success || !cuerpo.success) return error(res, 400, 'EntradaInvalida', 'Cédula o PIN inválido')
    if (!(await simulador.ponerPin(doc.data, cuerpo.data.pin))) return cedulaNoEncontrada(res)
    res.json({ documento: doc.data, tienePin: true })
  })

  // AD-14: el PIN lo valida el servicio simulado; la plataforma no lo guarda
  r.post('/pin/validar', async (req, res) => {
    const pedido = PedidoPin.safeParse(req.body)
    res.json({ valido: pedido.success && (await simulador.validarPin(pedido.data.documento, pedido.data.pin)) })
  })

  return r
}

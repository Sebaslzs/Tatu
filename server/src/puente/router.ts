// Banco puente de Bre-B simulado (AD-21): traduce una llave a una billetera de la Test Wallet.
// Mismo patrón que la liquidación: /api/puente, consultado en PUENTE_URL. Las rutas de registro las
// usa «Equipo de prueba», que hace de banco de cada persona.
import { Router, type Response } from 'express'
import { documento } from '../liquidacion/contrato.ts'
import { Coincidencia, Llave, normalizarLlave, PedidoPertenece, TipoLlave, type Resolucion } from './contrato.ts'
import { enmascararNombre } from './enmascarar.ts'
import type { PuenteSimulado } from './simulador.ts'

const NO_EXISTE = 'Esa llave no existe en Bre-B'

function error(res: Response, status: number, codigo: string, mensaje: string) {
  res.status(status).json({ error: { codigo, mensaje } })
}

/** La llave de la ruta, ya limpia; null si el tipo o el valor no sirven (responde 404: no existe). */
function llaveDe(tipo: string, valor: string): { tipo: TipoLlave; valor: string } | null {
  const t = TipoLlave.safeParse(tipo)
  if (!t.success) return null
  const v = normalizarLlave(t.data, valor)
  return v ? { tipo: t.data, valor: v } : null
}

export function routerPuente(puente: PuenteSimulado): Router {
  const r = Router()

  // Lo que ve cualquiera que consulta una llave: a dónde llega y el titular enmascarado
  r.get('/llaves/:tipo/:valor', (req, res) => {
    const k = llaveDe(req.params.tipo, req.params.valor)
    const l = k && puente.obtener(k.tipo, k.valor)
    if (!l) return error(res, 404, 'LlaveNoExiste', NO_EXISTE)
    const resolucion: Resolucion = { tipo: l.tipo, valor: l.valor, billetera: l.billetera, titular: enmascararNombre(l.nombreTitular) }
    res.json(resolucion)
  })

  // RN-16: «¿esta llave es de esta cédula?», sin revelar de quién es
  r.post('/llaves/:tipo/:valor/pertenece', (req, res) => {
    const k = llaveDe(req.params.tipo, req.params.valor)
    const l = k && puente.obtener(k.tipo, k.valor)
    if (!l) return error(res, 404, 'LlaveNoExiste', NO_EXISTE)
    const pedido = PedidoPertenece.safeParse(req.body)
    res.json(Coincidencia.parse({ pertenece: pedido.success && pedido.data.documento === l.documentoTitular }))
  })

  // «Equipo de prueba» hace de banco: las llaves de una persona
  r.get('/llaves', (req, res) => {
    const doc = documento.safeParse(req.query.documento)
    if (!doc.success) return error(res, 400, 'EntradaInvalida', 'Falta ?documento= válida')
    res.json(puente.deTitular(doc.data))
  })

  r.post('/llaves', (req, res) => {
    const e = Llave.safeParse(req.body)
    const valor = e.success ? normalizarLlave(e.data.tipo, e.data.valor) : null
    if (!e.success || !valor) {
      return error(res, 400, 'EntradaInvalida', e.success ? `No es una llave de tipo ${e.data.tipo} válida` : e.error.issues.map((i) => i.message).join('; '))
    }
    if (e.data.tipo === 'cedula' && valor !== e.data.documentoTitular) {
      return error(res, 422, 'CedulaAjena', 'Una llave tipo cédula solo la registra su titular')
    }
    const llave = { ...e.data, valor }
    const resultado = puente.registrar(llave)
    if (resultado === 'deOtro') return error(res, 409, 'LlaveEnUso', 'Esa llave ya es de otra persona')
    res.status(resultado === 'creada' ? 201 : 200).json(llave)
  })

  r.delete('/llaves/:tipo/:valor', (req, res) => {
    const k = llaveDe(req.params.tipo, req.params.valor)
    if (!k || !puente.borrar(k.tipo, k.valor)) return error(res, 404, 'LlaveNoExiste', NO_EXISTE)
    res.status(204).end()
  })

  return r
}

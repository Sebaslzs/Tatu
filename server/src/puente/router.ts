// Banco puente de Bre-B simulado (AD-21): traduce una llave a una wallet address de la
// Test Wallet. Mismo patrón que la liquidación: /api/puente, consultado en PUENTE_URL.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export function routerPuente(): Router {
  const r = Router()
  r.get('/llaves/:tipo/:llave', noImplementado) // resolver llave → wallet + titular enmascarado
  return r
}

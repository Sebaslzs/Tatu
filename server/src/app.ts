// Arma la app Express y monta los módulos bajo /api (Arquitectura § 3.6).
// La usan main.ts (proceso local) y, más adelante, la función de Vercel.
import express, { type ErrorRequestHandler } from 'express'
import { rutasProgramas, rutasCallbackProgramas } from './programas/rutas.ts'
import { rutasCuentas } from './cuentas/rutas.ts'
import { rutasCobros } from './cobros/rutas.ts'
import { routerLiquidacion } from './liquidacion/router.ts'
import { routerPuente } from './puente/router.ts'
import { rutasExtras } from './extras.ts'

export function crearApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  const api = express.Router()
  api.get('/salud', (_req, res) => {
    res.json({ estado: 'ok' })
  })
  api.use('/programas', rutasProgramas)
  api.use('/callback', rutasCallbackProgramas)
  api.use('/cuentas', rutasCuentas)
  api.use('/cobros', rutasCobros)
  api.use('/liquidacion', routerLiquidacion)
  api.use('/puente', routerPuente)
  api.use(rutasExtras)

  app.use('/api', api)

  const manejarError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ error: 'ErrorInterno' })
  }
  app.use(manejarError)

  return app
}

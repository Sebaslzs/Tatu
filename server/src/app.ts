// Arma la app Express y monta los módulos bajo /api (Arquitectura § 3.6). No crea dependencias:
// las recibe del contenedor.
import express from 'express'
import { manejarErrores, rutaNoEncontrada } from './comun/errores.ts'
import type { Contenedor } from './contenedor.ts'
import { rutasCobros } from './cobros/rutas.ts'
import { rutasBeneficiarios } from './beneficiarios/rutas.ts'
import { rutasBilleteras } from './billeteras/rutas.ts'
import { rutasCuentas } from './cuentas/rutas.ts'
import { rutasEntidades } from './entidades/rutas.ts'
import { rutasExtras } from './extras.ts'
import { routerLiquidacion } from './liquidacion/router.ts'
import { construirDocumentoOpenApi } from './openapi/documento.ts'
import { rutasDocumentacion } from './openapi/rutas.ts'
import { rutasCallbackProgramas, rutasProgramas } from './programas/rutas.ts'
import { routerPuente } from './puente/router.ts'
import { rutasPuntos } from './puntos/rutas.ts'

export function crearApp(c: Contenedor) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json())

  const api = express.Router()
  api.get('/salud', (_req, res) => {
    res.json({ estado: 'ok' })
  })
  api.use('/entidades', rutasEntidades(c.uow.repos.entidades))
  api.use('/programas', rutasProgramas(c.programas))
  api.use('/callback', rutasCallbackProgramas(c.programas.autorizacion))
  api.use('/billeteras', rutasBilleteras(c.billeteras))
  api.use('/puntos', rutasPuntos(c.puntos, c.consultasPunto))
  api.use('/cuentas', rutasCuentas(c.cuentas))
  api.use('/beneficiarios', rutasBeneficiarios(c.beneficiarios, c.resumenBeneficiario))
  api.use('/cobros', rutasCobros(c.cobros))
  api.use('/liquidacion', routerLiquidacion(c.simuladorLiquidacion))
  api.use('/puente', routerPuente(c.simuladorPuente))
  api.use(rutasExtras(c.config))
  api.use(rutasDocumentacion(construirDocumentoOpenApi()))
  api.use(rutaNoEncontrada)

  app.use('/api', api)
  app.use(manejarErrores)
  return app
}

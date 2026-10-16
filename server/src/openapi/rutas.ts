// /api/openapi.json (el documento) y /api/docs (Swagger UI).
import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import type { Json } from './ayudas.ts'

export const RUTA_DOCUMENTO = '/api/openapi.json'

export function rutasDocumentacion(documento: Json): Router {
  const r = Router()

  r.get('/openapi.json', (_req, res) => {
    res.json(documento)
  })

  // La interfaz descarga el documento por URL en vez de incrustarlo: swagger-ui-express lo
  // insertaría con String.replace, que interpreta secuencias como «$`» dentro de los textos.
  r.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(null, {
      swaggerUrl: RUTA_DOCUMENTO,
      customSiteTitle: 'API de Tatú',
      swaggerOptions: { docExpansion: 'list', displayRequestDuration: true, tryItOutEnabled: true },
    }),
  )

  return r
}

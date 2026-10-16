// Escribe el documento OpenAPI en un archivo, p. ej. para importarlo en Postman o Bruno.
// Uso: pnpm --filter server exec tsx scripts/volcar-openapi.ts [ruta]   (por defecto, openapi.json)
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { construirDocumentoOpenApi } from '../src/openapi/documento.ts'

const destino = resolve(process.argv[2] ?? 'openapi.json')
writeFileSync(destino, `${JSON.stringify(construirDocumentoOpenApi(), null, 2)}\n`)
console.log(`Documento OpenAPI escrito en ${destino}`)

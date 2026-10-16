// Documento OpenAPI 3.1 de la API de Tatú. Se arma juntando las rutas de cada módulo
// (openapi/rutas/*): los cuerpos de entrada salen de los mismos esquemas Zod que validan la API y
// los de salida, de openapi/modelos.ts (que los tests de contrato comparan con las respuestas).
import type { Json } from './ayudas.ts'
import { jsonSchema } from './ayudas.ts'
import { MODELOS } from './modelos.ts'
import { rutasAutorizacion } from './rutas/autorizacion.ts'
import { rutasLiquidacion } from './rutas/liquidacion.ts'
import { rutasProgramas } from './rutas/programas.ts'
import { rutasPuntos } from './rutas/puntos.ts'
import { rutasSistema } from './rutas/sistema.ts'

const DESCRIPCION = [
  'Tatú convierte una liquidación ya aprobada de un subsidio en pagos bajo demanda con **Open Payments** (Interledger).',
  '',
  'Cubre la **épica 1 · Conexión del subsidio** (HU-01 a HU-03), la **autorización con Open Payments** (HU-04, HU-05) y pausar el programa (HU-18). Las rutas de los módulos siguientes (cuentas, cobros, tablero, cierre) existen pero responden `501 NoImplementado`.',
  '',
  '### Convenciones',
  '- **Errores**: siempre `{ "error": { "codigo", "mensaje" } }`. Decide con `codigo`; `mensaje` es para la persona.',
  '- **Montos**: entero en unidades mínimas, como texto, con `assetCode` y `assetScale` ($230.000,00 COP = `"23000000"`).',
  '- **Fechas**: un día `AAAA-MM-DD` se interpreta completo en hora de Bogotá (UTC−5); la API devuelve instantes ISO 8601 en UTC.',
  '- **Seguridad**: la API nunca devuelve tokens, URLs de gestión del permiso, nonces ni llaves.',
  '- **Sin login**: el rol (entidad, beneficiario, punto) se elige en la web; la identidad la prueban la billetera y el PIN.',
].join('\n')

const ETIQUETAS = [
  { name: 'Sistema', description: 'Salud y configuración.' },
  { name: 'Entidades', description: 'Entidades financiadoras.' },
  { name: 'Programas', description: 'HU-01 · Conectar un subsidio, editarlo y listarlo.' },
  { name: 'Autorización', description: 'HU-04 y HU-05 · Permiso con tope en el banco, su callback y la cancelación.' },
  { name: 'Ciclo de vida', description: 'HU-18 · Pausar y reanudar.' },
  { name: 'Puntos', description: 'HU-03 · Puntos de retiro y sedes de comercio.' },
  { name: 'Liquidación', description: 'HU-02 · Liquidación de la entidad (la plataforma consulta, no copia).' },
]

function componentes(): Json {
  const schemas: Json = {}
  for (const [nombre, esquema] of Object.entries(MODELOS)) schemas[nombre] = jsonSchema(esquema, 'output')
  return { schemas }
}

export function construirDocumentoOpenApi(): Json {
  return {
    openapi: '3.1.0',
    info: { title: 'API de Tatú', version: '0.1.0', description: DESCRIPCION },
    servers: [{ url: '/api', description: 'Esta instancia' }],
    tags: ETIQUETAS,
    paths: { ...rutasSistema(), ...rutasProgramas(), ...rutasAutorizacion(), ...rutasPuntos(), ...rutasLiquidacion() },
    components: componentes(),
  }
}

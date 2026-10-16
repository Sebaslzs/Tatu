// Documento OpenAPI 3.1 de la API de Tatú. Se arma juntando las rutas de cada módulo
// (openapi/rutas/*): los cuerpos de entrada salen de los mismos esquemas Zod que validan la API y
// los de salida, de openapi/modelos.ts (que los tests de contrato comparan con las respuestas).
import type { Json } from './ayudas.ts'
import { jsonSchema } from './ayudas.ts'
import { MODELOS } from './modelos.ts'
import { rutasAutorizacion } from './rutas/autorizacion.ts'
import { rutasBeneficiarios } from './rutas/beneficiarios.ts'
import { rutasCuentas } from './rutas/cuentas.ts'
import { rutasLiquidacion } from './rutas/liquidacion.ts'
import { rutasProgramas } from './rutas/programas.ts'
import { rutasPuente } from './rutas/puente.ts'
import { rutasPuntos } from './rutas/puntos.ts'
import { rutasSistema } from './rutas/sistema.ts'

const DESCRIPCION = [
  'Tatú convierte una liquidación ya aprobada de un subsidio en pagos bajo demanda con **Open Payments** (Interledger).',
  '',
  'Cubre la **épica 1 · Conexión del subsidio** (HU-01 a HU-03), la **autorización con Open Payments** (HU-04, HU-05), pausar el programa (HU-18) y las **cuentas del beneficiario** (HU-07) con su banco puente de Bre-B. Las rutas de los módulos siguientes (cobros, tablero, cierre) existen pero responden `501 NoImplementado`.',
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
  { name: 'Cuentas', description: 'HU-07 · Enlazar y verificar la cuenta del beneficiario (llave Bre-B o billetera).' },
  { name: 'Beneficiarios', description: 'Registro del equipo de prueba: personas y su PIN.' },
  { name: 'Liquidación', description: 'HU-02 · Liquidación de la entidad (la plataforma consulta, no copia): pagos, personas y PIN.' },
  { name: 'Banco puente', description: 'AD-21 · Banco puente de Bre-B simulado: resuelve llaves a billeteras, sin revelar al titular.' },
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
    paths: {
      ...rutasSistema(),
      ...rutasProgramas(),
      ...rutasAutorizacion(),
      ...rutasPuntos(),
      ...rutasCuentas(),
      ...rutasBeneficiarios(),
      ...rutasLiquidacion(),
      ...rutasPuente(),
    },
    components: componentes(),
  }
}

// Piezas reutilizables para armar el documento OpenAPI sin repetir estructura.
import { z } from 'zod'

export type Json = Record<string, unknown>

/** Zod → JSON Schema 2020-12 (el dialecto de OpenAPI 3.1), sin el `$schema` suelto. */
export function jsonSchema(esquema: z.ZodType, io: 'input' | 'output'): Json {
  const { $schema: _omitido, ...resto } = z.toJSONSchema(esquema, { io, unrepresentable: 'any' }) as Json
  return resto
}

export const ref = (nombre: string): Json => ({ $ref: `#/components/schemas/${nombre}` })

export const contenidoJson = (schema: Json, ejemplo?: unknown): Json => ({
  'application/json': { schema, ...(ejemplo === undefined ? {} : { example: ejemplo }) },
})

/** Una respuesta correcta con su modelo y un ejemplo. */
export const ok = (descripcion: string, schema: Json, ejemplo?: unknown): Json => ({
  description: descripcion,
  content: contenidoJson(schema, ejemplo),
})

/** Una respuesta de error con el formato único `{ error: { codigo, mensaje } }`. */
export const falla = (descripcion: string, codigo: string, mensaje: string): Json => ({
  description: descripcion,
  content: contenidoJson(ref('Error'), { error: { codigo, mensaje } }),
})

export const entradaInvalida = falla(
  '400 · El cuerpo no pasó la validación. El mensaje lista cada campo con su problema.',
  'EntradaInvalida',
  'vigenciaFin: la vigencia debe terminar después de empezar',
)

export const parametroUuid = (nombre: string, descripcion: string): Json => ({
  name: nombre,
  in: 'path',
  required: true,
  description: descripcion,
  schema: { type: 'string', format: 'uuid' },
  example: '22222222-2222-4222-8222-222222222222',
})

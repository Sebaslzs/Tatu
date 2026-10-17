// Ejemplos y respuestas que se repiten entre los módulos del documento OpenAPI.
import { falla, parametroUuid, type Json } from './ayudas.ts'

export const ID_PROGRAMA = '22222222-2222-4222-8222-222222222222'

export const PROGRAMA_EJEMPLO = {
  id: ID_PROGRAMA,
  entidadId: '11111111-1111-4111-8111-111111111111',
  nombre: 'Subsidio de transporte',
  tipo: 'subsidio',
  destino: 'libre',
  canales: ['cuenta', 'retiro'],
  categorias: [],
  billetera: 'https://ilp.interledger-test.dev/tatu-programa',
  moneda: { codigo: 'COP', escala: 2 },
  vigenciaInicio: '2026-10-01T05:00:00.000Z',
  vigenciaFin: '2027-01-01T04:59:59.999Z',
  estado: 'Borrador',
  montoPorPersona: '23000000',
  tope: null,
  permisoActivo: false,
  permisoVencido: false,
}

export const PUNTO_EJEMPLO = {
  id: '33333333-3333-4333-8333-333333333333',
  nombre: 'Droguería El Centro',
  direccion: 'Sin dirección',
  billetera: 'https://ilp.interledger-test.dev/tatu-punto1',
  tipo: 'retiro',
}

export const noEncontradoPrograma = falla('404 · El programa no existe (o el id no es un UUID).', 'NoEncontrado', 'Ese programa no existe')

export const liquidacionNoResponde = falla(
  '503 · La liquidación de la entidad no respondió (red, timeout, 5xx o respuesta fuera de contrato). No se guarda nada.',
  'LiquidacionNoResponde',
  'No pudimos consultar tu pago; intenta en un momento',
)

export const estadoNoPermite = (descripcion: string): Json =>
  falla(descripcion, 'EstadoNoPermite', 'El programa está en Borrador; esta acción pide Activo')

export const parametroPrograma: Json = parametroUuid('id', 'Identificador del programa.')

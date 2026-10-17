// Banco puente de Bre-B simulado (AD-21): lo que Tatú espera de un banco que opera Rafiki.
import { Llave, PedidoPertenece } from '../../puente/contrato.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'

const LLAVE_EJEMPLO = {
  tipo: 'celular',
  valor: '3001234567',
  documentoTitular: '1000000002',
  nombreTitular: 'Luis Gómez',
  billetera: 'https://ilp.interledger-test.dev/prueba-luis',
}

const parametros: Json[] = [
  { name: 'tipo', in: 'path', required: true, description: 'Tipo de llave.', schema: { type: 'string', enum: ['cedula', 'celular', 'correo', 'alfanumerica'] } },
  { name: 'valor', in: 'path', required: true, description: 'Valor de la llave.', schema: { type: 'string' }, example: '3001234567' },
]

const noExiste = falla('404 · La llave no existe en Bre-B (o el tipo o el valor no sirven).', 'LlaveNoExiste', 'Esa llave no existe en Bre-B')

export function rutasPuente(): Json {
  return {
    '/puente/llaves/{tipo}/{valor}': {
      parameters: parametros,
      get: {
        tags: ['Banco puente'],
        operationId: 'puenteResolverLlave',
        summary: 'Resolver una llave (RN-14, RN-18)',
        description:
          'Lo que ve cualquiera que consulta una llave: a qué billetera llega y el titular **enmascarado**. Nunca la cédula ni el nombre completo. La plataforma la usa al enlazar y de nuevo antes de pagar (RN-18).',
        responses: {
          200: ok('La llave existe.', ref('Resolucion'), { tipo: 'celular', valor: '3001234567', billetera: LLAVE_EJEMPLO.billetera, titular: 'Luis G***' }),
          404: noExiste,
        },
      },
      delete: {
        tags: ['Banco puente'],
        operationId: 'puenteBorrarLlave',
        summary: 'Borrar una llave (equipo de prueba)',
        description: 'El equipo hace de banco: borrar una llave permite probar RN-18 («tu llave ya no existe»).',
        responses: { 204: { description: 'La llave se borró.' }, 404: noExiste },
      },
    },
    '/puente/llaves/{tipo}/{valor}/pertenece': {
      parameters: parametros,
      post: {
        tags: ['Banco puente'],
        operationId: 'puentePertenece',
        summary: '¿Esta llave es de esta cédula? (RN-16)',
        description: 'Responde sí o no **sin revelar de quién es**. Tatú nunca guarda ni pide el nombre del titular.',
        requestBody: { required: true, content: contenidoJson(jsonSchema(PedidoPertenece, 'input'), { documento: '1000000002' }) },
        responses: { 200: ok('Coincidencia.', ref('Coincidencia'), { pertenece: true }), 404: noExiste },
      },
    },
    '/puente/llaves': {
      get: {
        tags: ['Banco puente'],
        operationId: 'puenteLlavesDe',
        summary: 'Llaves de una cédula (equipo de prueba)',
        parameters: [{ name: 'documento', in: 'query', required: true, description: 'Cédula del titular.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000002' }],
        responses: { 200: ok('Las llaves del titular.', { type: 'array', items: ref('Llave') }, [LLAVE_EJEMPLO]), 400: entradaInvalida },
      },
      post: {
        tags: ['Banco puente'],
        operationId: 'puenteRegistrarLlave',
        summary: 'Registrar o mover una llave (equipo de prueba)',
        description:
          'Registra la llave o, si ya era de esa misma persona, cambia la billetera a la que llega (así se prueba RN-18: la persona movió su llave a otro banco). Una llave tipo cédula solo la registra su titular.',
        requestBody: { required: true, content: contenidoJson(jsonSchema(Llave, 'input'), LLAVE_EJEMPLO) },
        responses: {
          200: ok('La llave ya existía y se actualizó.', ref('Llave'), LLAVE_EJEMPLO),
          201: ok('La llave se creó.', ref('Llave'), LLAVE_EJEMPLO),
          400: entradaInvalida,
          409: falla('409 · La llave ya es de otra persona.', 'LlaveEnUso', 'Esa llave ya es de otra persona'),
          422: falla('422 · Una llave tipo cédula solo la registra su titular.', 'CedulaAjena', 'Una llave tipo cédula solo la registra su titular'),
        },
      },
    },
  }
}

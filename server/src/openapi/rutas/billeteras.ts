// Billeteras · resolver una dirección antes de guardarla (CA-01.02, sin guardar nada).
import { entradaInvalida, falla, ok, ref, type Json } from '../ayudas.ts'

export function rutasBilleteras(): Json {
  return {
    '/billeteras/resolver': {
      get: {
        tags: ['Billeteras'],
        operationId: 'resolverBilletera',
        summary: 'Resolver una dirección de billetera',
        description:
          'Consulta el servidor de la billetera y devuelve su nombre y moneda, igual que al crear un programa o punto (CA-01.02). Sirve para validar la dirección antes de guardarla: no escribe nada.',
        parameters: [
          {
            name: 'direccion',
            in: 'query',
            required: true,
            description: 'Dirección a resolver. Acepta `$dominio/ruta` o `https://dominio/ruta`.',
            schema: { type: 'string', minLength: 3 },
            example: '$ilp.interledger-test.dev/tatu-programa',
          },
        ],
        responses: {
          200: ok('La billetera existe: dirección normalizada, nombre y moneda.', ref('BilleteraResuelta'), {
            id: 'https://ilp.interledger-test.dev/tatu-programa',
            nombre: 'Programa de prueba',
            moneda: { codigo: 'COP', escala: 2 },
          }),
          400: entradaInvalida,
          404: falla('404 · La billetera no resuelve (`BilleteraNoEncontrada`).', 'BilleteraNoEncontrada', 'No encontramos esa cuenta'),
          503: falla(
            '503 · El servidor de la billetera no respondió (`BilleteraSinRespuesta`). No es lo mismo que «no existe»: se puede reintentar.',
            'BilleteraSinRespuesta',
            'No pudimos consultar esa billetera; intenta en un momento',
          ),
        },
      },
    },
  }
}

// Billeteras · «Cuenta encontrada»: validar una billetera antes de guardarla.
import { entradaInvalida, falla, ok, ref, type Json } from '../ayudas.ts'

export function rutasBilleteras(): Json {
  return {
    '/billeteras/resolver': {
      get: {
        tags: ['Billeteras'],
        operationId: 'resolverBilletera',
        summary: 'Validar una billetera («Cuenta encontrada»)',
        description: 'Resuelve la billetera contra su servidor Open Payments y devuelve su id normalizado, su nombre público y su moneda real. Acepta `$dominio/ruta` o `https://dominio/ruta`.',
        parameters: [
          {
            name: 'direccion',
            in: 'query',
            required: true,
            description: 'Dirección de la billetera.',
            schema: { type: 'string', minLength: 3 },
            example: '$ilp.interledger-test.dev/mi-wallet',
          },
        ],
        responses: {
          200: ok('La billetera.', ref('Billetera'), { id: 'https://ilp.interledger-test.dev/mi-wallet', nombre: 'Mi Wallet', moneda: { codigo: 'COP', escala: 2 } }),
          400: entradaInvalida,
          404: falla('404 · La billetera no existe.', 'BilleteraNoEncontrada', 'No encontramos esa cuenta'),
          503: falla('503 · La Test Wallet no responde.', 'BilleteraSinRespuesta', 'No pudimos consultar esa billetera; intenta en un momento'),
        },
      },
    },
  }
}

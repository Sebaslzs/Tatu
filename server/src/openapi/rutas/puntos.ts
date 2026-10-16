// Puntos de retiro · HU-03.
import { EntradaPunto } from '../../puntos/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'
import { PUNTO_EJEMPLO } from '../compartido.ts'

export function rutasPuntos(): Json {
  return {
    '/puntos': {
      get: {
        tags: ['Puntos'],
        operationId: 'listarPuntos',
        summary: 'Listar puntos',
        responses: { 200: ok('Puntos y sedes, por nombre.', { type: 'array', items: ref('Punto') }, [PUNTO_EJEMPLO]) },
      },
      post: {
        tags: ['Puntos'],
        operationId: 'registrarPunto',
        summary: 'Registrar un punto de retiro (HU-03)',
        description: [
          'Registra un punto con su billetera, para que quien no tiene celular tenga dónde cobrar.',
          '',
          '- **CA-03.01** `tipo` por defecto `retiro`; sin dirección queda «Sin dirección». Si se indica `programaId`, la moneda del punto debe ser la del programa (`409 MonedaDistinta`).',
          '- **CA-03.02** la billetera se resuelve; si no existe, `404 BilleteraNoEncontrada` («No encontramos esa billetera del punto»). La respuesta incluye la moneda real.',
          '- **CA-03.03** se normaliza a `https://` sin barra final; una billetera repetida es `409 PuntoExiste`.',
          '- **CA-03.04** un punto de `retiro` no atiende compras con bono y una sede `compra` no hace retiros (`PuntoNoAtiendeCanal`, se aplica al solicitar un cobro).',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(jsonSchema(EntradaPunto, 'input'), {
            nombre: 'Droguería El Centro',
            billetera: '$ilp.interledger-test.dev/tatu-punto1',
            tipo: 'retiro',
          }),
        },
        responses: {
          201: ok('Punto registrado.', ref('PuntoRegistrado'), { ...PUNTO_EJEMPLO, moneda: { assetCode: 'COP', assetScale: 2 } }),
          400: entradaInvalida,
          404: falla('404 · La billetera no resuelve (`BilleteraNoEncontrada`) o el programa no existe.', 'BilleteraNoEncontrada', 'No encontramos esa billetera del punto'),
          409: falla('409 · `PuntoExiste` (billetera repetida) o `MonedaDistinta` (distinta a la del programa).', 'PuntoExiste', 'Esa billetera ya es del punto «Droguería El Centro»'),
          503: falla('503 · El servidor de la billetera no respondió.', 'BilleteraSinRespuesta', 'No pudimos consultar esa billetera; intenta en un momento'),
        },
      },
    },
  }
}

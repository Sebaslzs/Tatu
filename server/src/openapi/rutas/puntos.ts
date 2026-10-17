// Puntos de retiro · HU-03 y consultas de caja · HU-10.
import { EntradaPunto } from '../../puntos/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, parametroUuid, ref, type Json } from '../ayudas.ts'
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
    '/puntos/{id}/pagos': {
      parameters: [
        parametroUuid('id', 'Identificador del punto.'),
        {
          name: 'documento',
          in: 'query',
          required: true,
          description: 'Cédula digitada en caja.',
          schema: { type: 'string', pattern: '^[A-Za-z0-9]{3,20}$' },
          example: '1000000003',
        },
      ],
      get: {
        tags: ['Puntos'],
        operationId: 'pagosDelPunto',
        summary: 'Subsidios que este punto puede pagarle hoy a una cédula (CA-10.01)',
        description:
          'El punto digita la cédula y ve «Pago disponible». Una cédula inexistente responde igual que una sin pagos: `404 SinPagoDisponible`. No se filtra si la persona existía.',
        responses: {
          200: ok('Persona y pagos que este punto puede entregar.', ref('PagosPunto')),
          400: entradaInvalida,
          404: falla('404 · El punto no existe (`PuntoNoEncontrado`) o la cédula no tiene pago (`SinPagoDisponible`).', 'SinPagoDisponible', 'Esta cédula no tiene pagos disponibles'),
        },
      },
    },
    '/puntos/{id}/cobros': {
      parameters: [
        parametroUuid('id', 'Identificador del punto.'),
        {
          name: 'desde',
          in: 'query',
          required: false,
          description: 'Periodo de la caja. Por defecto `hoy`. Un valor desconocido se trata como `hoy`.',
          schema: { type: 'string', enum: ['hoy', '7d', 'todo'] },
          example: 'hoy',
        },
      ],
      get: {
        tags: ['Puntos'],
        operationId: 'cobrosDelPunto',
        summary: 'Historial de cobros del punto',
        description: 'Del más reciente al más antiguo. Sin línea de tiempo (`eventos`). `hoy` es el día en hora de Bogotá; `7d` cubre 7 días; `todo` no filtra.',
        responses: {
          200: ok('Cobros del periodo.', { type: 'array', items: ref('Cobro') }, []),
          404: falla('404 · El punto no existe.', 'PuntoNoEncontrado', 'Ese punto no existe'),
        },
      },
    },
  }
}

// Puntos de retiro · HU-03.
import { EntradaPunto } from '../../puntos/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, parametroUuid, ref, type Json } from '../ayudas.ts'
import { PUNTO_EJEMPLO } from '../compartido.ts'

const PAGO_EN_PUNTO = {
  programa: { id: '22222222-2222-4222-8222-222222222222', nombre: 'Subsidio de transporte', estado: 'Activo', tipo: 'subsidio' },
  monto: '23000000',
  moneda: { codigo: 'COP', escala: 2 },
  vigenciaFin: '2026-12-31',
}

export function rutasPuntos(): Json {
  return {
    '/puntos/{id}/pagos': {
      parameters: [parametroUuid('id', 'Identificador del punto.')],
      get: {
        tags: ['Puntos'],
        operationId: 'pagosDelPunto',
        summary: 'Qué puede pagar este punto hoy a esa cédula (HU-10)',
        description:
          'Subsidios en un punto de retiro; bonos aceptados en una sede. Solo los programas que hoy reciben cobros y con permiso vigente. Una cédula sin pagos y una que no existe responden igual (`404 SinPagoDisponible`): no se revela si existe.',
        parameters: [
          {
            name: 'documento',
            in: 'query',
            required: true,
            description: 'Cédula de la persona.',
            schema: { type: 'string', pattern: '^[A-Za-z0-9]{3,20}$' },
            example: '1000000003',
          },
        ],
        responses: {
          200: ok('La persona y sus pagos.', ref('PagosPunto'), {
            persona: { nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', tienePin: true },
            pagos: [PAGO_EN_PUNTO],
          }),
          400: entradaInvalida,
          404: falla('404 · El punto no existe, o la cédula no tiene pagos (`SinPagoDisponible`).', 'SinPagoDisponible', 'Esta cédula no tiene pagos disponibles'),
          503: falla('503 · La liquidación no responde.', 'LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento'),
        },
      },
    },
    '/puntos/{id}/cobros': {
      parameters: [parametroUuid('id', 'Identificador del punto.')],
      get: {
        tags: ['Puntos'],
        operationId: 'cobrosDelPunto',
        summary: 'Historial del punto',
        description: 'Los cobros del punto, del más reciente al más antiguo, sin línea de tiempo.',
        parameters: [{ name: 'desde', in: 'query', required: false, description: 'Periodo; por defecto, hoy.', schema: { type: 'string', enum: ['hoy', '7d', 'todo'] } }],
        responses: {
          200: ok('Los cobros del periodo.', { type: 'array', items: ref('Cobro') }, []),
          404: falla('404 · Ese punto no existe.', 'NoEncontrado', 'No encontramos ese punto'),
        },
      },
    },
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

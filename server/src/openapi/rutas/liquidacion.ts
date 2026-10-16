// Simulador de la liquidación de la entidad · HU-02 (CA-02.01 a CA-02.04).
import { Inscripcion, MENSAJE_CEDULA_NO_ENCONTRADA, NuevoPin, PedidoPin } from '../../liquidacion/contrato.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'

const programaId: Json = { name: 'programaId', in: 'path', required: true, description: 'Programa consultado.', schema: { type: 'string' } }

export function rutasLiquidacion(): Json {
  return {
    '/liquidacion/programas/{programaId}/resumen': {
      parameters: [programaId],
      get: {
        tags: ['Liquidación'],
        operationId: 'liquidacionResumen',
        summary: 'Simulador de la entidad · resumen (CA-02.01)',
        description:
          'Hace el papel del sistema de la entidad en la demo. La plataforma lo consulta por HTTP en `LIQUIDACION_URL` como si fuera externo, así que puede separarse cambiando solo esa variable. El total viaja en unidades mínimas.',
        responses: { 200: ok('Resumen.', ref('ResumenPagos'), { cedulas: 3, total: '69000000' }) },
      },
    },
    '/liquidacion/programas/{programaId}/pagos/{cedula}': {
      parameters: [
        programaId,
        { name: 'cedula', in: 'path', required: true, description: 'Cédula a consultar.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000001' },
      ],
      get: {
        tags: ['Liquidación'],
        operationId: 'liquidacionPago',
        summary: 'Simulador de la entidad · pago de una cédula (CA-02.02 a CA-02.04)',
        description:
          'Con pago: `disponible=true` y `monto` (CA-02.02). Ya pagada: `disponible=false` y `monto=null` (CA-02.03). Inexistente **o con formato inválido**: `404` con el mismo mensaje, para no revelar si la cédula existía (CA-02.04).',
        responses: {
          200: {
            description: 'La cédula está en la liquidación.',
            content: {
              'application/json': {
                schema: ref('PagoCedula'),
                examples: {
                  disponible: { summary: 'Con pago', value: { cedula: '1000000001', disponible: true, monto: '23000000' } },
                  pagada: { summary: 'Ya cobrada', value: { cedula: '1000000001', disponible: false, monto: null } },
                },
              },
            },
          },
          404: falla('404 · La cédula no está en la liquidación.', 'CedulaNoEncontrada', MENSAJE_CEDULA_NO_ENCONTRADA),
        },
      },
    },
    '/liquidacion/personas': {
      get: {
        tags: ['Liquidación'],
        operationId: 'liquidacionPersonas',
        summary: 'Simulador de la entidad · nombres y si tienen PIN',
        description:
          'Nombre y si tiene PIN de varias cédulas a la vez; las que no están, no vienen. **Nunca devuelve el PIN ni su hash.** Tatú no guarda nombres: los pide aquí.',
        parameters: [
          { name: 'cedulas', in: 'query', required: true, description: 'Cédulas separadas por coma (hasta 500).', schema: { type: 'string' }, example: '1000000001,1000000002' },
        ],
        responses: {
          200: ok('Las personas encontradas, por cédula.', { type: 'array', items: ref('Persona') }, [{ cedula: '1000000001', nombre: 'Ana Pérez', tienePin: true }]),
          400: entradaInvalida,
        },
      },
      post: {
        tags: ['Liquidación'],
        operationId: 'liquidacionInscribir',
        summary: 'Simulador de la entidad · inscribir a una persona',
        description: '«Equipo de prueba» hace el papel de la entidad: inscribe a la persona o, si ya estaba, le cambia el nombre (y el PIN, si llega). Es idempotente.',
        requestBody: { required: true, content: contenidoJson(jsonSchema(Inscripcion, 'input'), { cedula: '1000000010', nombre: 'Rosa Díaz', pin: '4444' }) },
        responses: { 200: ok('La persona inscrita.', ref('Persona'), { cedula: '1000000010', nombre: 'Rosa Díaz', tienePin: true }), 400: entradaInvalida },
      },
    },
    '/liquidacion/personas/{cedula}/pin': {
      parameters: [{ name: 'cedula', in: 'path', required: true, description: 'Cédula de la persona.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000001' }],
      post: {
        tags: ['Liquidación'],
        operationId: 'liquidacionPonerPin',
        summary: 'Simulador de la entidad · poner o cambiar el PIN',
        requestBody: { required: true, content: contenidoJson(jsonSchema(NuevoPin, 'input'), { pin: '5555' }) },
        responses: {
          200: ok('PIN registrado.', ref('PinRegistrado'), { cedula: '1000000001', tienePin: true }),
          400: entradaInvalida,
          404: falla('404 · La cédula no está en la liquidación.', 'CedulaNoEncontrada', MENSAJE_CEDULA_NO_ENCONTRADA),
        },
      },
    },
    '/liquidacion/pin/validar': {
      post: {
        tags: ['Liquidación'],
        operationId: 'liquidacionValidarPin',
        summary: 'Simulador de la entidad · ¿es este el PIN? (AD-14)',
        description:
          'El PIN lo valida el servicio de la entidad y la plataforma no lo guarda (CA-11.06): solo pregunta «¿es este?». Un pedido inválido, una cédula sin PIN o inexistente responden `valido=false`, sin error.',
        requestBody: { required: true, content: contenidoJson(jsonSchema(PedidoPin, 'input'), { cedula: '1000000001', pin: '1111' }) },
        responses: { 200: ok('Resultado.', ref('RespuestaPin'), { valido: true }) },
      },
    },
  }
}

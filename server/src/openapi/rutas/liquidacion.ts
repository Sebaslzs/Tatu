// Simulador de la liquidación de la entidad · HU-02 (CA-02.01 a CA-02.04).
import { MENSAJE_CEDULA_NO_ENCONTRADA } from '../../liquidacion/contrato.ts'
import { falla, ok, ref, type Json } from '../ayudas.ts'

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
  }
}

// Autorización con Open Payments · HU-04, HU-05 y HU-18.
import { falla, ok, ref, type Json } from '../ayudas.ts'
import { estadoNoPermite, noEncontradoPrograma, parametroPrograma, PROGRAMA_EJEMPLO } from '../compartido.ts'

const ESPERANDO = { ...PROGRAMA_EJEMPLO, estado: 'EsperandoAprobacion', tope: '69000000' }
const ACTIVO = { ...ESPERANDO, estado: 'Activo', permisoActivo: true }

const sinSecretos = 'Nunca devuelve tokens, URL de gestión, nonces ni la URL de continuación.'

export function rutasAutorizacion(): Json {
  return {
    '/programas/{id}/autorizar': {
      parameters: [parametroPrograma],
      post: {
        tags: ['Autorización'],
        operationId: 'autorizarPrograma',
        summary: 'Aprobar el permiso con tope en el banco (HU-04)',
        description: [
          'Pide en el banco un permiso de pago (`outgoing-payment`, acciones `create` y `read`) con `limits.debitAmount` = el total de la liquidación, **sin receptor fijo** (CA-04.06), e interactivo. El programa pasa a `EsperandoAprobacion`.',
          '',
          '- **CA-04.01** el tope es el total de la liquidación al pedir la aprobación (RN-08) y queda fijo. Un bono necesita al menos una categoría (`BonoSinCategorias`).',
          '- **CA-04.02** la plataforma guarda solo en el backend la continuación, los nonces, el `grant_url` y la fecha de solicitud; el `redirect` solo se devuelve, no se guarda.',
          '',
          'La persona va al `redirect`, aprueba en su banco y la Test Wallet vuelve a `GET /callback/{id}`. ' + sinSecretos,
        ].join('\n'),
        responses: {
          200: ok('Aprobación pedida: el programa espera y `redirect` es el enlace de consentimiento.', ref('Autorizacion'), {
            redirect: 'https://auth.interledger-test.dev/interact/1',
            programa: ESPERANDO,
          }),
          404: noEncontradoPrograma,
          409: falla(
            '409 · El programa no está en Borrador (`EstadoNoPermite`), un bono no tiene categorías (`BonoSinCategorias`) o la liquidación no tiene cédulas (`SinLiquidacion`).',
            'EstadoNoPermite',
            'El programa está en EsperandoAprobacion; esta acción pide Borrador',
          ),
          502: falla('502 · El banco rechazó la solicitud del permiso.', 'ErrorOpenPayments', 'No pudimos pedir la aprobación al banco'),
          503: falla(
            '503 · La liquidación no respondió (`LiquidacionNoResponde`) o faltan las llaves de Open Payments (`OpenPaymentsNoConfigurado`).',
            'LiquidacionNoResponde',
            'No pudimos consultar tu pago; intenta en un momento',
          ),
        },
      },
    },
    '/callback/{id}': {
      parameters: [parametroPrograma],
      get: {
        tags: ['Autorización'],
        operationId: 'callbackAprobacion',
        summary: 'Vuelta de la Test Wallet tras aprobar (CA-04.03 a CA-04.05, HU-05)',
        description: [
          'La Test Wallet redirige aquí a la persona. **Siempre responde `302`** a la web, con `?resultado=` en la URL; nunca hay un error que mostrar en esta ruta.',
          '',
          '| `resultado` | Cuándo |',
          '| --- | --- |',
          '| `aprobado` | Hash válido y `grant.continue` correcto: el programa queda `Activo`. También si el callback se repite con el programa ya `Activo` o `Pausado` (CA-04.05, idempotente). |',
          '| `rechazado` | `result=grant_rejected` o `grant_invalid`: vuelve a `Borrador` (CA-05.01, CA-05.02). |',
          '| `invalido` | Hash que no coincide (CA-04.04), faltan datos, el banco no confirmó el permiso o el programa no existe. El programa **no cambia** y queda un evento. |',
          '| `vencido` | El programa ya no espera aprobación, p. ej. pasaron más de 10 minutos (CA-05.02). |',
          '',
          'Hash: `base64(SHA-256(nonce_cliente \\n nonce_cierre \\n interact_ref \\n grant_url))`, en cualquiera de sus tres variantes (estándar con y sin `=`, y url-safe).',
        ].join('\n'),
        parameters: [
          { name: 'hash', in: 'query', description: 'Hash que firma la vuelta.', schema: { type: 'string' } },
          { name: 'interact_ref', in: 'query', description: 'Referencia de la interacción, para `grant.continue`.', schema: { type: 'string' } },
          { name: 'result', in: 'query', description: '`grant_rejected` o `grant_invalid` cuando la persona no aprobó.', schema: { type: 'string', enum: ['grant_rejected', 'grant_invalid'] } },
        ],
        responses: {
          302: {
            description: 'Redirección a la web con el resultado.',
            headers: {
              Location: {
                description: '`{APP_BASE_URL}/entidad/programas/{id}/aprobar?resultado=aprobado|rechazado|invalido|vencido`',
                schema: { type: 'string', format: 'uri' },
              },
            },
          },
        },
      },
    },
    '/programas/{id}/cancelar-aprobacion': {
      parameters: [parametroPrograma],
      post: {
        tags: ['Autorización'],
        operationId: 'cancelarAprobacion',
        summary: 'Cancelar la aprobación pendiente (CA-05.03)',
        description:
          'Llama `grant.cancel` en el banco (best-effort: si falla, igual se cancela) y el programa vuelve a `Borrador` conservando su configuración (CA-05.04). Deja un evento con `resultado=cancelado`.',
        responses: {
          200: ok('El programa, otra vez en Borrador.', ref('Programa'), PROGRAMA_EJEMPLO),
          404: noEncontradoPrograma,
          409: estadoNoPermite('409 · El programa no está en `EsperandoAprobacion`.'),
        },
      },
    },
    '/programas/{id}/pausar': {
      parameters: [parametroPrograma],
      post: {
        tags: ['Ciclo de vida'],
        operationId: 'pausarPrograma',
        summary: 'Pausar el programa (CA-18.01)',
        description:
          'Un programa `Activo` pasa a `Pausado`: deja de aceptar cobros nuevos **sin revocar el permiso**. Los cobros que ya estaban `Pagando` terminan normalmente (CA-18.02).',
        responses: {
          200: ok('El programa, Pausado.', ref('Programa'), { ...ACTIVO, estado: 'Pausado' }),
          404: noEncontradoPrograma,
          409: estadoNoPermite('409 · El programa no está `Activo`.'),
        },
      },
    },
    '/programas/{id}/reanudar': {
      parameters: [parametroPrograma],
      post: {
        tags: ['Ciclo de vida'],
        operationId: 'reanudarPrograma',
        summary: 'Reanudar el programa (CA-18.02)',
        description: 'Un programa `Pausado` vuelve a `Activo` y acepta cobros otra vez.',
        responses: {
          200: ok('El programa, Activo.', ref('Programa'), ACTIVO),
          404: noEncontradoPrograma,
          409: estadoNoPermite('409 · El programa no está `Pausado`.'),
        },
      },
    },
  }
}

// Cuentas del beneficiario · HU-07.
import { EntradaCuenta } from '../../cuentas/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'

const CUENTA_EJEMPLO = {
  id: '44444444-4444-4444-8444-444444444444',
  documento: '1000000002',
  estado: 'Verificada',
  billetera: 'https://ilp.interledger-test.dev/prueba-luis',
  billeteraCorta: '…/prueba-luis',
  tipoLlave: 'celular',
  llave: '300***4567',
  verificadaEn: '2026-10-16 15:00:00+00',
}

const parametroTipo: Json = {
  name: 'tipo',
  in: 'path',
  required: true,
  description: 'Tipo de llave. Lo elige la persona: nunca se adivina por el formato (RN-14).',
  schema: { type: 'string', enum: ['cedula', 'celular', 'correo', 'alfanumerica'] },
}

const puenteNoResponde = falla('503 · El banco puente de Bre-B no respondió (`PuenteNoResponde`).', 'PuenteNoResponde', 'No pudimos consultar Bre-B; intenta en un momento')

export function rutasCuentas(): Json {
  return {
    '/cuentas': {
      post: {
        tags: ['Cuentas'],
        operationId: 'enlazarCuenta',
        summary: 'Enlazar y verificar mi cuenta (HU-07)',
        description: [
          'Enlaza a la cédula una llave Bre-B (`tipoLlave` + `llave`) o, como opción avanzada, una billetera Open Payments (`billetera`). Dos formas de cuerpo.',
          '',
          '**Llave Bre-B** (el banco puente resuelve a qué billetera llega):',
          '- **CA-07.02 · llave tipo cédula (RN-15):** si es la cédula de la persona, queda `Verificada` sola, sin PIN ni aprobación. Si es de otra persona: `422 LlaveDeOtraPersona` («Esa llave no está a tu nombre»).',
          '- **CA-07.03 · otra llave (RN-16):** pide el PIN (si la persona tiene uno) y que el banco puente confirme que su titular es esa cédula; si no, `422 LlaveDeOtraPersona`. PIN faltante o errado: `422 PinIncorrecto`.',
          '- **CA-07.04** una llave que no existe: `404 LlaveNoExiste` («No encontramos esa llave en Bre-B»).',
          '',
          '**Billetera** (CA-07.05): con `VERIFICACION_CUENTA=subject` queda `PorVerificar` y `redirect` lleva a la persona a aprobar en su billetera; con `simulada` (plan B) queda `Verificada` y `redirect` es `null`. Siempre pide el PIN si la persona lo tiene.',
          '',
          '- **CA-07.06** una sola cuenta vigente por persona: la anterior queda `SinEnlazar`, con su evento.',
          '- **CA-07.07** solo se guarda el tipo de llave, la llave y el estado (o la billetera): nunca el nombre del titular ni tokens de la cuenta.',
          '',
          'La cédula debe estar registrada en Tatú (`POST /beneficiarios`).',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(jsonSchema(EntradaCuenta, 'input'), { documento: '1000000002', tipoLlave: 'celular', llave: '3001234567', pin: '2222' }),
        },
        responses: {
          201: ok('Cuenta enlazada (o pendiente de verificar).', ref('ResultadoEnlace'), { redirect: null, cuenta: CUENTA_EJEMPLO }),
          400: falla('400 · El cuerpo no es válido (`EntradaInvalida`) o la llave no tiene la forma de ese tipo (`LlaveInvalida`).', 'LlaveInvalida', 'Eso no parece una llave de ese tipo; revisa el tipo que elegiste'),
          404: falla('404 · La llave no existe en Bre-B (`LlaveNoExiste`), la cédula no está registrada (`PersonaNoEncontrada`) o la billetera no existe (`BilleteraNoEncontrada`).', 'LlaveNoExiste', 'No encontramos esa llave en Bre-B'),
          422: falla('422 · La llave es de otra persona (`LlaveDeOtraPersona`) o el PIN falta o es incorrecto (`PinIncorrecto`).', 'LlaveDeOtraPersona', 'Esa llave no está a tu nombre'),
          502: falla('502 · El banco no aceptó pedir la verificación de la billetera.', 'ErrorOpenPayments', 'No pudimos pedir la verificación a tu banco'),
          503: puenteNoResponde,
        },
      },
    },
    '/cuentas/llaves/{tipo}/{valor}': {
      parameters: [parametroTipo, { name: 'valor', in: 'path', required: true, description: 'La llave tal como la escribe la persona; se limpia según el tipo.', schema: { type: 'string' }, example: '3001234567' }],
      get: {
        tags: ['Cuentas'],
        operationId: 'consultarLlave',
        summary: 'Consultar una llave antes de enlazarla (CA-07.01)',
        description:
          'Busca la llave en el banco puente y devuelve el titular **enmascarado** («¿Eres Luis G***?») para que la persona confirme. No devuelve la llave completa ni la cédula del titular.',
        responses: {
          200: ok('La llave existe.', ref('LlaveConsultada'), { tipoLlave: 'celular', llave: '300***4567', titular: 'Luis G***' }),
          400: falla('400 · El valor no tiene la forma de ese tipo.', 'LlaveInvalida', 'Eso no parece una llave de ese tipo; revisa el tipo que elegiste'),
          404: falla('404 · La llave no existe en Bre-B.', 'LlaveNoExiste', 'No encontramos esa llave en Bre-B'),
          503: puenteNoResponde,
        },
      },
    },
    '/cuentas/callback/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, description: 'Identificador de la cuenta.', schema: { type: 'string' } }],
      get: {
        tags: ['Cuentas'],
        operationId: 'callbackCuenta',
        summary: 'Vuelta de la billetera tras verificar (CA-07.05)',
        description: [
          'La Test Wallet redirige aquí a la persona. **Siempre responde `302`** a la web con `?resultado=`:',
          '',
          '| `resultado` | Cuándo |',
          '| --- | --- |',
          '| `verificada` | Hash válido y el banco confirmó que la billetera es de la persona. También si el callback se repite con la cuenta ya `Verificada`. |',
          '| `rechazada` | `result=grant_rejected` o `grant_invalid`, el banco dice que la cuenta no es suya, o ya no esperaba verificación: vuelve a `SinEnlazar`. |',
          '| `invalido` | Hash que no coincide, faltan datos o la cuenta no existe. La cuenta **no cambia** y queda un evento. |',
          '',
          'Pasados 10 minutos sin respuesta, la cuenta vuelve a `SinEnlazar`.',
        ].join('\n'),
        parameters: [
          { name: 'hash', in: 'query', schema: { type: 'string' }, description: 'Hash que firma la vuelta.' },
          { name: 'interact_ref', in: 'query', schema: { type: 'string' }, description: 'Referencia de la interacción.' },
          { name: 'result', in: 'query', schema: { type: 'string', enum: ['grant_rejected', 'grant_invalid'] }, description: 'Cuando la persona no aprobó.' },
        ],
        responses: {
          302: {
            description: 'Redirección a la web con el resultado.',
            headers: { Location: { description: '`{APP_BASE_URL}/beneficiario/cuenta?resultado=verificada|rechazada|invalido`', schema: { type: 'string', format: 'uri' } } },
          },
        },
      },
    },
    '/cuentas/{documento}': {
      parameters: [{ name: 'documento', in: 'path', required: true, description: 'Cédula de la persona.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000002' }],
      get: {
        tags: ['Cuentas'],
        operationId: 'estadoCuenta',
        summary: 'Estado de la cuenta',
        description: 'La cuenta vigente de la persona o, si no hay, la más reciente. La web la consulta mientras la persona aprueba. Aplica el vencimiento de la verificación.',
        responses: {
          200: ok('La cuenta.', ref('Cuenta'), CUENTA_EJEMPLO),
          400: entradaInvalida,
          404: falla('404 · La cédula no está registrada (`PersonaNoEncontrada`) o nunca enlazó una cuenta (`CuentaNoEncontrada`).', 'CuentaNoEncontrada', 'Todavía no has enlazado una cuenta'),
        },
      },
    },
  }
}

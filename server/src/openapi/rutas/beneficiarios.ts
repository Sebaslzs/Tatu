// Registro del equipo de prueba: personas y su PIN.
import { EntradaPersona, EntradaPin } from '../../beneficiarios/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'

const BENEFICIARIO_EJEMPLO = {
  cedula: '1000000010',
  nombre: 'Rosa Díaz',
  billetera: 'https://ilp.interledger-test.dev/prueba-rosa',
  billeteraCorta: '…/prueba-rosa',
  moneda: { assetCode: 'COP', assetScale: 2 },
  estadoCuenta: 'Verificada',
  tienePin: true,
  registrado: '2026-10-16 15:00:00+00',
}

export function rutasBeneficiarios(): Json {
  return {
    '/beneficiarios': {
      get: {
        tags: ['Beneficiarios'],
        operationId: 'listarBeneficiarios',
        summary: 'Listar a las personas registradas',
        description:
          'Quién está registrado, con qué billetera y si tiene PIN. El nombre y el PIN los tiene la liquidación: si no responde, la lista sigue con «Persona 1234».',
        responses: { 200: ok('Personas, por cédula.', { type: 'array', items: ref('Beneficiario') }, [BENEFICIARIO_EJEMPLO]) },
      },
      post: {
        tags: ['Beneficiarios'],
        operationId: 'registrarBeneficiario',
        summary: 'Registrar a una persona (equipo de prueba)',
        description: [
          'Una persona es su cédula y su billetera. Tatú guarda **solo la cédula y la cuenta**; el nombre y el PIN se inscriben en la liquidación (por HTTP). La cuenta queda `Verificada` de una vez, porque la registra el equipo con la billetera de la persona.',
          '',
          'Con `cobraCon=llaveCedula`, el equipo hace también de banco de la persona: registra su cédula como llave Bre-B apuntando a su billetera y **no** enlaza cuenta; al cobrar, RN-17 la encuentra sola.',
          '',
          'Es idempotente en la liquidación: si algo falla a medias, se puede repetir.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(jsonSchema(EntradaPersona, 'input'), {
            cedula: '1000000010',
            billetera: '$ilp.interledger-test.dev/prueba-rosa',
            nombre: 'Rosa Díaz',
            pin: '4444',
          }),
        },
        responses: {
          201: ok('Persona registrada.', ref('Beneficiario'), BENEFICIARIO_EJEMPLO),
          400: entradaInvalida,
          404: falla('404 · La billetera no existe.', 'BilleteraNoEncontrada', 'No encontramos esa billetera'),
          409: falla('409 · La cédula ya está registrada (`PersonaExiste`) o la billetera es de otra persona (`BilleteraEnUso`).', 'PersonaExiste', 'Esa cédula ya está registrada'),
          503: falla('503 · La liquidación no respondió; no se guarda nada.', 'LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento'),
        },
      },
    },
    '/beneficiarios/{cedula}/pin': {
      parameters: [{ name: 'cedula', in: 'path', required: true, description: 'Cédula de la persona.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000010' }],
      post: {
        tags: ['Beneficiarios'],
        operationId: 'ponerPinBeneficiario',
        summary: 'Poner o cambiar el PIN',
        description: 'El PIN de alguien ya registrado; hace falta para retirar en un punto. Lo guarda la liquidación (solo su hash): Tatú nunca lo guarda ni lo devuelve (CA-11.06).',
        requestBody: { required: true, content: contenidoJson(jsonSchema(EntradaPin, 'input'), { pin: '5555' }) },
        responses: {
          200: ok('PIN registrado.', ref('PinRegistrado'), { cedula: '1000000010', tienePin: true }),
          400: entradaInvalida,
          404: falla('404 · La cédula no está registrada.', 'PersonaNoEncontrada', 'Esa cédula no está registrada'),
        },
      },
    },
  }
}

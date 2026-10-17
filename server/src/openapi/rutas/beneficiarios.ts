// Registro del equipo de prueba: personas y su PIN.
import { EntradaPersona, EntradaPin } from '../../beneficiarios/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'

const PAGO_EJEMPLO = {
  programa: { id: '22222222-2222-4222-8222-222222222222', nombre: 'Subsidio de transporte', estado: 'Activo', tipo: 'subsidio' },
  monto: '23000000',
  moneda: { codigo: 'COP', escala: 2 },
  vigenciaFin: '2026-12-31',
}

const BENEFICIARIO_EJEMPLO = {
  documento: '1000000010',
  nombre: 'Rosa Díaz',
  billetera: 'https://ilp.interledger-test.dev/prueba-rosa',
  billeteraCorta: '…/prueba-rosa',
  moneda: { codigo: 'COP', escala: 2 },
  estadoCuenta: 'Verificada',
  tienePin: true,
  registrado: '2026-10-16 15:00:00+00',
}

export function rutasBeneficiarios(): Json {
  return {
    '/beneficiarios/demo': {
      get: {
        tags: ['Beneficiarios'],
        operationId: 'beneficiariosDemo',
        summary: 'Personas para el selector de la entrada',
        description: 'Nombre, etiqueta («C.C. de prueba 3») y cédula de cada persona registrada, para elegir con quién entrar. No devuelve billetera, PIN ni estado de la cuenta.',
        responses: { 200: ok('Las personas registradas.', { type: 'array', items: ref('PersonaDemo') }, [{ nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', documento: '1000000003' }]) },
      },
    },
    '/beneficiarios/{documento}/resumen': {
      parameters: [{ name: 'documento', in: 'path', required: true, description: 'Cédula, sin puntos ni espacios.', schema: { type: 'string', pattern: '^[A-Za-z0-9]{3,20}$' }, example: '1000000003' }],
      get: {
        tags: ['Beneficiarios'],
        operationId: 'resumenBeneficiario',
        summary: 'Lo que ve la persona (HU-08)',
        description:
          'Todos sus subsidios y bonos por cobrar, su cuenta, su último cobro y su historial (CA-08.01 a CA-08.04). Si la liquidación no responde, `liquidacionDisponible` es `false`: «sin pagos» no sería la verdad.',
        responses: {
          200: ok('El resumen.', ref('ResumenBeneficiario'), {
            persona: { nombre: 'Jorge Ruiz', documento: '1000000003', tienePin: true },
            pagos: [PAGO_EJEMPLO],
            pago: PAGO_EJEMPLO,
            liquidacionDisponible: true,
            cuenta: null,
            ultimoCobro: null,
            historial: [],
          }),
          400: entradaInvalida,
          404: falla('404 · La cédula no está registrada.', 'PersonaNoEncontrada', 'Esa cédula no está registrada'),
        },
      },
    },
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
            documento: '1000000010',
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
    '/beneficiarios/{documento}/pin': {
      parameters: [{ name: 'documento', in: 'path', required: true, description: 'Cédula de la persona.', schema: { type: 'string', pattern: '^[A-Za-z0-9]{3,20}$' }, example: '1000000010' }],
      post: {
        tags: ['Beneficiarios'],
        operationId: 'ponerPinBeneficiario',
        summary: 'Poner o cambiar el PIN',
        description: 'El PIN de alguien ya registrado; hace falta para retirar en un punto. Lo guarda la liquidación (solo su hash): Tatú nunca lo guarda ni lo devuelve (CA-11.06).',
        requestBody: { required: true, content: contenidoJson(jsonSchema(EntradaPin, 'input'), { pin: '5555' }) },
        responses: {
          200: ok('PIN registrado.', ref('PinRegistrado'), { documento: '1000000010', tienePin: true }),
          400: entradaInvalida,
          404: falla('404 · La cédula no está registrada.', 'PersonaNoEncontrada', 'Esa cédula no está registrada'),
        },
      },
    },
  }
}

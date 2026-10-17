// Cobros · HU-09 a HU-14: pedir, confirmar con PIN, cancelar y consultar.
import { Confirmacion, EntradaCobro } from '../../cobros/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, parametroUuid, ref, type Json } from '../ayudas.ts'

const COBRO_EJEMPLO = {
  id: '44444444-4444-4444-8444-444444444444',
  referencia: 'TAT-7K2M9Q',
  programa: { id: '22222222-2222-4222-8222-222222222222', nombre: 'Subsidio de transporte' },
  canal: 'retiro',
  punto: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Tienda Marta', billeteraCorta: '…/tatu-punto1' },
  cuenta: null,
  persona: { nombre: 'Jorge Ruiz', etiqueta: 'C.C. de prueba 3', novedad: false },
  monto: '23000000',
  totalCompra: null,
  moneda: { codigo: 'COP', escala: 2 },
  estado: 'PorConfirmar',
  motivo: null,
  intentosRestantes: 3,
  confirmarAntesDe: '2026-10-16T15:02:00.000Z',
  segundosHastaPagado: null,
  creado: '2026-10-16T15:00:00.000Z',
  actualizado: '2026-10-16T15:00:00.000Z',
  eventos: [{ desde: null, hacia: 'Solicitado', texto: 'Cobro solicitado en un punto', creado: '2026-10-16T15:00:00.000Z' }],
}

const PARAMETRO_ID = parametroUuid('id', 'Identificador del cobro.')

export function rutasCobros(): Json {
  return {
    '/cobros': {
      post: {
        tags: ['Cobros'],
        operationId: 'pedirCobro',
        summary: 'Pedir un cobro (HU-09, HU-10)',
        description: [
          'Tres canales: a la **cuenta** (paga enseguida, sin PIN), **retiro** en un punto o **compra** con bono (esperan el PIN).',
          '',
          '- **El monto nunca viene del navegador** (RN-11): lo calcula el backend con la liquidación; un campo `monto` en el cuerpo se rechaza con `400`. Solo `totalCompra` en una compra.',
          '- **Idempotencia** (CA-10.07): repetir la misma `llaveIdempotencia` devuelve el mismo cobro; un doble clic no paga dos veces.',
          '- Un solo cobro por persona y programa; la cuenta debe estar `Verificada` y en la moneda del programa para el canal `cuenta`.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(jsonSchema(EntradaCobro, 'input'), {
            documento: '1000000003',
            canal: 'retiro',
            puntoId: '33333333-3333-4333-8333-333333333333',
            llaveIdempotencia: '2f4e9a3c-6f7e-4c43-9d70-7d9ee1b0c0a1',
          }),
        },
        responses: {
          201: ok('El cobro (`PorConfirmar` si espera el PIN; `Pagando` si es a la cuenta).', ref('Cobro'), COBRO_EJEMPLO),
          400: entradaInvalida,
          404: falla('404 · Sin pago disponible para esa cédula (`SinPagoDisponible`) o el punto no existe.', 'SinPagoDisponible', 'Esta cédula no tiene pagos disponibles'),
          409: falla('409 · `CuentaNoVerificada`, `SinProgramas`, `PuntoNoAtiendeCanal`…', 'CuentaNoVerificada', 'Tu cuenta aún no está verificada'),
          503: falla('503 · La liquidación no responde.', 'LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento'),
        },
      },
    },
    '/cobros/{id}/confirmar': {
      parameters: [PARAMETRO_ID],
      post: {
        tags: ['Cobros'],
        operationId: 'confirmarCobro',
        summary: 'Confirmar con el PIN (HU-11)',
        description: [
          'La persona digita su PIN. El PIN se valida contra la liquidación: Tatú nunca lo guarda ni lo compara.',
          '',
          '- **PIN correcto** → `202` y el cobro queda `Pagando`; el pago sale en segundo plano.',
          '- **PIN incorrecto** → `422 PinIncorrecto` con los intentos que quedan; al tercero, el cobro se rechaza y la cédula queda bloqueada 15 minutos en el programa.',
          '- **Vencido** (120 s sin PIN): el cobro ya está `Rechazado` y no se paga.',
          '- Confirmar dos veces seguidas no paga dos veces: la segunda responde `200` con el cobro ya resuelto.',
        ].join('\n'),
        requestBody: { required: true, content: contenidoJson(jsonSchema(Confirmacion, 'input'), { pin: '3333' }) },
        responses: {
          200: ok('El cobro ya estaba resuelto (`Pagando`, `Pagado`, `Rechazado`…).', ref('Cobro'), { ...COBRO_EJEMPLO, estado: 'Pagado', intentosRestantes: null, confirmarAntesDe: null }),
          202: ok('PIN correcto: el pago salió y el cobro está `Pagando`.', ref('Cobro'), { ...COBRO_EJEMPLO, estado: 'Pagando', intentosRestantes: null, confirmarAntesDe: null }),
          400: entradaInvalida,
          404: falla('404 · No existe ese cobro.', 'NoEncontrado', 'No encontramos ese cobro'),
          422: falla('422 · PIN incorrecto (`PinIncorrecto`) o la persona no tiene PIN (`SinPin`).', 'PinIncorrecto', 'PIN incorrecto. Te quedan 2 intentos'),
        },
      },
    },
    '/cobros/{id}/cancelar': {
      parameters: [PARAMETRO_ID],
      post: {
        tags: ['Cobros'],
        operationId: 'cancelarCobro',
        summary: 'Cancelar un cobro que espera el PIN (HU-12)',
        description: 'El punto cancela un cobro `PorConfirmar`: queda `Rechazado` («El cobro se canceló. No se movió dinero») y la cédula queda libre para intentarlo de nuevo.',
        responses: {
          200: ok('El cobro, ya `Rechazado`.', ref('Cobro'), { ...COBRO_EJEMPLO, estado: 'Rechazado', motivo: { codigo: 'CobroCancelado', mensaje: 'El cobro se canceló. No se movió dinero' }, intentosRestantes: null, confirmarAntesDe: null }),
          404: falla('404 · No existe ese cobro.', 'NoEncontrado', 'No encontramos ese cobro'),
          409: falla('409 · El estado del cobro no permite cancelarlo (`EstadoNoPermite`).', 'EstadoNoPermite', 'El cobro ya no se puede cancelar'),
        },
      },
    },
    '/cobros/{id}': {
      parameters: [PARAMETRO_ID],
      get: {
        tags: ['Cobros'],
        operationId: 'consultarCobro',
        summary: 'Estado del cobro y su línea de tiempo (HU-13)',
        description: 'La web lo consulta cada segundo (`pollIntervaloMs` en `/config`). Si el cobro esperaba el PIN y pasaron 120 s, al consultar queda `Rechazado` por tiempo agotado.',
        responses: {
          200: ok('El cobro con sus eventos.', ref('Cobro'), COBRO_EJEMPLO),
          404: falla('404 · No existe ese cobro.', 'NoEncontrado', 'No encontramos ese cobro'),
        },
      },
    },
  }
}

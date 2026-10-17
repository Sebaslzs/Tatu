// Cobros · HU-10 (solicitar) y HU-11 (confirmar con biometría o PIN, cancelar, consultar).
import { EntradaCobro, Confirmacion } from '../../cobros/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, parametroUuid, type Json } from '../ayudas.ts'

const parametroCobro: Json = parametroUuid('id', 'Identificador del cobro.')

const COBRO_EJEMPLO = {
  id: '44444444-4444-4444-8444-444444444444',
  referencia: 'SUB-0001',
  programa: { id: '22222222-2222-4222-8222-222222222222', nombre: 'Subsidio de transporte' },
  canal: 'retiro',
  punto: { id: '33333333-3333-4333-8333-333333333333', nombre: 'Tienda Marta', billeteraCorta: '…tatu-punto1' },
  cuenta: null,
  persona: { nombre: 'Jorge Ruiz', documento: '******0003', novedad: false },
  monto: { valor: '23000000', assetCode: 'COP', assetScale: 2 },
  totalCompra: null,
  moneda: { assetCode: 'COP', assetScale: 2 },
  estado: 'PorConfirmar',
  motivo: null,
  intentosRestantes: 3,
  confirmarAntesDe: '2026-10-16T15:02:00.000Z',
  segundosHastaPagado: null,
  creado: '2026-10-16T15:00:00.000Z',
  actualizado: '2026-10-16T15:00:00.000Z',
}

const cobro = (descripcion: string, ejemplo: unknown = COBRO_EJEMPLO): Json => ok(descripcion, ref('Cobro'), ejemplo)

export function rutasCobros(): Json {
  const entrada = jsonSchema(EntradaCobro, 'input')
  const confirmacion = jsonSchema(Confirmacion, 'input')

  return {
    '/cobros': {
      post: {
        tags: ['Cobros'],
        operationId: 'solicitarCobro',
        summary: 'Solicitar un cobro (HU-10)',
        description: [
          'Crea el cobro y decide su destino: `canal=cuenta` se paga de inmediato (sin PIN ni biometría); `canal=retiro` queda `PorConfirmar` esperando que la persona se verifique en el punto con rostro o huella.',
          '',
          '- **CA-10.02** con `canal=retiro`, la cédula, el punto y una llave de idempotencia, el cobro queda `PorConfirmar` y se aplican las reglas RN-01 a RN-06.',
          '- **CA-10.04** si no viene `programaId`, se toma el programa activo que tenga un pago disponible para esa cédula; el punto no elige programa.',
          '- **CA-10.07** repetir la misma `llaveIdempotencia` devuelve el mismo cobro: un doble clic no duplica el pago.',
          '- **RN-11** el monto nunca viene del navegador: lo calcula el backend. `totalCompra` va solo en `canal=compra` (bono).',
          '- En el punto la persona se verifica con rostro o huella: el retiro ya no exige un PIN registrado.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(entrada, {
            documento: '1000000003',
            canal: 'retiro',
            puntoId: '33333333-3333-4333-8333-333333333333',
            llaveIdempotencia: '2f4e9a3c-6f7e-4c43-9d70-7d9ee1b0c0a1',
          }),
        },
        responses: {
          201: cobro('El cobro quedó creado: `PorConfirmar` esperando PIN en un punto, o `Pagando` si es a la cuenta.'),
          400: falla(
            '400 · El cuerpo no pasa la validación (`EntradaInvalida`), el punto no atiende ese canal (`PuntoNoAtiendeCanal`) o `totalCompra` va en otro canal.',
            'EntradaInvalida',
            'El cobro en un punto necesita puntoId',
          ),
          404: falla(
            '404 · La cédula no tiene pago disponible (`SinPagoDisponible`), el programa indicado no existe (`ProgramaNoEncontrado`) o el punto no existe (`PuntoNoEncontrado`).',
            'SinPagoDisponible',
            'Esta cédula no tiene pagos disponibles',
          ),
          409: falla(
            '409 · No hay programas recibiendo cobros (`SinProgramas`) o el canal cuenta no tiene cuenta verificada ni llave (`CuentaNoVerificada`).',
            'SinProgramas',
            'No hay programas recibiendo cobros',
          ),
          503: falla('503 · La liquidación no respondió (`LiquidacionNoResponde`) o la billetera de la cuenta no respondió (`SinRespuesta`).', 'LiquidacionNoResponde', 'No pudimos consultar tu pago; intenta en un momento'),
        },
      },
    },
    '/cobros/{id}': {
      parameters: [parametroCobro],
      get: {
        tags: ['Cobros'],
        operationId: 'consultarCobro',
        summary: 'Consultar un cobro (CA-11.04, CA-12.02)',
        description:
          'Devuelve el cobro con su estado y eventos. Al consultar se aplican los vencimientos pendientes (RN-12: un `PorConfirmar` sin PIN en el plazo pasa a `Rechazado`) y, si el cobro está `Pagando`, se reconcilia con el banco (RN-10).',
        responses: { 200: cobro('El cobro.'), 404: falla('404 · El cobro no existe.', 'NoEncontrado', 'Ese cobro no existe') },
      },
    },
    '/cobros/{id}/confirmar': {
      parameters: [parametroCobro],
      post: {
        tags: ['Cobros'],
        operationId: 'confirmarCobro',
        summary: 'Confirmar con biometría o PIN (HU-11)',
        description: [
          'En un punto de retiro la persona se verifica con **rostro o huella** y se envía `{ "metodo": "rostro" | "huella" }`: no se valida PIN ni se cuentan intentos, y el evento guarda solo el método (nunca una foto ni una huella). En una compra con bono se envía `{ "pin" }`: el PIN lo valida el simulador de la liquidación y la plataforma no lo guarda (CA-11.06). Enviar los dos campos, o ninguno, es `400`.',
          '',
          '- **CA-11.01** con el PIN correcto el cobro pasa a `Pagando` y responde `202`; el pago sigue en segundo plano.',
          '- **CA-11.02** con un PIN incorrecto responde `422 PinIncorrecto` con `intentosRestantes`.',
          '- **CA-11.03** al tercer PIN incorrecto el cobro pasa a `Rechazado` y la cédula queda bloqueada en este programa por `PIN_BLOQUEO_MIN` (15 min).',
          '- Un cobro que ya no espera PIN (`Pagado`, `Pagando`, `Rechazado`, `Fallido`) responde `200` sin cambiar; los estados `Solicitado` u otros responden `409 EstadoNoPermite`.',
        ].join('\n'),
        requestBody: { required: true, content: contenidoJson(confirmacion, { metodo: 'huella' }) },
        responses: {
          202: cobro('El PIN es correcto: el cobro pasa a `Pagando` y el pago se dispara en segundo plano.', { ...COBRO_EJEMPLO, estado: 'Pagando' }),
          200: cobro('No había nada que hacer: el cobro ya no espera PIN (p. ej. ya está `Pagado` o se rechazó al agotar los intentos).'),
          400: entradaInvalida,
          404: falla('404 · El cobro no existe.', 'NoEncontrado', 'Ese cobro no existe'),
          409: falla('409 · El cobro no está esperando el PIN (`EstadoNoPermite`) o cambió otra petición (`VersionCambio`).', 'EstadoNoPermite', 'Este cobro no está esperando el PIN'),
          422: falla('422 · PIN incorrecto (`PinIncorrecto`); el mensaje indica cuántos intentos quedan.', 'PinIncorrecto', 'PIN incorrecto, te quedan 2 intentos'),
        },
      },
    },
    '/cobros/{id}/cancelar': {
      parameters: [parametroCobro],
      post: {
        tags: ['Cobros'],
        operationId: 'cancelarCobro',
        summary: 'Cancelar un cobro (CA-11.05)',
        description: 'Un cobro `PorConfirmar` pasa a `Rechazado` con motivo «Cancelado»: no se movió dinero. Fuera de `PorConfirmar` responde `409 EstadoNoPermite`.',
        responses: {
          200: cobro('El cobro, Rechazado con motivo Cancelado.', { ...COBRO_EJEMPLO, estado: 'Rechazado', motivo: { codigo: 'Cancelado', mensaje: 'El cobro se canceló. No se movió dinero.' } }),
          404: falla('404 · El cobro no existe.', 'NoEncontrado', 'Ese cobro no existe'),
          409: falla('409 · El cobro no espera el PIN (`EstadoNoPermite`) o cambió otra petición (`VersionCambio`).', 'EstadoNoPermite', 'Solo se cancela un cobro que espera el PIN'),
        },
      },
    },
  }
}

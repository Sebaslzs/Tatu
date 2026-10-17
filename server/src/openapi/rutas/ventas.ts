// Ventas registradas en un retiro (HU-27) y el sistema de facturación simulado que las recibe.
import { SolicitudFactura } from '../../facturacion/contrato.ts'
import { contenidoJson, falla, jsonSchema, ok, parametroUuid, ref, type Json } from '../ayudas.ts'

const VENTA_EJEMPLO = {
  id: '55555555-5555-4555-8555-555555555555',
  valor: { valor: '5000000', assetCode: 'COP', assetScale: 2 },
  descripcion: 'Mercado',
  estado: 'Enviada',
  intentosEnvio: 2,
  ultimoError: null,
  referenciaFactura: 'FAC-0001',
  enviadaEn: '2026-10-16T15:01:10.000Z',
}

const SOLICITUD_EJEMPLO = {
  idVenta: VENTA_EJEMPLO.id,
  fecha: '2026-10-16T15:00:04.000Z',
  establecimiento: { puntoId: '33333333-3333-4333-8333-333333333333', nombre: 'Tienda Marta', direccion: 'Calle 45 # 12-30, Bogotá' },
  comprador: { tipoDocumento: 'CC', numeroDocumento: '1000000003', nombre: 'Jorge Ruiz' },
  venta: { valor: VENTA_EJEMPLO.valor, descripcion: 'Mercado' },
  medioDePago: {
    tipo: 'subsidio',
    referenciaCobro: 'SUB-0007',
    programa: { id: '22222222-2222-4222-8222-222222222222', nombre: 'Subsidio de transporte' },
    entidad: { nombre: 'Alcaldía de Prueba', tipoDocumento: 'NIT', documento: '900123456' },
    valorRetiro: { valor: '9000000', assetCode: 'COP', assetScale: 2 },
    efectivoEntregado: { valor: '4000000', assetCode: 'COP', assetScale: 2 },
  },
}

export function rutasVentas(): Json {
  return {
    '/ventas/{id}/reenviar': {
      parameters: [parametroUuid('id', 'Identificador de la venta.')],
      post: {
        tags: ['Ventas'],
        operationId: 'reenviarVenta',
        summary: 'Reenviar una venta a facturación (HU-27)',
        description: [
          'La venta de un retiro se envía sola cuando el retiro queda `Pagado`, se reintenta al consultar el cobro y al arrancar. Esta operación la reenvía a mano desde el punto.',
          '',
          '- Siempre con la misma `Idempotency-Key` (el id de la venta): un reenvío **nunca** crea una segunda factura.',
          '- Si facturación falla, la venta queda guardada (`PorEnviar` o `Rechazada`) y **el retiro no cambia**: no se descuenta otra vez el saldo ni se repite el pago.',
          '- Una venta `Enviada` responde tal cual, sin volver a enviarla.',
        ].join('\n'),
        responses: {
          200: ok('La venta después del intento: `Enviada`, o `PorEnviar`/`Rechazada` con `ultimoError`.', ref('Venta'), VENTA_EJEMPLO),
          404: falla('404 · La venta no existe.', 'VentaNoEncontrada', 'Esa venta no existe'),
          409: falla(
            '409 · El retiro todavía no se paga (`VentaSinPagar`) o no se pagó y la venta se anuló (`VentaAnulada`).',
            'VentaSinPagar',
            'La venta se envía a facturar cuando el retiro queda Pagado',
          ),
        },
      },
    },
    '/facturacion/facturas': {
      post: {
        tags: ['Facturación'],
        operationId: 'facturacionRecibir',
        summary: 'Recibir una venta para facturar (simulador)',
        description: [
          'Lo que Tatú espera del sistema de facturación del comercio (`FACTURACION_URL`). Tatú no factura: envía los datos básicos y el sistema completa productos e impuestos con su catálogo.',
          '',
          '- Exige la cabecera `Idempotency-Key`; la misma llave devuelve la misma solicitud (`200`), sin crear otra.',
          '- `201` nueva · `400` no cumple el contrato · `422` datos que no sirven para facturar · `503` no disponible (se reintenta).',
        ].join('\n'),
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, description: 'El id de la venta.', schema: { type: 'string' }, example: VENTA_EJEMPLO.id }],
        requestBody: { required: true, content: contenidoJson(jsonSchema(SolicitudFactura, 'input'), SOLICITUD_EJEMPLO) },
        responses: {
          201: ok('Solicitud nueva.', { type: 'object', properties: { id: { type: 'string' }, recibidaEn: { type: 'string' } } }, { id: 'FAC-0001', recibidaEn: '2026-10-16T15:00:05.000Z' }),
          200: ok('Ya la tenía con esa llave: la misma solicitud.', { type: 'object', properties: { id: { type: 'string' }, recibidaEn: { type: 'string' } } }, { id: 'FAC-0001', recibidaEn: '2026-10-16T15:00:05.000Z' }),
          400: falla('400 · Falta la llave o el cuerpo no cumple el contrato.', 'FaltaLlave', 'Falta la cabecera Idempotency-Key'),
          422: falla('422 · Los datos no sirven para facturar (modo «rechaza»).', 'DatosInvalidos', 'El comprador no tiene los datos que exige la factura'),
          503: falla('503 · No disponible (modo «caído»).', 'NoDisponible', 'Facturación está en mantenimiento'),
        },
      },
      get: {
        tags: ['Facturación'],
        operationId: 'facturacionListar',
        summary: 'Lo que recibió facturación (simulador)',
        description: 'Una fila por venta: sirve para ver en la demo que un reintento no duplicó nada.',
        responses: {
          200: ok(
            'Las solicitudes recibidas.',
            { type: 'array', items: { type: 'object' } },
            [{ id: 'FAC-0001', idVenta: VENTA_EJEMPLO.id, recibidaEn: '2026-10-16T15:00:05.000Z', valor: VENTA_EJEMPLO.valor, referenciaCobro: 'SUB-0007' }],
          ),
        },
      },
    },
    '/facturacion/modo': {
      post: {
        tags: ['Facturación'],
        operationId: 'facturacionModo',
        summary: 'Poner facturación caída o rechazando (simulador, solo demo)',
        description: 'Para mostrar que un fallo de facturación deja la venta guardada para reintentar y no toca el retiro.',
        requestBody: { required: true, content: contenidoJson({ type: 'object', required: ['modo'], properties: { modo: { type: 'string', enum: ['normal', 'caido', 'rechaza'] } } }, { modo: 'caido' }) },
        responses: {
          200: ok('El modo nuevo.', { type: 'object', properties: { modo: { type: 'string' } } }, { modo: 'caido' }),
          400: falla('400 · Modo inválido.', 'EntradaInvalida', 'modo: normal, caido o rechaza'),
        },
      },
    },
  }
}

// Salud, configuración y entidades.
import { ok, ref, type Json } from '../ayudas.ts'

export function rutasSistema(): Json {
  return {
    '/salud': {
      get: {
        tags: ['Sistema'],
        operationId: 'salud',
        summary: 'Chequeo de salud',
        description: 'Responde `200` si el proceso está arriba.',
        responses: { 200: ok('El servicio responde.', ref('Salud'), { estado: 'ok' }) },
      },
    },
    '/estado': {
      get: {
        tags: ['Sistema'],
        operationId: 'estado',
        summary: '¿Pagos reales o simulados?',
        description: 'Siempre responde 200. `faltan` dice qué variables impiden pagar de verdad; `baseDeDatos.donde` muestra servidor y base, nunca la contraseña.',
        responses: {
          200: ok('El estado.', ref('Estado'), {
            pagosReales: true,
            faltan: [],
            openPayments: { billeteraCliente: 'https://ilp.interledger-test.dev/mi-cliente', llave: '954f7fd9-3108-4837-920f-5a068993b23a' },
            programasConTokenFalso: 0,
            verificacionCuenta: 'subject',
            baseDeDatos: { tipo: 'postgres', donde: 'aws-0-us-east-1.pooler.supabase.com/postgres' },
            puenteBreB: { simulado: true, responde: true },
          }),
        },
      },
    },
    '/config': {
      get: {
        tags: ['Sistema'],
        operationId: 'configuracion',
        summary: 'Configuración pública',
        description: 'Banderas `EXTRA_*` y cadencia de consulta del estado. Un cliente no debe mostrar acciones de un extra apagado (RNF-10).',
        responses: {
          200: ok('Configuración.', ref('ConfigPublica'), {
            pollIntervaloMs: 1000,
            extras: { bono: false, qr: false, pdf417: false, contrato: false, deploy: false },
          }),
        },
      },
    },
    '/entidades': {
      get: {
        tags: ['Entidades'],
        operationId: 'listarEntidades',
        summary: 'Listar entidades financiadoras',
        description: 'Entidades activas, para elegir a cuál pertenece un programa.',
        responses: {
          200: ok('Entidades activas, ordenadas por nombre.', { type: 'array', items: ref('Entidad') }, [
            { id: '11111111-1111-4111-8111-111111111111', nombre: 'Alcaldía de Prueba', tipo: 'gobierno' },
          ]),
        },
      },
    },
  }
}

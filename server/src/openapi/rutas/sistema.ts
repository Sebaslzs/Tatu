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

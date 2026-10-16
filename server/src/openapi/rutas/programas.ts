// Programas · HU-01 (conectar un subsidio) y HU-02 (su liquidación).
import { EdicionPrograma, EntradaPrograma } from '../../programas/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'
import { liquidacionNoResponde, noEncontradoPrograma, parametroPrograma, PROGRAMA_EJEMPLO } from '../compartido.ts'

export function rutasProgramas(): Json {
  const entrada = jsonSchema(EntradaPrograma, 'input')
  const edicion = jsonSchema(EdicionPrograma, 'input')

  return {
    '/programas': {
      get: {
        tags: ['Programas'],
        operationId: 'listarProgramas',
        summary: 'Listar programas (CA-01.08)',
        description:
          'Devuelve estado, `permisoActivo`, `permisoVencido`, tope y monto por persona. Antes de responder aplica el vencimiento de la aprobación: un programa en `EsperandoAprobacion` desde hace más de `APROBACION_TTL_MIN` (10 min por defecto) vuelve a `Borrador` y deja un evento del sistema. Nunca expone tokens, URLs de gestión ni nonces.',
        responses: { 200: ok('Programas, del más antiguo al más reciente.', { type: 'array', items: ref('Programa') }, [PROGRAMA_EJEMPLO]) },
      },
      post: {
        tags: ['Programas'],
        operationId: 'crearPrograma',
        summary: 'Conectar un subsidio (HU-01)',
        description: [
          'Crea un programa en `Borrador`. **No mueve dinero.**',
          '',
          '- **CA-01.01** `tipo` por defecto `subsidio`: `destino=libre` y canales cuenta y retiro.',
          '- **CA-01.02** la billetera se normaliza a `https://` (sin `$` ni barra final) y se resuelve contra su servidor; si no existe, `404 BilleteraNoEncontrada` y **no se guarda**.',
          '- **CA-01.03** `assetCode` y `assetScale` se copian de la billetera resuelta; **no se aceptan en el cuerpo**.',
          '- **CA-01.04** `vigenciaFin` debe ser posterior a `vigenciaInicio`; un mismo día completo es válido.',
          '- **CA-01.05** `tipo=bono` (extra HU-21, requiere `EXTRA_BONO`) queda `destino=restringido`, canal compra y lleva hasta 10 categorías.',
          '- **CA-01.07** deja un evento `programa → Borrador` con billetera y moneda; nunca tokens, PIN ni llaves.',
          '',
          'El monto por persona se escribe en pesos y se guarda en unidades mínimas con la escala de la billetera.',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(entrada, {
            entidadId: '11111111-1111-4111-8111-111111111111',
            nombre: 'Subsidio de transporte',
            billetera: '$ilp.interledger-test.dev/tatu-programa',
            vigenciaInicio: '2026-10-01',
            vigenciaFin: '2026-12-31',
            montoPorPersona: '230000',
          }),
        },
        responses: {
          201: ok('Programa creado en Borrador.', ref('Programa'), PROGRAMA_EJEMPLO),
          400: entradaInvalida,
          404: falla(
            '404 · La billetera no resuelve (`BilleteraNoEncontrada`) o la entidad no existe (`EntidadNoEncontrada`).',
            'BilleteraNoEncontrada',
            'No encontramos esa cuenta',
          ),
          409: falla('409 · `tipo=bono` con el extra apagado (`ExtraApagado`).', 'ExtraApagado', 'Los bonos no están habilitados (EXTRA_BONO)'),
          503: falla(
            '503 · El servidor de la billetera no respondió. No es lo mismo que «no existe»: se puede reintentar.',
            'BilleteraSinRespuesta',
            'No pudimos consultar esa billetera; intenta en un momento',
          ),
        },
      },
    },
    '/programas/{id}': {
      parameters: [parametroPrograma],
      get: {
        tags: ['Programas'],
        operationId: 'leerPrograma',
        summary: 'Leer un programa',
        description: 'Igual que el listado, con el vencimiento de la aprobación ya aplicado.',
        responses: { 200: ok('El programa.', ref('Programa'), PROGRAMA_EJEMPLO), 404: noEncontradoPrograma },
      },
      patch: {
        tags: ['Programas'],
        operationId: 'editarPrograma',
        summary: 'Editar un programa en Borrador (CA-01.06)',
        description:
          'Solo en `Borrador`. Todos los campos son opcionales y se pueden cambiar, incluidos `montoPorPersona` y `categorias`. Si cambia la billetera se vuelve a resolver y se copia la nueva moneda. Cambiar a `subsidio` borra las categorías. Fuera de `Borrador` responde `409 EstadoNoPermite`.',
        requestBody: { required: true, content: contenidoJson(edicion, { nombre: 'Bono escolar', montoPorPersona: '60.5' }) },
        responses: {
          200: ok('Programa actualizado.', ref('Programa'), PROGRAMA_EJEMPLO),
          400: entradaInvalida,
          404: falla('404 · El programa o la billetera no existen.', 'NoEncontrado', 'Ese programa no existe'),
          409: falla('409 · El programa ya no está en Borrador, o `tipo=bono` con el extra apagado.', 'EstadoNoPermite', 'El programa está en Activo; solo se edita en Borrador'),
          503: falla('503 · El servidor de la billetera no respondió.', 'BilleteraSinRespuesta', 'No pudimos consultar esa billetera; intenta en un momento'),
        },
      },
    },
    '/programas/{id}/liquidacion': {
      parameters: [parametroPrograma],
      get: {
        tags: ['Programas', 'Liquidación'],
        operationId: 'resumenLiquidacion',
        summary: 'Conectar la liquidación de la entidad (HU-02, CA-02.01)',
        description:
          'Consulta a la liquidación de la entidad cuántas cédulas tiene y el total, en la moneda del programa. Ese total será el `tope_total` al autorizar (RN-08). **La plataforma no copia la lista** (CA-02.05): solo consulta.',
        responses: {
          200: ok('Resumen de la liquidación.', ref('ResumenLiquidacion'), { cedulas: 3, total: { valor: '69000000', assetCode: 'COP', assetScale: 2 } }),
          404: noEncontradoPrograma,
          503: liquidacionNoResponde,
        },
      },
    },
  }
}

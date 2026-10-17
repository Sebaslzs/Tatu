// Programas · HU-01 (conectar un subsidio), HU-02 (su liquidación), HU-15 (tablero) y HU-17 (cierre).
import { Cierre, EdicionPrograma, EntradaPrograma } from '../../programas/esquemas.ts'
import { PALABRA_CIERRE } from '../../programas/tablero.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, ok, ref, type Json } from '../ayudas.ts'
import { liquidacionNoResponde, noEncontradoPrograma, parametroPrograma, PROGRAMA_EJEMPLO } from '../compartido.ts'

const MONEDA = { valor: '0', assetCode: 'COP', assetScale: 2 }

const POR_CANAL_VACIO = { cobros: 0, monto: MONEDA }

const TABLERO_EJEMPLO = {
  programa: { ...PROGRAMA_EJEMPLO, estado: 'Activo', permisoActivo: true, tope: { valor: '69000000', assetCode: 'COP', assetScale: 2 } },
  autorizado: { valor: '69000000', assetCode: 'COP', assetScale: 2 },
  cobrado: { valor: '23000000', assetCode: 'COP', assetScale: 2 },
  fuente: 'banco',
  noHaSalido: { valor: '46000000', assetCode: 'COP', assetScale: 2 },
  cobrosPagados: 1,
  porCanal: { cuenta: POR_CANAL_VACIO, retiro: { cobros: 1, monto: { valor: '23000000', assetCode: 'COP', assetScale: 2 } }, compra: POR_CANAL_VACIO },
  reembolsoSegundos: 1.2,
  giradoPorAdelantado: MONEDA,
  sinCobrar: { cedulas: 2, monto: { valor: '46000000', assetCode: 'COP', assetScale: 2 } },
  cobrosPagando: 0,
  rechazadosYFallidos: 0,
  cobros: [],
  cierre: null,
}

export function rutasProgramas(): Json {
  const entrada = jsonSchema(EntradaPrograma, 'input')
  const edicion = jsonSchema(EdicionPrograma, 'input')
  const cierre = jsonSchema(Cierre, 'input')

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
          '- **CA-01.03** la moneda (`codigo` y `escala`) se copia de la billetera resuelta; **no se acepta en el cuerpo**.',
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
            montoPorPersona: { valor: '230000', assetCode: 'COP', assetScale: 2 },
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
          200: ok('Resumen de la liquidación.', ref('ResumenLiquidacion'), { cedulas: 3, total: '69000000' }),
          404: noEncontradoPrograma,
          503: liquidacionNoResponde,
        },
      },
    },
    '/programas/{id}/tablero': {
      parameters: [parametroPrograma],
      get: {
        tags: ['Tablero'],
        operationId: 'tableroDelPrograma',
        summary: 'Ver autorizado, cobrado y lo que nunca salió (HU-15)',
        description: [
          'El tablero de la entidad, en cualquier estado del programa. Nunca expone tokens ni URL de gestión del permiso (CA-15.04).',
          '',
          '- **CA-15.01** `autorizado` es el tope; `cobrado` se lee del permiso con `getGrantSpentAmounts` (fuente `banco`) o, si el banco no responde, de la suma de los cobros Pagados en la base (fuente `plataforma`); `noHaSalido = autorizado − cobrado`; `porCanal` desglosa cuenta, retiro y compra.',
          '- **CA-15.02** el tablero se puede consultar seguido: lo gastado del banco se reutiliza unos segundos en el backend.',
          '- **CA-15.03** `reembolsoSegundos` promedia los segundos del PIN a Pagado en los retiros; `giradoPorAdelantado` es siempre $0: el modelo no gira nada antes del cobro.',
          '- **sinCobrar** cruza la liquidación con lo ya cobrado; es `null` si la liquidación no responde.',
        ].join('\n'),
        responses: {
          200: ok('El tablero del programa.', ref('Tablero'), TABLERO_EJEMPLO),
          404: noEncontradoPrograma,
        },
      },
    },
    '/programas/{id}/cerrar': {
      parameters: [parametroPrograma],
      post: {
        tags: ['Tablero'],
        operationId: 'cerrarPrograma',
        summary: 'Cerrar el programa y revocar el permiso (HU-17)',
        description: [
          'Cierra el programa para siempre: guarda las cifras del cierre, revoca el permiso en el banco (`token.revoke`) y deja el programa `Cerrado`. No se puede deshacer.',
          '',
          `- **CA-17.01** el cuerpo lleva \`confirmacion\` con la palabra \`${PALABRA_CIERRE}\`; sin ella, \`400 ConfirmacionRequerida\`. Solo un programa \`Activo\` o \`Pausado\` se cierra.`,
          '- **CA-17.03** la respuesta es el tablero, ahora con `cierre` (autorizado, cobrado, nuncaSalio, cerradoEn).',
          '- **CA-17.04** es irreversible: la app pide la segunda confirmación y la plataforma valida la palabra antes de revocar.',
          '- **CA-17.05** si hay cobros en `Pagando`, responde `409 CobrosEnCurso`: espera a que terminen.',
          '- Si el permiso ya estaba vencido en el banco, se cierra igual (el permiso ya no servía).',
        ].join('\n'),
        requestBody: { required: true, content: contenidoJson(cierre, { confirmacion: PALABRA_CIERRE }) },
        responses: {
          200: ok('El programa, Cerrado, con sus cifras de cierre.', ref('Tablero'), {
            ...TABLERO_EJEMPLO,
            programa: { ...TABLERO_EJEMPLO.programa, estado: 'Cerrado', permisoActivo: false },
            fuente: 'banco',
            cierre: { autorizado: { valor: '69000000', assetCode: 'COP', assetScale: 2 }, cobrado: { valor: '23000000', assetCode: 'COP', assetScale: 2 }, nuncaSalio: { valor: '46000000', assetCode: 'COP', assetScale: 2 }, cerradoEn: '2026-10-16T15:05:00.000Z' },
          }),
          400: falla(`400 · Falta la palabra \`${PALABRA_CIERRE}\` en \`confirmacion\` (\`ConfirmacionRequerida\`).`, 'ConfirmacionRequerida', `Escribe ${PALABRA_CIERRE} para confirmar`),
          404: noEncontradoPrograma,
          409: falla('409 · El programa no está Activo ni Pausado (`EstadoNoPermite`) o hay cobros en Pagando (`CobrosEnCurso`).', 'EstadoNoPermite', 'El programa está en Borrador; esta acción pide Activo o Pausado'),
          502: falla('502 · El banco no confirmó la revocación del permiso.', 'ErrorOpenPayments', 'No pudimos pedir la revocación al banco'),
        },
      },
    },
  }
}

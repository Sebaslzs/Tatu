// Documento OpenAPI 3.1 de la API de Tatú (épica 1: conexión del subsidio).
// Los cuerpos de entrada salen de los mismos esquemas Zod que validan la API; los de salida, de
// openapi/modelos.ts (que los tests de contrato comparan con las respuestas reales).
import { MENSAJE_CEDULA_NO_ENCONTRADA } from '../liquidacion/contrato.ts'
import { EdicionPrograma, EntradaPrograma } from '../programas/esquemas.ts'
import { EntradaPunto } from '../puntos/esquemas.ts'
import { contenidoJson, entradaInvalida, falla, jsonSchema, type Json, ok, parametroUuid, ref } from './ayudas.ts'
import { MODELOS } from './modelos.ts'

const PROGRAMA_EJEMPLO = {
  id: '22222222-2222-4222-8222-222222222222',
  entidadId: '11111111-1111-4111-8111-111111111111',
  nombre: 'Subsidio de transporte',
  tipo: 'subsidio',
  destino: 'libre',
  canales: ['cuenta', 'retiro'],
  categorias: [],
  billetera: 'https://ilp.interledger-test.dev/tatu-programa',
  moneda: { assetCode: 'COP', assetScale: 2 },
  vigenciaInicio: '2026-10-01T05:00:00.000Z',
  vigenciaFin: '2027-01-01T04:59:59.999Z',
  estado: 'Borrador',
  montoPorPersona: { valor: '23000000', assetCode: 'COP', assetScale: 2 },
  tope: null,
  permisoActivo: false,
  permisoVencido: false,
}

const PUNTO_EJEMPLO = {
  id: '33333333-3333-4333-8333-333333333333',
  nombre: 'Droguería El Centro',
  direccion: 'Sin dirección',
  billetera: 'https://ilp.interledger-test.dev/tatu-punto1',
  tipo: 'retiro',
}

const noEncontradoPrograma = falla('404 · El programa no existe (o el id no es un UUID).', 'NoEncontrado', 'Ese programa no existe')
const liquidacionNoResponde = falla(
  '503 · La liquidación de la entidad no respondió (red, timeout, 5xx o respuesta fuera de contrato). No se guarda nada.',
  'LiquidacionNoResponde',
  'No pudimos consultar tu pago; intenta en un momento',
)

function componentes(): Json {
  const schemas: Json = {}
  for (const [nombre, esquema] of Object.entries(MODELOS)) schemas[nombre] = jsonSchema(esquema, 'output')
  return { schemas }
}

function rutas(): Json {
  const entradaPrograma = jsonSchema(EntradaPrograma, 'input')
  const edicionPrograma = jsonSchema(EdicionPrograma, 'input')
  const entradaPunto = jsonSchema(EntradaPunto, 'input')

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
          content: contenidoJson(entradaPrograma, {
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
      parameters: [parametroUuid('id', 'Identificador del programa.')],
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
        requestBody: { required: true, content: contenidoJson(edicionPrograma, { nombre: 'Bono escolar', montoPorPersona: '60.5' }) },
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
      parameters: [parametroUuid('id', 'Identificador del programa.')],
      get: {
        tags: ['Programas', 'Liquidación'],
        operationId: 'resumenLiquidacion',
        summary: 'Conectar la liquidación de la entidad (HU-02, CA-02.01)',
        description:
          'Consulta a la liquidación de la entidad cuántas cédulas tiene y el total, en la moneda del programa. Ese total será el `tope_total` al autorizar (RN-08). **La plataforma no copia la lista** (CA-02.05): solo consulta.',
        responses: {
          200: ok('Resumen de la liquidación.', ref('ResumenLiquidacion'), {
            cedulas: 3,
            total: { valor: '69000000', assetCode: 'COP', assetScale: 2 },
          }),
          404: noEncontradoPrograma,
          503: liquidacionNoResponde,
        },
      },
    },
    '/puntos': {
      get: {
        tags: ['Puntos'],
        operationId: 'listarPuntos',
        summary: 'Listar puntos',
        responses: { 200: ok('Puntos y sedes, por nombre.', { type: 'array', items: ref('Punto') }, [PUNTO_EJEMPLO]) },
      },
      post: {
        tags: ['Puntos'],
        operationId: 'registrarPunto',
        summary: 'Registrar un punto de retiro (HU-03)',
        description: [
          'Registra un punto con su billetera, para que quien no tiene celular tenga dónde cobrar.',
          '',
          '- **CA-03.01** `tipo` por defecto `retiro`; sin dirección queda «Sin dirección». Si se indica `programaId`, la moneda del punto debe ser la del programa (`409 MonedaDistinta`).',
          '- **CA-03.02** la billetera se resuelve; si no existe, `404 BilleteraNoEncontrada` («No encontramos esa billetera del punto»). La respuesta incluye la moneda real.',
          '- **CA-03.03** se normaliza a `https://` sin barra final; una billetera repetida es `409 PuntoExiste`.',
          '- **CA-03.04** un punto de `retiro` no atiende compras con bono y una sede `compra` no hace retiros (`PuntoNoAtiendeCanal`, se aplica al solicitar un cobro).',
        ].join('\n'),
        requestBody: {
          required: true,
          content: contenidoJson(entradaPunto, {
            nombre: 'Droguería El Centro',
            billetera: '$ilp.interledger-test.dev/tatu-punto1',
            tipo: 'retiro',
          }),
        },
        responses: {
          201: ok('Punto registrado.', ref('PuntoRegistrado'), { ...PUNTO_EJEMPLO, moneda: { assetCode: 'COP', assetScale: 2 } }),
          400: entradaInvalida,
          404: falla('404 · La billetera no resuelve (`BilleteraNoEncontrada`) o el programa no existe.', 'BilleteraNoEncontrada', 'No encontramos esa billetera del punto'),
          409: falla('409 · `PuntoExiste` (billetera repetida) o `MonedaDistinta` (distinta a la del programa).', 'PuntoExiste', 'Esa billetera ya es del punto «Droguería El Centro»'),
          503: falla('503 · El servidor de la billetera no respondió.', 'BilleteraSinRespuesta', 'No pudimos consultar esa billetera; intenta en un momento'),
        },
      },
    },
    '/liquidacion/programas/{programaId}/resumen': {
      parameters: [{ name: 'programaId', in: 'path', required: true, description: 'Programa consultado.', schema: { type: 'string' } }],
      get: {
        tags: ['Liquidación'],
        operationId: 'liquidacionResumen',
        summary: 'Simulador de la entidad · resumen (CA-02.01)',
        description:
          'Hace el papel del sistema de la entidad en la demo. La plataforma lo consulta por HTTP en `LIQUIDACION_URL` como si fuera externo, así que puede separarse cambiando solo esa variable. El total viaja en unidades mínimas.',
        responses: { 200: ok('Resumen.', ref('ResumenPagos'), { cedulas: 3, total: '69000000' }) },
      },
    },
    '/liquidacion/programas/{programaId}/pagos/{cedula}': {
      parameters: [
        { name: 'programaId', in: 'path', required: true, description: 'Programa consultado.', schema: { type: 'string' } },
        { name: 'cedula', in: 'path', required: true, description: 'Cédula a consultar.', schema: { type: 'string', pattern: '^\\d{5,12}$' }, example: '1000000001' },
      ],
      get: {
        tags: ['Liquidación'],
        operationId: 'liquidacionPago',
        summary: 'Simulador de la entidad · pago de una cédula (CA-02.02 a CA-02.04)',
        description:
          'Con pago: `disponible=true` y `monto` (CA-02.02). Ya pagada: `disponible=false` y `monto=null` (CA-02.03). Inexistente **o con formato inválido**: `404` con el mismo mensaje, para no revelar si la cédula existía (CA-02.04).',
        responses: {
          200: {
            description: 'La cédula está en la liquidación.',
            content: {
              'application/json': {
                schema: ref('PagoCedula'),
                examples: {
                  disponible: { summary: 'Con pago', value: { cedula: '1000000001', disponible: true, monto: '23000000' } },
                  pagada: { summary: 'Ya cobrada', value: { cedula: '1000000001', disponible: false, monto: null } },
                },
              },
            },
          },
          404: falla('404 · La cédula no está en la liquidación.', 'CedulaNoEncontrada', MENSAJE_CEDULA_NO_ENCONTRADA),
        },
      },
    },
  }
}

export function construirDocumentoOpenApi(): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'API de Tatú',
      version: '0.1.0',
      description: [
        'Tatú convierte una liquidación ya aprobada de un subsidio en pagos bajo demanda con **Open Payments** (Interledger).',
        '',
        'Este documento cubre la **épica 1 · Conexión del subsidio** (HU-01 a HU-03) y las rutas de apoyo. Las rutas de las épicas siguientes (autorizar, cuentas, cobros, tablero) existen pero responden `501 NoImplementado`.',
        '',
        '### Convenciones',
        '- **Errores**: siempre `{ "error": { "codigo", "mensaje" } }`. Decide con `codigo`; `mensaje` es para la persona.',
        '- **Montos**: entero en unidades mínimas, como texto, con `assetCode` y `assetScale` ($230.000,00 COP = `"23000000"`).',
        '- **Fechas**: un día `AAAA-MM-DD` se interpreta completo en hora de Bogotá (UTC−5); la API devuelve instantes ISO 8601 en UTC.',
        '- **Seguridad**: la API nunca devuelve tokens, URLs de gestión del permiso, nonces ni llaves.',
        '- **Sin login**: el rol (entidad, beneficiario, punto) se elige en la web; la identidad la prueban la billetera y el PIN.',
      ].join('\n'),
    },
    servers: [{ url: '/api', description: 'Esta instancia' }],
    tags: [
      { name: 'Sistema', description: 'Salud y configuración.' },
      { name: 'Entidades', description: 'Entidades financiadoras.' },
      { name: 'Programas', description: 'HU-01 · Conectar un subsidio, editarlo y listarlo.' },
      { name: 'Puntos', description: 'HU-03 · Puntos de retiro y sedes de comercio.' },
      { name: 'Liquidación', description: 'HU-02 · Liquidación de la entidad (la plataforma consulta, no copia).' },
    ],
    paths: rutas(),
    components: componentes(),
  }
}

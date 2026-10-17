// Contrato de la API de Tatú que usan las vistas de la entidad. Refleja server/src/**/vista.ts:
// JSON en camelCase y montos como texto en unidades mínimas, con su moneda (`Monto`).

export interface Moneda {
  assetCode: string
  assetScale: number
}

/** «$230.000» viaja como { valor: "23000000", assetCode: "COP", assetScale: 2 }. */
export interface Monto extends Moneda {
  valor: string
}

// ── Entidades ─────────────────────────────────────────────────────────────────

export interface Entidad {
  id: string
  nombre: string
  tipo: string
}

// ── Programas ─────────────────────────────────────────────────────────────────

export type EstadoPrograma = 'Borrador' | 'EsperandoAprobacion' | 'Activo' | 'Pausado' | 'Cerrado'
export type TipoPrograma = 'subsidio' | 'bono'
export type Canal = 'cuenta' | 'retiro' | 'compra'

/** GET /programas/:id (server/src/programas/vista.ts). */
export interface Programa {
  id: string
  entidadId: string
  nombre: string
  tipo: TipoPrograma
  destino: 'libre' | 'restringido'
  canales: Canal[]
  categorias: string[]
  billetera: string
  moneda: Moneda
  /** Instante ISO: el inicio del día en Bogotá. */
  vigenciaInicio: string
  /** Instante ISO: el final del día en Bogotá. */
  vigenciaFin: string
  estado: EstadoPrograma
  montoPorPersona: Monto | null
  /** Se fija al autorizar (RN-08); null en Borrador. */
  tope: Monto | null
  permisoActivo: boolean
  permisoVencido: boolean
}

/** POST /programas y PATCH /programas/:id. */
export interface ProgramaEntrada {
  entidadId: string
  nombre: string
  tipo: TipoPrograma
  /** Acepta `$ilp…` o `https://…`; la API la normaliza. */
  billetera: string
  /** AAAA-MM-DD (día completo en Bogotá). */
  vigenciaInicio: string
  vigenciaFin: string
  /** En pesos, como lo escribe la entidad («10000»); la API lo pasa a unidades mínimas. */
  montoPorPersona?: string
  categorias?: string[]
}

/** GET /programas/:id/liquidacion: cuántas cédulas y su total, que será el tope. */
export interface Liquidacion {
  cedulas: number
  total: Monto
}

/** POST /programas/:id/autorizar. */
export interface Autorizacion {
  redirect: string
  programa: Programa
}

/** GET /billeteras/resolver: aquí la moneda llega como { codigo, escala }. */
export interface BilleteraResuelta {
  id: string
  nombre: string | null
  moneda: { codigo: string; escala: number }
}

// ── Puntos ────────────────────────────────────────────────────────────────────

export interface Punto {
  id: string
  nombre: string
  direccion: string
  billetera: string
  tipo: 'retiro' | 'compra'
  /** Solo en la respuesta de POST /puntos. */
  moneda?: Moneda
}

export interface PuntoEntrada {
  nombre: string
  direccion?: string
  billetera: string
  programaId?: string
}

// ── Beneficiarios ─────────────────────────────────────────────────────────────

export type EstadoCuenta = 'SinEnlazar' | 'PorVerificar' | 'Verificada'

/** GET /beneficiarios: las personas registradas, con su cuenta. */
export interface Beneficiario {
  cedula: string
  nombre: string
  billetera: string | null
  billeteraCorta: string | null
  moneda: Moneda | null
  estadoCuenta: EstadoCuenta | null
  tienePin: boolean
  registrado: string
}

export interface BeneficiarioEntrada {
  cedula: string
  billetera: string
  nombre?: string
  pin?: string
}

// ── Cobros ────────────────────────────────────────────────────────────────────

export type EstadoCobro = 'Solicitado' | 'PorConfirmar' | 'Pagando' | 'Pagado' | 'Rechazado' | 'Fallido'

export interface Motivo {
  codigo: string
  mensaje: string
}

export interface EventoCobro {
  desde: string | null
  hacia: string | null
  texto: string | null
  creado: string
}

/** GET /cobros/:id (server/src/cobros/vista.ts). */
/** HU-27: la compra que la persona hizo en el punto durante un retiro y su envío a facturación. */
export interface Venta {
  id: string
  valor: Monto
  descripcion: string | null
  /** Registrada (retiro sin pagar) · PorEnviar (falta que facturación la reciba) · Enviada · Rechazada · Anulada. */
  estado: 'Registrada' | 'PorEnviar' | 'Enviada' | 'Rechazada' | 'Anulada'
  intentosEnvio: number
  ultimoError: string | null
  referenciaFactura: string | null
  enviadaEn: string | null
}

export interface Cobro {
  id: string
  referencia: string
  programa: { id: string; nombre: string }
  canal: Canal
  punto: { id: string; nombre: string; billeteraCorta: string } | null
  cuenta: { billeteraCorta: string } | null
  /** La cédula llega enmascarada. */
  persona: { nombre: string; cedula: string; novedad: boolean }
  monto: Monto | null
  totalCompra: Monto | null
  moneda: Moneda
  estado: EstadoCobro
  motivo: Motivo | null
  intentosRestantes: number | null
  confirmarAntesDe: string | null
  segundosHastaPagado: number | null
  /** HU-27: la compra registrada con el retiro; null si no hubo. */
  venta: Venta | null
  /** Retiro: lo que el punto entrega en efectivo (el retiro menos la compra). null en otros canales. */
  efectivo: Monto | null
  /** HU-26: lo que le queda a la persona; solo al consultar un cobro (null en listas). */
  saldoRestante: Monto | null
  creado: string
  actualizado: string
  eventos?: EventoCobro[]
}

export type CobroResumen = Omit<Cobro, 'eventos'>

// ── Tablero (GET /programas/:id/tablero) ──────────────────────────────────────
// En la API todavía responde 501. Esta es la forma del piloto (rama produccion), con los montos
// como `Monto` igual que el resto de Tatú. Mientras no exista, las vistas muestran lo del programa.

export interface PorCanal {
  cobros: number
  monto: Monto
}

export interface Tablero {
  programa: Programa
  autorizado: Monto
  cobrado: Monto
  /** "banco": leído del permiso; "plataforma": suma de la base. */
  fuente: 'banco' | 'plataforma'
  noHaSalido: Monto
  cobrosPagados: number
  porCanal: { cuenta: PorCanal; retiro: PorCanal; compra?: PorCanal }
  /** Promedio de segundos del PIN a Pagado en los retiros. */
  reembolsoSegundos: number | null
  giradoPorAdelantado: Monto
  /** null si la liquidación no responde. */
  sinCobrar: { cedulas: number; monto: Monto } | null
  cobrosPagando: number
  rechazadosYFallidos: number
  cobros: CobroResumen[]
  /** Solo cuando el programa está Cerrado. */
  cierre: { autorizado: Monto; cobrado: Monto; nuncaSalio: Monto; cerradoEn: string } | null
}

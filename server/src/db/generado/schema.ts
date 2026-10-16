// GENERADO con `pnpm db:pull` desde Supabase. No editar a mano.
import { customType, pgTable, unique, check, uuid, text, timestamp, uniqueIndex, index, foreignKey, smallint, inet, integer, bigint, bigserial, jsonb, primaryKey, pgSequence, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" })

export const canalCobro = pgEnum("canal_cobro", ['cuenta', 'retiro', 'compra'])
export const destinoPrograma = pgEnum("destino_programa", ['libre', 'restringido'])
export const estadoCobro = pgEnum("estado_cobro", ['Solicitado', 'PorConfirmar', 'Pagando', 'Pagado', 'Rechazado', 'Fallido'])
export const estadoCuenta = pgEnum("estado_cuenta", ['SinEnlazar', 'PorVerificar', 'Verificada'])
export const estadoEntidad = pgEnum("estado_entidad", ['Activa', 'Suspendida', 'Retirada'])
export const estadoPrograma = pgEnum("estado_programa", ['Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado'])
export const estadoUsuario = pgEnum("estado_usuario", ['Activo', 'Bloqueado', 'Inactivo'])
export const rolUsuario = pgEnum("rol_usuario", ['admin', 'operador', 'consulta'])
export const tipoDoc = pgEnum("tipo_doc", ['CC', 'TI', 'CE', 'PPT', 'PA'])
export const tipoDocEntidad = pgEnum("tipo_doc_entidad", ['NIT', 'OTRO'])
export const tipoEntidad = pgEnum("tipo_entidad", ['gobierno', 'caja_compensacion', 'empresa', 'fundacion', 'otro'])
export const tipoLlave = pgEnum("tipo_llave", ['cedula', 'celular', 'correo', 'alfanumerica'])
export const tipoPrograma = pgEnum("tipo_programa", ['subsidio', 'bono'])
export const tipoPunto = pgEnum("tipo_punto", ['retiro', 'compra'])

export const cobroReferenciaSeq = pgSequence("cobro_referencia_seq", {  startWith: "1", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const entidad = pgTable("entidad", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tipoDocumento: tipoDocEntidad("tipo_documento").default('NIT').notNull(),
	documento: text().notNull(),
	nombre: text().notNull(),
	tipo: tipoEntidad().notNull(),
	direccion: text(),
	telefono: text(),
	email: text(),
	estado: estadoEntidad().default('Activa').notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	actualizadoEn: timestamp("actualizado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("entidad_documento_unico").on(table.tipoDocumento, table.documento),
	check("entidad_documento_check", sql`documento ~ '^[0-9A-Za-z-]{3,20}$'::text`),
	check("entidad_email_check", sql`email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text`),
	check("entidad_nombre_check", sql`(char_length(nombre) >= 3) AND (char_length(nombre) <= 120)`),
	check("entidad_telefono_check", sql`telefono ~ '^\+?[0-9 ]{7,20}$'::text`),
]);

export const usuario = pgTable("usuario", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entidadId: uuid("entidad_id").notNull(),
	nombre: text().notNull(),
	email: text().notNull(),
	passwordHash: text("password_hash").notNull(),
	rol: rolUsuario().default('consulta').notNull(),
	estado: estadoUsuario().default('Activo').notNull(),
	intentosFallidos: smallint("intentos_fallidos").default(0).notNull(),
	bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true, mode: 'string' }),
	ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	actualizadoEn: timestamp("actualizado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("usuario_email_unico").using("btree", sql`lower(email)`),
	index("usuario_entidad_idx").using("btree", table.entidadId.asc().nullsLast()),
	foreignKey({
			columns: [table.entidadId],
			foreignColumns: [entidad.id],
			name: "usuario_entidad_id_fkey"
		}).onDelete("restrict"),
	check("usuario_email_check", sql`email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text`),
	check("usuario_intentos_fallidos_check", sql`intentos_fallidos >= 0`),
	check("usuario_nombre_check", sql`(char_length(nombre) >= 2) AND (char_length(nombre) <= 120)`),
]);

export const sesion = pgTable("sesion", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	usuarioId: uuid("usuario_id").notNull(),
	tokenHash: bytea("token_hash").notNull(),
	ip: inet(),
	userAgent: text("user_agent"),
	expiraEn: timestamp("expira_en", { withTimezone: true, mode: 'string' }).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	revocadoEn: timestamp("revocado_en", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("sesion_usuario_idx").using("btree", table.usuarioId.asc().nullsLast()),
	index("sesion_vigente_idx").using("btree", table.expiraEn.asc().nullsLast()).where(sql`(revocado_en IS NULL)`),
	foreignKey({
			columns: [table.usuarioId],
			foreignColumns: [usuario.id],
			name: "sesion_usuario_id_fkey"
		}).onDelete("restrict"),
	unique("sesion_token_hash_key").on(table.tokenHash),
	check("sesion_revocada_despues", sql`(revocado_en IS NULL) OR (revocado_en >= creado_en)`),
	check("sesion_vence_despues", sql`expira_en > creado_en`),
]);

export const programa = pgTable("programa", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entidadId: uuid("entidad_id").notNull(),
	nombre: text().notNull(),
	tipo: tipoPrograma().default('subsidio').notNull(),
	destino: destinoPrograma().default('libre').notNull(),
	billeteraPrograma: text("billetera_programa").notNull(),
	codigoMoneda: text("codigo_moneda").notNull(),
	escalaMoneda: integer("escala_moneda").notNull(),
	vigenciaInicio: timestamp("vigencia_inicio", { withTimezone: true, mode: 'string' }).notNull(),
	vigenciaFin: timestamp("vigencia_fin", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	topeTotal: bigint("tope_total", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	montoPorPersona: bigint("monto_por_persona", { mode: "number" }),
	estado: estadoPrograma().default('Borrador').notNull(),
	aprobacionSolicitadaEn: timestamp("aprobacion_solicitada_en", { withTimezone: true, mode: 'string' }),
	permisoVencidoEn: timestamp("permiso_vencido_en", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	gastadoPermisosAnteriores: bigint("gastado_permisos_anteriores", { mode: "number" }).default(0).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tokenAcceso: text("token_acceso"),
	urlGestion: text("url_gestion"),
	uriContinuacion: text("uri_continuacion"),
	tokenContinuacion: text("token_continuacion"),
	nonceCliente: text("nonce_cliente"),
	nonceCierre: text("nonce_cierre"),
	urlPermiso: text("url_permiso"),
}, (table) => [
	index("programa_entidad_idx").using("btree", table.entidadId.asc().nullsLast(), table.creadoEn.asc().nullsLast()),
	foreignKey({
			columns: [table.entidadId],
			foreignColumns: [entidad.id],
			name: "programa_entidad_id_fkey"
		}).onDelete("restrict"),
	check("activo_con_permiso", sql`(estado <> ALL (ARRAY['Activo'::estado_programa, 'Pausado'::estado_programa])) OR ((token_acceso IS NOT NULL) AND (url_gestion IS NOT NULL))`),
	check("destino_segun_tipo", sql`((tipo = 'subsidio'::tipo_programa) AND (destino = 'libre'::destino_programa)) OR ((tipo = 'bono'::tipo_programa) AND (destino = 'restringido'::destino_programa))`),
	check("espera_con_fecha", sql`(estado <> 'EsperandoAprobacion'::estado_programa) OR (aprobacion_solicitada_en IS NOT NULL)`),
	check("programa_billetera_programa_check", sql`billetera_programa ~~ 'https://%'::text`),
	check("programa_codigo_moneda_check", sql`codigo_moneda ~ '^[A-Z]{3}$'::text`),
	check("programa_escala_moneda_check", sql`(escala_moneda >= 0) AND (escala_moneda <= 18)`),
	check("programa_gastado_permisos_anteriores_check", sql`gastado_permisos_anteriores >= 0`),
	check("programa_monto_por_persona_check", sql`monto_por_persona > 0`),
	check("programa_nombre_check", sql`(char_length(nombre) >= 3) AND (char_length(nombre) <= 80)`),
	check("programa_tope_total_check", sql`tope_total > 0`),
	check("tope_antes_de_aprobar", sql`(estado = 'Borrador'::estado_programa) OR (tope_total IS NOT NULL)`),
	check("vigencia_valida", sql`vigencia_fin > vigencia_inicio`),
]);

export const comercio = pgTable("comercio", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nit: text().notNull(),
	razonSocial: text("razon_social").notNull(),
	ciiu: text().notNull(),
	categoria: text().notNull(),
	verificadoEn: timestamp("verificado_en", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("comercio_nit_key").on(table.nit),
	check("comercio_ciiu_check", sql`ciiu ~ '^[0-9]{4}$'::text`),
	check("comercio_nit_check", sql`nit ~ '^[0-9]{5,15}$'::text`),
	check("comercio_razon_social_check", sql`(char_length(razon_social) >= 3) AND (char_length(razon_social) <= 120)`),
]);

export const punto = pgTable("punto", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nombre: text().notNull(),
	direccion: text().notNull(),
	billetera: text().notNull(),
	tipo: tipoPunto().default('retiro').notNull(),
	comercioId: uuid("comercio_id"),
}, (table) => [
	index("punto_comercio_idx").using("btree", table.comercioId.asc().nullsLast()).where(sql`(comercio_id IS NOT NULL)`),
	foreignKey({
			columns: [table.comercioId],
			foreignColumns: [comercio.id],
			name: "punto_comercio_id_fkey"
		}).onDelete("restrict"),
	unique("punto_billetera_key").on(table.billetera),
	check("punto_billetera_check", sql`billetera ~~ 'https://%'::text`),
	check("sede_es_de_compra", sql`(comercio_id IS NULL) OR (tipo = 'compra'::tipo_punto)`),
]);

export const beneficiario = pgTable("beneficiario", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	tipoDocumento: tipoDoc("tipo_documento").notNull(),
	numeroDocumento: text("numero_documento").notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("documento_unico").on(table.tipoDocumento, table.numeroDocumento),
	check("beneficiario_numero_documento_check", sql`numero_documento ~ '^[A-Za-z0-9]{3,20}$'::text`),
]);

export const cuentaBeneficiario = pgTable("cuenta_beneficiario", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	beneficiarioId: uuid("beneficiario_id").notNull(),
	tipoLlave: tipoLlave("tipo_llave"),
	llave: text(),
	billetera: text().notNull(),
	estado: estadoCuenta().default('SinEnlazar').notNull(),
	nonceCliente: text("nonce_cliente"),
	nonceCierre: text("nonce_cierre"),
	uriContinuacion: text("uri_continuacion"),
	tokenContinuacion: text("token_continuacion"),
	verificadaEn: timestamp("verificada_en", { withTimezone: true, mode: 'string' }),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("una_cuenta_vigente").using("btree", table.beneficiarioId.asc().nullsLast()).where(sql`(estado = ANY (ARRAY['PorVerificar'::estado_cuenta, 'Verificada'::estado_cuenta]))`),
	foreignKey({
			columns: [table.beneficiarioId],
			foreignColumns: [beneficiario.id],
			name: "cuenta_beneficiario_beneficiario_id_fkey"
		}).onDelete("restrict"),
	unique("cuenta_de_beneficiario").on(table.id, table.beneficiarioId),
	check("cuenta_beneficiario_billetera_check", sql`billetera ~~ 'https://%'::text`),
	check("cuenta_beneficiario_llave_check", sql`(char_length(llave) >= 3) AND (char_length(llave) <= 80)`),
	check("llave_con_tipo", sql`(tipo_llave IS NULL) = (llave IS NULL)`),
	check("verificada_con_fecha", sql`(estado = 'Verificada'::estado_cuenta) = (verificada_en IS NOT NULL)`),
]);

export const cobro = pgTable("cobro", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	programaId: uuid("programa_id").notNull(),
	puntoId: uuid("punto_id"),
	cuentaId: uuid("cuenta_id"),
	beneficiarioId: uuid("beneficiario_id").notNull(),
	canal: canalCobro().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalCompra: bigint("total_compra", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	monto: bigint({ mode: "number" }),
	estado: estadoCobro().default('Solicitado').notNull(),
	motivoRechazo: text("motivo_rechazo"),
	intentosPin: smallint("intentos_pin").default(0).notNull(),
	referencia: text().default(sql`(\'SUB-\'::text || lpad((nextval(\'cobro_referencia_seq\'::regclass))::text, 4, \'0\'::text))`).notNull(),
	llaveIdempotencia: text("llave_idempotencia").notNull(),
	urlPagoEntrante: text("url_pago_entrante"),
	urlPagoSaliente: text("url_pago_saliente"),
	version: integer().default(0).notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	actualizadoEn: timestamp("actualizado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("cobro_beneficiario_idx").using("btree", table.beneficiarioId.asc().nullsLast()),
	index("cobro_cuenta_idx").using("btree", table.cuentaId.asc().nullsLast()).where(sql`(cuenta_id IS NOT NULL)`),
	index("cobro_pagando_idx").using("btree", table.actualizadoEn.asc().nullsLast()).where(sql`(estado = 'Pagando'::estado_cobro)`),
	index("cobro_programa_idx").using("btree", table.programaId.asc().nullsLast(), table.creadoEn.asc().nullsLast()),
	index("cobro_punto_idx").using("btree", table.puntoId.asc().nullsLast()).where(sql`(punto_id IS NOT NULL)`),
	uniqueIndex("un_cobro_vivo_por_persona").using("btree", table.programaId.asc().nullsLast(), table.beneficiarioId.asc().nullsLast()).where(sql`(estado = ANY (ARRAY['Solicitado'::estado_cobro, 'PorConfirmar'::estado_cobro, 'Pagando'::estado_cobro, 'Pagado'::estado_cobro]))`),
	foreignKey({
			columns: [table.beneficiarioId],
			foreignColumns: [beneficiario.id],
			name: "cobro_beneficiario_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.programaId],
			foreignColumns: [programa.id],
			name: "cobro_programa_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.puntoId],
			foreignColumns: [punto.id],
			name: "cobro_punto_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.cuentaId, table.beneficiarioId],
			foreignColumns: [cuentaBeneficiario.id, cuentaBeneficiario.beneficiarioId],
			name: "cuenta_del_beneficiario"
		}).onDelete("restrict"),
	unique("cobro_referencia_key").on(table.referencia),
	unique("cobro_llave_idempotencia_key").on(table.llaveIdempotencia),
	check("bono_no_supera_compra", sql`(total_compra IS NULL) OR (monto IS NULL) OR (monto <= total_compra)`),
	check("canal_y_cuenta", sql`((canal <> 'cuenta'::canal_cobro) AND (cuenta_id IS NULL)) OR ((canal = 'cuenta'::canal_cobro) AND ((cuenta_id IS NOT NULL) OR (estado = 'Rechazado'::estado_cobro)))`),
	check("canal_y_punto", sql`((canal = 'cuenta'::canal_cobro) AND (punto_id IS NULL)) OR ((canal = ANY (ARRAY['retiro'::canal_cobro, 'compra'::canal_cobro])) AND (punto_id IS NOT NULL))`),
	check("cobro_intentos_pin_check", sql`intentos_pin >= 0`),
	check("cobro_monto_check", sql`monto > 0`),
	check("cobro_total_compra_check", sql`total_compra > 0`),
	check("compra_con_total", sql`((canal <> 'compra'::canal_cobro) AND (total_compra IS NULL)) OR ((canal = 'compra'::canal_cobro) AND ((total_compra IS NOT NULL) OR (estado = 'Rechazado'::estado_cobro)))`),
	check("monto_si_avanza", sql`(monto IS NOT NULL) OR (estado = 'Rechazado'::estado_cobro)`),
	check("motivo_si_termina_mal", sql`(estado <> ALL (ARRAY['Rechazado'::estado_cobro, 'Fallido'::estado_cobro])) OR (motivo_rechazo IS NOT NULL)`),
	check("pagado_con_pago_saliente", sql`(estado <> 'Pagado'::estado_cobro) OR (url_pago_saliente IS NOT NULL)`),
]);

export const evento = pgTable("evento", {
	id: bigserial({ mode: "number" }).primaryKey().notNull(),
	tipoEntidad: text("tipo_entidad").notNull(),
	idEntidad: text("id_entidad").notNull(),
	estadoAnterior: text("estado_anterior"),
	estadoNuevo: text("estado_nuevo"),
	detalle: jsonb().default({}).notNull(),
	actor: text().default('sistema').notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("evento_entidad_idx").using("btree", table.tipoEntidad.asc().nullsLast(), table.idEntidad.asc().nullsLast(), table.id.asc().nullsLast()),
	check("actor_valido", sql`actor ~ '^(sistema|entidad|usuario|beneficiario|punto|banco)(:[0-9a-f-]{36})?$'::text`),
	check("evento_tipo_entidad_check", sql`tipo_entidad = ANY (ARRAY['programa'::text, 'cuenta'::text, 'cobro'::text, 'beneficiario'::text, 'punto'::text, 'comercio'::text, 'entidad'::text, 'usuario'::text])`),
]);

export const programaCategoria = pgTable("programa_categoria", {
	programaId: uuid("programa_id").notNull(),
	categoria: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.programaId],
			foreignColumns: [programa.id],
			name: "programa_categoria_programa_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.programaId, table.categoria], name: "programa_categoria_pkey"}),
	check("programa_categoria_categoria_check", sql`(char_length(categoria) >= 2) AND (char_length(categoria) <= 60)`),
]);

export const programaPunto = pgTable("programa_punto", {
	programaId: uuid("programa_id").notNull(),
	puntoId: uuid("punto_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.programaId],
			foreignColumns: [programa.id],
			name: "programa_punto_programa_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.puntoId],
			foreignColumns: [punto.id],
			name: "programa_punto_punto_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.programaId, table.puntoId], name: "programa_punto_pkey"}),
]);

export const bloqueoPin = pgTable("bloqueo_pin", {
	programaId: uuid("programa_id").notNull(),
	beneficiarioId: uuid("beneficiario_id").notNull(),
	bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true, mode: 'string' }).notNull(),
	cobroId: uuid("cobro_id").notNull(),
	creadoEn: timestamp("creado_en", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.beneficiarioId],
			foreignColumns: [beneficiario.id],
			name: "bloqueo_pin_beneficiario_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.cobroId],
			foreignColumns: [cobro.id],
			name: "bloqueo_pin_cobro_id_fkey"
		}).onDelete("restrict"),
	foreignKey({
			columns: [table.programaId],
			foreignColumns: [programa.id],
			name: "bloqueo_pin_programa_id_fkey"
		}).onDelete("restrict"),
	primaryKey({ columns: [table.programaId, table.beneficiarioId], name: "bloqueo_pin_pkey"}),
]);

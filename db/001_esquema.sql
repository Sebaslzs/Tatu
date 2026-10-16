-- =====================================================================
-- Tatú · Esquema de base de datos (PostgreSQL 13+)
-- Propuesta del rol de modelado de datos. Ver db/README.md.
-- Montos: enteros en unidades mínimas según escala_moneda
--         ($230.000,00 con escala 2 = 23000000). Nunca float.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
CREATE TYPE tipo_programa      AS ENUM ('subsidio', 'bono');
CREATE TYPE destino_programa   AS ENUM ('libre', 'restringido');
CREATE TYPE estado_programa    AS ENUM ('Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado');
CREATE TYPE tipo_punto         AS ENUM ('retiro', 'compra');
CREATE TYPE estado_cuenta      AS ENUM ('SinEnlazar', 'PorVerificar', 'Verificada');
CREATE TYPE canal_cobro        AS ENUM ('cuenta', 'retiro', 'compra');
CREATE TYPE estado_cobro       AS ENUM ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado', 'Rechazado', 'Fallido');
CREATE TYPE tipo_doc           AS ENUM ('CC', 'TI', 'CE', 'PPT', 'PA');

-- ---------------------------------------------------------------------
-- programa: reglas del programa + permiso de Open Payments
-- ---------------------------------------------------------------------
CREATE TABLE programa (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad             text NOT NULL CHECK (char_length(entidad) BETWEEN 3 AND 80),
  nombre              text NOT NULL CHECK (char_length(nombre)  BETWEEN 3 AND 80),
  tipo                tipo_programa    NOT NULL,
  destino             destino_programa NOT NULL,
  billetera_programa  text NOT NULL CHECK (billetera_programa LIKE 'https://%'),
  codigo_moneda       text NOT NULL CHECK (codigo_moneda ~ '^[A-Z]{3}$'),
  escala_moneda       int  NOT NULL CHECK (escala_moneda BETWEEN 0 AND 18),
  vigencia_inicio     timestamptz NOT NULL,
  vigencia_fin        timestamptz NOT NULL,
  tope_total          bigint CHECK (tope_total > 0),          -- se fija al pedir la aprobación (RN-08)
  estado              estado_programa NOT NULL DEFAULT 'Borrador',

  -- Permiso de Open Payments. Solo backend; nunca al navegador ni a evento.
  -- En producción: cifrados con una llave de KMS y en tabla aparte.
  token_acceso        text,
  url_gestion         text,
  uri_continuacion    text,
  token_continuacion  text,
  nonce_cliente       text,
  nonce_cierre        text,
  url_permiso         text,

  CONSTRAINT vigencia_valida      CHECK (vigencia_fin > vigencia_inicio),
  CONSTRAINT destino_segun_tipo   CHECK ((tipo = 'subsidio' AND destino = 'libre')
                                      OR (tipo = 'bono'     AND destino = 'restringido')),
  CONSTRAINT tope_antes_de_aprobar CHECK (estado = 'Borrador' OR tope_total IS NOT NULL),
  CONSTRAINT activo_con_permiso   CHECK (estado NOT IN ('Activo', 'Pausado')
                                      OR (token_acceso IS NOT NULL AND url_gestion IS NOT NULL))
);

-- La cuenta y la moneda no cambian una vez el programa salió de Borrador
-- (cobro.monto no guarda moneda: la hereda del programa).
CREATE FUNCTION fn_programa_moneda_fija() RETURNS trigger AS $$
BEGIN
  IF OLD.estado <> 'Borrador'
     AND (NEW.billetera_programa IS DISTINCT FROM OLD.billetera_programa
       OR NEW.codigo_moneda      IS DISTINCT FROM OLD.codigo_moneda
       OR NEW.escala_moneda      IS DISTINCT FROM OLD.escala_moneda) THEN
    RAISE EXCEPTION 'La billetera y la moneda del programa no cambian fuera de Borrador';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER programa_moneda_fija
  BEFORE UPDATE ON programa
  FOR EACH ROW EXECUTE FUNCTION fn_programa_moneda_fija();

-- ---------------------------------------------------------------------
-- punto: puntos de retiro y comercios
-- ---------------------------------------------------------------------
CREATE TABLE punto (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  direccion  text NOT NULL,
  billetera  text NOT NULL UNIQUE CHECK (billetera LIKE 'https://%'),
  tipo       tipo_punto NOT NULL
);

-- ---------------------------------------------------------------------
-- programa_punto: comercios autorizados de un bono (extra HU-21)
-- ---------------------------------------------------------------------
CREATE TABLE programa_punto (
  programa_id  uuid NOT NULL REFERENCES programa (id) ON DELETE RESTRICT,
  punto_id     uuid NOT NULL REFERENCES punto (id)    ON DELETE RESTRICT,
  PRIMARY KEY (programa_id, punto_id)
);

-- ---------------------------------------------------------------------
-- beneficiario: solo lo que se verifica para la transacción.
-- Somos pasarela: nombre, contacto y demás datos de la persona viven en
-- Colsubsidio (la liquidación) y no se copian aquí. La fila nace la primera
-- vez que la persona enlaza una cuenta o cobra, nunca por carga masiva.
-- En producción: numero_documento como HMAC (búsqueda) + valor cifrado.
-- ---------------------------------------------------------------------
CREATE TABLE beneficiario (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento    tipo_doc NOT NULL,
  numero_documento  text NOT NULL CHECK (numero_documento ~ '^[A-Za-z0-9]{3,20}$'),
  creado_en         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documento_unico UNIQUE (tipo_documento, numero_documento)
);

-- ---------------------------------------------------------------------
-- cuenta_beneficiario: billeteras enlazadas (con historial)
-- ---------------------------------------------------------------------
CREATE TABLE cuenta_beneficiario (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id  uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  billetera        text NOT NULL CHECK (billetera LIKE 'https://%'),
  estado           estado_cuenta NOT NULL DEFAULT 'SinEnlazar',
  nonce_cliente    text,                     -- temporales: solo durante la verificación
  nonce_cierre     text,
  verificada_en    timestamptz,

  CONSTRAINT verificada_con_fecha CHECK ((estado = 'Verificada') = (verificada_en IS NOT NULL)),
  CONSTRAINT cuenta_de_beneficiario UNIQUE (id, beneficiario_id)   -- destino de la FK compuesta de cobro
);

-- Una sola cuenta vigente por persona; las anteriores quedan como historial.
CREATE UNIQUE INDEX una_cuenta_vigente
  ON cuenta_beneficiario (beneficiario_id)
  WHERE estado IN ('PorVerificar', 'Verificada');

-- ---------------------------------------------------------------------
-- cobro: cada intento de cobro, por cualquier canal
-- ---------------------------------------------------------------------
CREATE SEQUENCE cobro_referencia_seq;

CREATE TABLE cobro (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id         uuid NOT NULL REFERENCES programa (id)     ON DELETE RESTRICT,
  punto_id            uuid          REFERENCES punto (id)        ON DELETE RESTRICT,
  cuenta_id           uuid,
  beneficiario_id     uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  canal               canal_cobro  NOT NULL,
  total_compra        bigint CHECK (total_compra > 0),
  monto               bigint CHECK (monto > 0),                  -- lo calcula el backend (RN-05)
  estado              estado_cobro NOT NULL DEFAULT 'Solicitado',
  motivo_rechazo      text,
  intentos_pin        smallint NOT NULL DEFAULT 0 CHECK (intentos_pin >= 0),
  referencia          text NOT NULL UNIQUE
                      DEFAULT 'SUB-' || lpad(nextval('cobro_referencia_seq')::text, 4, '0'),
  llave_idempotencia  text NOT NULL UNIQUE,
  url_pago_entrante   text,
  url_pago_saliente   text,
  version             int NOT NULL DEFAULT 0,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),

  -- La cuenta usada tiene que ser del mismo beneficiario del cobro.
  CONSTRAINT cuenta_del_beneficiario FOREIGN KEY (cuenta_id, beneficiario_id)
    REFERENCES cuenta_beneficiario (id, beneficiario_id) ON DELETE RESTRICT,

  CONSTRAINT canal_y_punto CHECK (
        (canal = 'cuenta' AND punto_id IS NULL)
     OR (canal IN ('retiro', 'compra') AND punto_id IS NOT NULL)),
  CONSTRAINT canal_y_cuenta CHECK ((canal = 'cuenta') = (cuenta_id IS NOT NULL)),
  CONSTRAINT compra_con_total CHECK ((canal = 'compra') = (total_compra IS NOT NULL)),
  CONSTRAINT bono_no_supera_compra CHECK (total_compra IS NULL OR monto IS NULL OR monto <= total_compra),
  CONSTRAINT monto_si_avanza CHECK (monto IS NOT NULL OR estado = 'Rechazado'),
  CONSTRAINT motivo_si_termina_mal CHECK (estado NOT IN ('Rechazado', 'Fallido') OR motivo_rechazo IS NOT NULL),
  CONSTRAINT pagado_con_pago_saliente CHECK (estado <> 'Pagado' OR url_pago_saliente IS NOT NULL)
);

-- RN-02 / HU-14: un solo cobro vivo o pagado por persona y programa.
-- Lo arbitra la base, aunque lleguen dos solicitudes en el mismo instante.
-- OJO: Fallido libera a la persona; solo se marca Fallido con una respuesta
-- definitiva del banco, nunca por un timeout (ver README, P1).
CREATE UNIQUE INDEX un_cobro_vivo_por_persona
  ON cobro (programa_id, beneficiario_id)
  WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado');

CREATE INDEX cobro_programa_idx     ON cobro (programa_id, creado_en);
CREATE INDEX cobro_beneficiario_idx ON cobro (beneficiario_id);
CREATE INDEX cobro_punto_idx        ON cobro (punto_id) WHERE punto_id IS NOT NULL;
CREATE INDEX cobro_cuenta_idx       ON cobro (cuenta_id) WHERE cuenta_id IS NOT NULL;
CREATE INDEX cobro_pagando_idx      ON cobro (actualizado_en) WHERE estado = 'Pagando';  -- reconciliación

-- Máquina de estados del cobro: la base rechaza saltos imposibles.
--   Solicitado   -> PorConfirmar | Pagando | Rechazado
--   PorConfirmar -> Pagando | Rechazado
--   Pagando      -> Pagado | Fallido
--   Pagado, Rechazado, Fallido: finales
-- Además sube version y actualizado_en en cada cambio (bloqueo optimista:
-- la app actualiza con WHERE id = $1 AND version = $2).
CREATE FUNCTION fn_cobro_transicion() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado NOT IN ('Solicitado', 'PorConfirmar', 'Rechazado') THEN
      RAISE EXCEPTION 'Un cobro no puede nacer en estado %', NEW.estado;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
       (OLD.estado = 'Solicitado'   AND NEW.estado IN ('PorConfirmar', 'Pagando', 'Rechazado'))
    OR (OLD.estado = 'PorConfirmar' AND NEW.estado IN ('Pagando', 'Rechazado'))
    OR (OLD.estado = 'Pagando'      AND NEW.estado IN ('Pagado', 'Fallido'))
  ) THEN
    RAISE EXCEPTION 'Transición de cobro no permitida: % -> %', OLD.estado, NEW.estado;
  END IF;

  NEW.version        := OLD.version + 1;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER cobro_transicion
  BEFORE INSERT OR UPDATE ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_cobro_transicion();

-- Un cobro nunca se borra: cambia de estado.
CREATE FUNCTION fn_prohibir_borrado() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % no admite DELETE ni TRUNCATE', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER cobro_sin_borrado
  BEFORE DELETE ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_prohibir_borrado();
CREATE TRIGGER cobro_sin_truncate
  BEFORE TRUNCATE ON cobro
  FOR EACH STATEMENT EXECUTE FUNCTION fn_prohibir_borrado();

-- ---------------------------------------------------------------------
-- evento: línea de tiempo y auditoría (solo inserción)
-- Nunca guarda tokens, PIN, llaves ni datos personales.
-- ---------------------------------------------------------------------
CREATE TABLE evento (
  id               bigserial PRIMARY KEY,
  tipo_entidad     text NOT NULL CHECK (tipo_entidad IN ('programa', 'cuenta', 'cobro', 'beneficiario')),
  id_entidad       text NOT NULL,
  estado_anterior  text,
  estado_nuevo     text,
  detalle          jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evento_entidad_idx ON evento (tipo_entidad, id_entidad, id);

CREATE FUNCTION fn_evento_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'evento es de solo inserción';
END $$ LANGUAGE plpgsql;

CREATE TRIGGER evento_sin_cambios
  BEFORE UPDATE OR DELETE ON evento
  FOR EACH ROW EXECUTE FUNCTION fn_evento_inmutable();
CREATE TRIGGER evento_sin_truncate
  BEFORE TRUNCATE ON evento
  FOR EACH STATEMENT EXECUTE FUNCTION fn_evento_inmutable();

COMMIT;

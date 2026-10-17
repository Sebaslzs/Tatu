-- =====================================================================
-- Tatú · Esquema completo de la base de datos (PostgreSQL 13+)
-- Monta la base desde cero, en una base vacía. Explicación: db/README.md
--
-- Consolida:
--   · db/001_esquema y db/003_ajustes (modelo base y reglas del cobro)
--   · 010_piloto y 031_llaves del backend (comercios, categorías del bono,
--     renovación del permiso, llaves Bre-B)
--   · Módulo de entidades, usuarios y sesiones
-- No incluye los simuladores de la liquidación ni del banco puente Bre-B:
-- son sistemas externos que la API consulta por HTTP.
--
-- Montos: enteros en unidades mínimas según escala_moneda
--         ($230.000,00 con escala 2 = 23000000). Nunca float.
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Tipos enumerados
-- =====================================================================
CREATE TYPE tipo_doc_entidad    AS ENUM ('NIT', 'OTRO');
CREATE TYPE tipo_entidad        AS ENUM ('gobierno', 'caja_compensacion', 'empresa', 'fundacion', 'otro');
CREATE TYPE estado_entidad      AS ENUM ('Activa', 'Suspendida', 'Retirada');
CREATE TYPE rol_usuario         AS ENUM ('admin', 'operador', 'consulta');
CREATE TYPE estado_usuario      AS ENUM ('Activo', 'Bloqueado', 'Inactivo');
CREATE TYPE tipo_programa       AS ENUM ('subsidio', 'bono');
CREATE TYPE destino_programa    AS ENUM ('libre', 'restringido');
CREATE TYPE estado_programa     AS ENUM ('Borrador', 'EsperandoAprobacion', 'Activo', 'Pausado', 'Cerrado');
CREATE TYPE tipo_punto          AS ENUM ('retiro', 'compra');
CREATE TYPE tipo_doc            AS ENUM ('CC', 'TI', 'CE', 'PPT', 'PA');
CREATE TYPE estado_cuenta       AS ENUM ('SinEnlazar', 'PorVerificar', 'Verificada');
CREATE TYPE tipo_llave          AS ENUM ('cedula', 'celular', 'correo', 'alfanumerica');
CREATE TYPE canal_cobro         AS ENUM ('cuenta', 'retiro', 'compra');
CREATE TYPE estado_cobro        AS ENUM ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado', 'Rechazado', 'Fallido');

-- Actualiza actualizado_en en cada UPDATE
CREATE FUNCTION fn_marcar_actualizacion() RETURNS trigger AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Impide DELETE y TRUNCATE en tablas con historial financiero
CREATE FUNCTION fn_prohibir_borrado() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La tabla % no admite DELETE ni TRUNCATE', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. Entidades, usuarios y sesiones
-- =====================================================================

-- entidad: la organización que financia programas (Colsubsidio, una alcaldía…)
CREATE TABLE entidad (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento  tipo_doc_entidad NOT NULL DEFAULT 'NIT',
  documento       text NOT NULL CHECK (documento ~ '^[0-9A-Za-z-]{3,20}$'),
  nombre          text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 120),
  tipo            tipo_entidad NOT NULL,
  direccion       text,
  telefono        text CHECK (telefono ~ '^\+?[0-9 ]{7,20}$'),
  email           text CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  estado          estado_entidad NOT NULL DEFAULT 'Activa',
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entidad_documento_unico UNIQUE (tipo_documento, documento)
);

CREATE TRIGGER entidad_actualizada
  BEFORE UPDATE ON entidad
  FOR EACH ROW EXECUTE FUNCTION fn_marcar_actualizacion();

-- usuario: persona que entra a la plataforma en nombre de una entidad
CREATE TABLE usuario (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_id         uuid NOT NULL REFERENCES entidad (id) ON DELETE RESTRICT,
  nombre             text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 120),
  email              text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash      text NOT NULL,                 -- Argon2id o bcrypt; nunca la contraseña
  rol                rol_usuario NOT NULL DEFAULT 'consulta',
  estado             estado_usuario NOT NULL DEFAULT 'Activo',
  intentos_fallidos  smallint NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta    timestamptz,
  ultimo_acceso      timestamptz,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_en     timestamptz NOT NULL DEFAULT now()
);

-- El correo es único sin distinguir mayúsculas
CREATE UNIQUE INDEX usuario_email_unico ON usuario (lower(email));
CREATE INDEX usuario_entidad_idx ON usuario (entidad_id);

CREATE TRIGGER usuario_actualizado
  BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_marcar_actualizacion();

-- sesion: cada inicio de sesión. El token nunca se guarda, solo su hash.
CREATE TABLE sesion (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   uuid NOT NULL REFERENCES usuario (id) ON DELETE RESTRICT,
  token_hash   bytea NOT NULL UNIQUE,              -- SHA-256 del token
  ip           inet,
  user_agent   text,
  expira_en    timestamptz NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  revocado_en  timestamptz,

  CONSTRAINT sesion_vence_despues CHECK (expira_en > creado_en),
  CONSTRAINT sesion_revocada_despues CHECK (revocado_en IS NULL OR revocado_en >= creado_en)
);

CREATE INDEX sesion_usuario_idx ON sesion (usuario_id);
CREATE INDEX sesion_vigente_idx ON sesion (expira_en) WHERE revocado_en IS NULL;

-- =====================================================================
-- 3. Programas
-- =====================================================================

-- programa: reglas del programa + permiso de Open Payments
CREATE TABLE programa (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad_id                   uuid NOT NULL REFERENCES entidad (id) ON DELETE RESTRICT,
  nombre                       text NOT NULL CHECK (char_length(nombre) BETWEEN 3 AND 80),
  tipo                         tipo_programa    NOT NULL DEFAULT 'subsidio',
  destino                      destino_programa NOT NULL DEFAULT 'libre',
  billetera_programa           text NOT NULL CHECK (billetera_programa LIKE 'https://%'),
  codigo_moneda                text NOT NULL CHECK (codigo_moneda ~ '^[A-Z]{3}$'),
  escala_moneda                int  NOT NULL CHECK (escala_moneda BETWEEN 0 AND 18),
  vigencia_inicio              timestamptz NOT NULL,
  vigencia_fin                 timestamptz NOT NULL,
  tope_total                   bigint CHECK (tope_total > 0),                 -- se fija al pedir la aprobación (RN-08)
  monto_por_persona            bigint CHECK (monto_por_persona > 0),          -- NULL = monto base de la API
  estado                       estado_programa NOT NULL DEFAULT 'Borrador',
  aprobacion_solicitada_en     timestamptz,
  permiso_vencido_en           timestamptz,                                    -- el banco ya no aceptó rotar el token
  gastado_permisos_anteriores  bigint NOT NULL DEFAULT 0 CHECK (gastado_permisos_anteriores >= 0),
  creado_en                    timestamptz NOT NULL DEFAULT now(),

  -- Permiso de Open Payments. Solo backend; nunca al navegador ni a evento.
  -- En producción: cifrados con una llave de KMS y en tabla aparte.
  token_acceso                 text,
  url_gestion                  text,
  uri_continuacion             text,
  token_continuacion           text,
  nonce_cliente                text,
  nonce_cierre                 text,
  url_permiso                  text,

  CONSTRAINT vigencia_valida       CHECK (vigencia_fin > vigencia_inicio),
  CONSTRAINT destino_segun_tipo    CHECK ((tipo = 'subsidio' AND destino = 'libre')
                                       OR (tipo = 'bono'     AND destino = 'restringido')),
  CONSTRAINT tope_antes_de_aprobar CHECK (estado = 'Borrador' OR tope_total IS NOT NULL),
  CONSTRAINT activo_con_permiso    CHECK (estado NOT IN ('Activo', 'Pausado')
                                       OR (token_acceso IS NOT NULL AND url_gestion IS NOT NULL)),
  CONSTRAINT espera_con_fecha      CHECK (estado <> 'EsperandoAprobacion' OR aprobacion_solicitada_en IS NOT NULL)
);

CREATE INDEX programa_entidad_idx ON programa (entidad_id, creado_en);

-- La billetera y la moneda no cambian fuera de Borrador
-- (cobro.monto no guarda moneda: la hereda del programa)
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

-- programa_categoria: categorías de comercio que acepta un bono (HU-21)
CREATE TABLE programa_categoria (
  programa_id  uuid NOT NULL REFERENCES programa (id) ON DELETE RESTRICT,
  categoria    text NOT NULL CHECK (char_length(categoria) BETWEEN 2 AND 60),
  PRIMARY KEY (programa_id, categoria)
);

-- =====================================================================
-- 4. Comercios y puntos
-- =====================================================================

-- comercio: negocio verificado que acepta bonos; sus sedes son puntos de compra
CREATE TABLE comercio (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nit            text NOT NULL UNIQUE CHECK (nit ~ '^[0-9]{5,15}$'),
  razon_social   text NOT NULL CHECK (char_length(razon_social) BETWEEN 3 AND 120),
  ciiu           text NOT NULL CHECK (ciiu ~ '^[0-9]{4}$'),
  categoria      text NOT NULL,                     -- se deduce del CIIU
  verificado_en  timestamptz,                       -- NULL = por verificar
  creado_en      timestamptz NOT NULL DEFAULT now()
);

-- punto: lugar tipo corresponsal bancario. Retiro = la persona retira su
-- subsidio o bono en efectivo; compra = sede de un comercio que acepta bonos.
CREATE TABLE punto (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  direccion    text NOT NULL,
  billetera    text NOT NULL UNIQUE CHECK (billetera LIKE 'https://%'),
  tipo         tipo_punto NOT NULL DEFAULT 'retiro',
  comercio_id  uuid REFERENCES comercio (id) ON DELETE RESTRICT,

  CONSTRAINT sede_es_de_compra CHECK (comercio_id IS NULL OR tipo = 'compra')
);

CREATE INDEX punto_comercio_idx ON punto (comercio_id) WHERE comercio_id IS NOT NULL;

-- programa_punto: comercios autorizados de un bono, uno por uno (HU-21)
CREATE TABLE programa_punto (
  programa_id  uuid NOT NULL REFERENCES programa (id) ON DELETE RESTRICT,
  punto_id     uuid NOT NULL REFERENCES punto (id)    ON DELETE RESTRICT,
  PRIMARY KEY (programa_id, punto_id)
);

-- =====================================================================
-- 5. Beneficiarios
-- =====================================================================

-- beneficiario: solo lo que se verifica para la transacción. Nombre,
-- contacto y monto viven en la liquidación de la entidad (no se copian).
-- La fila nace la primera vez que la persona enlaza una cuenta o cobra.
CREATE TABLE beneficiario (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento    tipo_doc NOT NULL,
  numero_documento  text NOT NULL CHECK (numero_documento ~ '^[A-Za-z0-9]{3,20}$'),
  creado_en         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT documento_unico UNIQUE (tipo_documento, numero_documento)
);

-- cuenta_beneficiario: llave Bre-B o wallet Open Payments, con historial
CREATE TABLE cuenta_beneficiario (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiario_id     uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  tipo_llave          tipo_llave,                   -- NULL = wallet escrita a mano
  llave               text CHECK (char_length(llave) BETWEEN 3 AND 80),
  billetera           text NOT NULL CHECK (billetera LIKE 'https://%'),  -- última wallet resuelta
  estado              estado_cuenta NOT NULL DEFAULT 'SinEnlazar',
  nonce_cliente       text,                         -- temporales de la verificación
  nonce_cierre        text,
  uri_continuacion    text,
  token_continuacion  text,
  verificada_en       timestamptz,
  creado_en           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT llave_con_tipo         CHECK ((tipo_llave IS NULL) = (llave IS NULL)),
  CONSTRAINT verificada_con_fecha   CHECK ((estado = 'Verificada') = (verificada_en IS NOT NULL)),
  CONSTRAINT cuenta_de_beneficiario UNIQUE (id, beneficiario_id)   -- destino de la FK compuesta de cobro
);

-- Una sola cuenta vigente por persona; las anteriores quedan como historial
CREATE UNIQUE INDEX una_cuenta_vigente
  ON cuenta_beneficiario (beneficiario_id)
  WHERE estado IN ('PorVerificar', 'Verificada');

-- =====================================================================
-- 6. Cobros
-- =====================================================================
CREATE SEQUENCE cobro_referencia_seq;

-- cobro: cada intento de cobro, por cualquier canal
CREATE TABLE cobro (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id         uuid NOT NULL REFERENCES programa (id)     ON DELETE RESTRICT,
  punto_id            uuid          REFERENCES punto (id)        ON DELETE RESTRICT,
  cuenta_id           uuid,
  beneficiario_id     uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  canal               canal_cobro  NOT NULL,
  total_compra        bigint CHECK (total_compra > 0),
  monto               bigint CHECK (monto > 0),                   -- lo calcula el backend (RN-05)
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

  -- La cuenta usada es del mismo beneficiario del cobro
  CONSTRAINT cuenta_del_beneficiario FOREIGN KEY (cuenta_id, beneficiario_id)
    REFERENCES cuenta_beneficiario (id, beneficiario_id) ON DELETE RESTRICT,

  CONSTRAINT canal_y_punto CHECK (
        (canal = 'cuenta' AND punto_id IS NULL)
     OR (canal IN ('retiro', 'compra') AND punto_id IS NOT NULL)),
  -- Un rechazo puede ocurrir antes de tener cuenta o total de compra
  CONSTRAINT canal_y_cuenta CHECK (
        (canal <> 'cuenta' AND cuenta_id IS NULL)
     OR (canal =  'cuenta' AND (cuenta_id IS NOT NULL OR estado = 'Rechazado'))),
  CONSTRAINT compra_con_total CHECK (
        (canal <> 'compra' AND total_compra IS NULL)
     OR (canal =  'compra' AND (total_compra IS NOT NULL OR estado = 'Rechazado'))),
  CONSTRAINT bono_no_supera_compra    CHECK (total_compra IS NULL OR monto IS NULL OR monto <= total_compra),
  CONSTRAINT monto_si_avanza          CHECK (monto IS NOT NULL OR estado = 'Rechazado'),
  CONSTRAINT motivo_si_termina_mal    CHECK (estado NOT IN ('Rechazado', 'Fallido') OR motivo_rechazo IS NOT NULL),
  CONSTRAINT pagado_con_pago_saliente CHECK (estado <> 'Pagado' OR url_pago_saliente IS NOT NULL)
);

-- RN-02 / HU-14: un solo cobro vivo o pagado por persona y programa.
-- Fallido libera a la persona: solo se marca Fallido con una respuesta
-- definitiva del banco, nunca por un timeout.
CREATE UNIQUE INDEX un_cobro_vivo_por_persona
  ON cobro (programa_id, beneficiario_id)
  WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado');

CREATE INDEX cobro_programa_idx     ON cobro (programa_id, creado_en);
CREATE INDEX cobro_beneficiario_idx ON cobro (beneficiario_id);
CREATE INDEX cobro_punto_idx        ON cobro (punto_id)  WHERE punto_id IS NOT NULL;
CREATE INDEX cobro_cuenta_idx       ON cobro (cuenta_id) WHERE cuenta_id IS NOT NULL;
CREATE INDEX cobro_pagando_idx      ON cobro (actualizado_en) WHERE estado = 'Pagando';  -- reconciliación

-- Máquina de estados del cobro; sube version y actualizado_en en cada cambio
--   Solicitado   -> PorConfirmar | Pagando | Rechazado
--   PorConfirmar -> Pagando | Rechazado
--   Pagando      -> Pagado | Fallido
--   Pagado, Rechazado, Fallido: finales
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

CREATE TRIGGER cobro_sin_borrado
  BEFORE DELETE ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_prohibir_borrado();
CREATE TRIGGER cobro_sin_truncate
  BEFORE TRUNCATE ON cobro
  FOR EACH STATEMENT EXECUTE FUNCTION fn_prohibir_borrado();

-- bloqueo_pin: 3 PIN errados bloquean a la persona en ese programa (RN-07)
CREATE TABLE bloqueo_pin (
  programa_id      uuid NOT NULL REFERENCES programa (id)     ON DELETE RESTRICT,
  beneficiario_id  uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  bloqueado_hasta  timestamptz NOT NULL,
  cobro_id         uuid NOT NULL REFERENCES cobro (id)        ON DELETE RESTRICT,  -- cobro que lo causó
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programa_id, beneficiario_id)
);

-- Reglas que la base garantiza para todo cobro que nace vivo.
-- Un cobro que nace Rechazado se registra siempre (es el rastro del intento).
--   RN-06  programa Activo y dentro de su vigencia
--   RN-03  subsidio: cuenta o retiro · bono: solo compra, en un comercio de
--          programa_punto o en una sede de un comercio verificado de una
--          categoría que acepta el bono · el tipo del punto coincide con el canal
--   RN-04  el canal cuenta exige una cuenta Verificada
--   RN-07  la persona no está bloqueada por PIN en ese programa
CREATE FUNCTION fn_cobro_reglas() RETURNS trigger AS $$
DECLARE
  p  programa%ROWTYPE;
  tipo_del_punto tipo_punto;
BEGIN
  IF NEW.estado = 'Rechazado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM programa WHERE id = NEW.programa_id;

  IF p.estado <> 'Activo' OR now() NOT BETWEEN p.vigencia_inicio AND p.vigencia_fin THEN
    RAISE EXCEPTION 'RN-06: el programa no está recibiendo cobros (estado % o fuera de vigencia)', p.estado;
  END IF;

  IF p.tipo = 'subsidio' AND NEW.canal = 'compra' THEN
    RAISE EXCEPTION 'RN-03: un subsidio se cobra a la cuenta o en un punto de retiro';
  END IF;

  IF p.tipo = 'bono' THEN
    IF NEW.canal <> 'compra' THEN
      RAISE EXCEPTION 'RN-03: un bono solo se usa en una compra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM programa_punto
                    WHERE programa_id = NEW.programa_id AND punto_id = NEW.punto_id)
       AND NOT EXISTS (SELECT 1 FROM punto s
                         JOIN comercio c ON c.id = s.comercio_id AND c.verificado_en IS NOT NULL
                         JOIN programa_categoria pc ON pc.programa_id = NEW.programa_id
                                                  AND pc.categoria = c.categoria
                        WHERE s.id = NEW.punto_id) THEN
      RAISE EXCEPTION 'RN-03: este comercio no acepta este bono';
    END IF;
  END IF;

  IF NEW.punto_id IS NOT NULL THEN
    SELECT tipo INTO tipo_del_punto FROM punto WHERE id = NEW.punto_id;
    IF tipo_del_punto::text <> NEW.canal::text THEN
      RAISE EXCEPTION 'RN-03: un punto de % no atiende el canal %', tipo_del_punto, NEW.canal;
    END IF;
  END IF;

  IF NEW.canal = 'cuenta' AND NOT EXISTS (SELECT 1 FROM cuenta_beneficiario
                                           WHERE id = NEW.cuenta_id AND estado = 'Verificada') THEN
    RAISE EXCEPTION 'RN-04: la cuenta no está verificada';
  END IF;

  IF EXISTS (SELECT 1 FROM bloqueo_pin
              WHERE programa_id = NEW.programa_id
                AND beneficiario_id = NEW.beneficiario_id
                AND bloqueado_hasta > now()) THEN
    RAISE EXCEPTION 'RN-07: la persona está bloqueada por PIN en este programa';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER cobro_reglas
  BEFORE INSERT ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_cobro_reglas();

-- =====================================================================
-- 7. Auditoría
-- =====================================================================

-- evento: línea de tiempo (solo inserción). Nunca tokens, PIN, llaves ni
-- datos personales en detalle.
CREATE TABLE evento (
  id               bigserial PRIMARY KEY,
  tipo_entidad     text NOT NULL CHECK (tipo_entidad IN
                     ('programa', 'cuenta', 'cobro', 'beneficiario', 'punto', 'comercio', 'entidad', 'usuario')),
  id_entidad       text NOT NULL,
  estado_anterior  text,
  estado_nuevo     text,
  detalle          jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Quién hizo el cambio: rol y, si aplica, su id. Nunca la cédula.
  -- Ej.: 'sistema', 'entidad', 'usuario:<uuid>', 'punto:<uuid>', 'beneficiario:<uuid>', 'banco'
  actor            text NOT NULL DEFAULT 'sistema'
                   CONSTRAINT actor_valido CHECK (actor ~ '^(sistema|entidad|usuario|beneficiario|punto|banco)(:[0-9a-f-]{36})?$'),
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

-- =====================================================================
-- 8. Seguridad
-- =====================================================================

-- Las funciones buscan sus tablas en el esquema donde se crearon
-- (lo pide el revisor de seguridad de Supabase: function_search_path_mutable)
ALTER FUNCTION fn_marcar_actualizacion() SET search_path FROM CURRENT;
ALTER FUNCTION fn_prohibir_borrado()     SET search_path FROM CURRENT;
ALTER FUNCTION fn_programa_moneda_fija() SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_transicion()     SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_reglas()         SET search_path FROM CURRENT;
ALTER FUNCTION fn_evento_inmutable()     SET search_path FROM CURRENT;

-- RLS en todas las tablas, sin políticas: la API pública de Supabase
-- (anon, authenticated) queda sin acceso; el backend se conecta como dueño
-- de las tablas y no pasa por RLS.
ALTER TABLE entidad             ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesion              ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_categoria  ENABLE ROW LEVEL SECURITY;
ALTER TABLE comercio            ENABLE ROW LEVEL SECURITY;
ALTER TABLE punto               ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_punto      ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_beneficiario ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobro               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueo_pin         ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento              ENABLE ROW LEVEL SECURITY;

COMMIT;


-- #####################################################################
-- #####################################################################
-- ACTUALIZACIÓN 01 · Cobros parciales de subsidios
--
-- En la base ya desplegada se ejecuta SOLO esta sección (de aquí hasta el
-- final). El script de arriba no se modifica.
--
-- Es incremental e idempotente: corre sobre una base que ya tiene la
-- estructura inicial y se puede ejecutar varias veces sin duplicar objetos
-- ni perder datos.
--
-- Qué agrega (explicación en db/README.md, sección 11):
--   1. Columnas nuevas en programa y cobro
--   2. Tabla asignacion: el saldo de cada persona en cada programa
--   3. Saldo inicial de los cobros que ya existen
--   4. Índice anti doble cobro: de «uno en total» a «uno en vuelo»
--   5. Reglas del cobro con saldo (programas parciales y no parciales)
--   6. El monto de un cobro no cambia después de creado
--   7. Trigger que reserva, confirma y libera el saldo
--   8. Auditoría y seguridad de lo nuevo
-- #####################################################################
-- #####################################################################

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------

-- El programa decide si permite cobrar por partes y desde qué monto.
-- false (por defecto) = se comporta exactamente como antes.
ALTER TABLE programa ADD COLUMN IF NOT EXISTS permite_parcial    boolean NOT NULL DEFAULT false;
ALTER TABLE programa ADD COLUMN IF NOT EXISTS monto_minimo_cobro bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'monto_minimo_positivo') THEN
    ALTER TABLE programa ADD CONSTRAINT monto_minimo_positivo CHECK (monto_minimo_cobro > 0);
  END IF;
END $$;

-- Lo que reportó el banco: sentAmount del pago saliente y receivedAmount
-- del entrante. Con varios pagos por persona, las comisiones se suman y hay
-- que poder conciliar lo que salió contra lo que llegó.
ALTER TABLE cobro ADD COLUMN IF NOT EXISTS monto_enviado  bigint;
ALTER TABLE cobro ADD COLUMN IF NOT EXISTS monto_recibido bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'montos_banco_validos') THEN
    ALTER TABLE cobro ADD CONSTRAINT montos_banco_validos
      CHECK ((monto_enviado IS NULL OR monto_enviado >= 0) AND (monto_recibido IS NULL OR monto_recibido >= 0));
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. asignacion: el saldo de cada persona en cada programa
--    saldo disponible = asignado − cobrado − comprometido (se calcula)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asignacion (
  programa_id      uuid NOT NULL REFERENCES programa (id)     ON DELETE RESTRICT,
  beneficiario_id  uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  asignado         bigint NOT NULL CHECK (asignado > 0),       -- lo que dice la liquidación
  comprometido     bigint NOT NULL DEFAULT 0,                  -- cobros en vuelo
  cobrado          bigint NOT NULL DEFAULT 0,                  -- cobros Pagado
  version          int NOT NULL DEFAULT 0,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programa_id, beneficiario_id),

  -- La regla central: nunca se compromete ni se cobra más de lo asignado
  CONSTRAINT sin_sobregiro CHECK (comprometido >= 0 AND cobrado >= 0
                                  AND comprometido + cobrado <= asignado)
);

CREATE INDEX IF NOT EXISTS asignacion_beneficiario_idx ON asignacion (beneficiario_id);

DROP TRIGGER IF EXISTS asignacion_actualizada ON asignacion;
CREATE TRIGGER asignacion_actualizada
  BEFORE UPDATE ON asignacion
  FOR EACH ROW EXECUTE FUNCTION fn_marcar_actualizacion();

-- ---------------------------------------------------------------------
-- 3. Saldo inicial de los cobros que ya existen
--    Lo ya cobrado o en vuelo queda como asignado (saldo 0). Si la
--    liquidación dice que la persona tiene más, la API sube «asignado».
--    ON CONFLICT: si la sección se ejecuta otra vez, no toca lo que ya hay.
-- ---------------------------------------------------------------------
INSERT INTO asignacion (programa_id, beneficiario_id, asignado, comprometido, cobrado)
SELECT programa_id,
       beneficiario_id,
       sum(monto) FILTER (WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado')),
       coalesce(sum(monto) FILTER (WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando')), 0),
       coalesce(sum(monto) FILTER (WHERE estado = 'Pagado'), 0)
FROM cobro
GROUP BY programa_id, beneficiario_id
HAVING sum(monto) FILTER (WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado')) > 0
ON CONFLICT (programa_id, beneficiario_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. Índice anti doble cobro: de «uno en total» a «uno en vuelo»
--    Antes: un solo cobro Solicitado, PorConfirmar, Pagando o Pagado por
--    persona y programa. Ahora: un solo cobro EN VUELO a la vez; los Pagado
--    pueden ser varios. «No cobrar dos veces» lo garantiza el paso 5 en los
--    programas no parciales y el saldo (sin_sobregiro) en los parciales.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS un_cobro_en_vuelo_por_persona
  ON cobro (programa_id, beneficiario_id)
  WHERE estado IN ('Solicitado', 'PorConfirmar', 'Pagando');

DROP INDEX IF EXISTS un_cobro_vivo_por_persona;

-- ---------------------------------------------------------------------
-- 5. Reglas del cobro (reemplaza fn_cobro_reglas; las reglas anteriores
--    quedan iguales y se agregan las del saldo al final)
--   RN-02  programa no parcial: un solo cobro vivo o pagado por persona
--          (lo que antes hacía el índice)
--   RN-19  programa parcial: la persona tiene asignación y el monto cabe
--          en su saldo
--   RN-20  programa parcial: el monto respeta el mínimo, salvo que sea
--          justo el saldo que queda
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cobro_reglas() RETURNS trigger AS $$
DECLARE
  p  programa%ROWTYPE;
  tipo_del_punto tipo_punto;
  saldo bigint;
BEGIN
  IF NEW.estado = 'Rechazado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM programa WHERE id = NEW.programa_id;

  IF p.estado <> 'Activo' OR now() NOT BETWEEN p.vigencia_inicio AND p.vigencia_fin THEN
    RAISE EXCEPTION 'RN-06: el programa no está recibiendo cobros (estado % o fuera de vigencia)', p.estado;
  END IF;

  IF p.tipo = 'subsidio' AND NEW.canal = 'compra' THEN
    RAISE EXCEPTION 'RN-03: un subsidio se cobra a la cuenta o en un punto de retiro';
  END IF;

  IF p.tipo = 'bono' THEN
    IF NEW.canal <> 'compra' THEN
      RAISE EXCEPTION 'RN-03: un bono solo se usa en una compra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM programa_punto
                    WHERE programa_id = NEW.programa_id AND punto_id = NEW.punto_id)
       AND NOT EXISTS (SELECT 1 FROM punto s
                         JOIN comercio c ON c.id = s.comercio_id AND c.verificado_en IS NOT NULL
                         JOIN programa_categoria pc ON pc.programa_id = NEW.programa_id
                                                  AND pc.categoria = c.categoria
                        WHERE s.id = NEW.punto_id) THEN
      RAISE EXCEPTION 'RN-03: este comercio no acepta este bono';
    END IF;
  END IF;

  IF NEW.punto_id IS NOT NULL THEN
    SELECT tipo INTO tipo_del_punto FROM punto WHERE id = NEW.punto_id;
    IF tipo_del_punto::text <> NEW.canal::text THEN
      RAISE EXCEPTION 'RN-03: un punto de % no atiende el canal %', tipo_del_punto, NEW.canal;
    END IF;
  END IF;

  IF NEW.canal = 'cuenta' AND NOT EXISTS (SELECT 1 FROM cuenta_beneficiario
                                           WHERE id = NEW.cuenta_id AND estado = 'Verificada') THEN
    RAISE EXCEPTION 'RN-04: la cuenta no está verificada';
  END IF;

  IF EXISTS (SELECT 1 FROM bloqueo_pin
              WHERE programa_id = NEW.programa_id
                AND beneficiario_id = NEW.beneficiario_id
                AND bloqueado_hasta > now()) THEN
    RAISE EXCEPTION 'RN-07: la persona está bloqueada por PIN en este programa';
  END IF;

  -- Nuevo: reglas del saldo
  IF NOT p.permite_parcial THEN
    IF EXISTS (SELECT 1 FROM cobro
                WHERE programa_id = NEW.programa_id
                  AND beneficiario_id = NEW.beneficiario_id
                  AND estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado')) THEN
      RAISE EXCEPTION 'RN-02: este subsidio ya está en proceso o fue cobrado';
    END IF;
  ELSE
    SELECT asignado - cobrado - comprometido INTO saldo
      FROM asignacion
     WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RN-19: la persona no tiene asignación en este programa';
    END IF;
    IF NEW.monto > saldo THEN
      RAISE EXCEPTION 'RN-19: saldo insuficiente (disponible %)', saldo;
    END IF;
    IF p.monto_minimo_cobro IS NOT NULL AND NEW.monto < p.monto_minimo_cobro AND NEW.monto <> saldo THEN
      RAISE EXCEPTION 'RN-20: el monto es menor que el mínimo de cobro (%)', p.monto_minimo_cobro;
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 6. El monto de un cobro no cambia después de creado (reemplaza
--    fn_cobro_transicion; la máquina de estados queda igual). Si el monto
--    cambiara después de reservar, el saldo quedaría descuadrado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cobro_transicion() RETURNS trigger AS $$
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

  IF NEW.monto IS DISTINCT FROM OLD.monto THEN
    RAISE EXCEPTION 'El monto de un cobro no cambia después de creado';
  END IF;

  NEW.version        := OLD.version + 1;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 7. El saldo se mueve con el estado del cobro
--    Nace vivo  → reserva   (comprometido + monto)
--    Pagado     → confirma  (comprometido − monto, cobrado + monto)
--    Rechazado o Fallido después de reservar → libera (comprometido − monto)
--    Va en la misma transacción que el cobro: si el saldo no alcanza,
--    sin_sobregiro falla y el cobro no se crea. Dos solicitudes simultáneas
--    se ordenan por el bloqueo de la fila de asignacion.
--    Programa no parcial: si la persona no tiene asignación, se crea con el
--    monto del cobro (así funciona igual que antes, sin cambios en la API).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cobro_mueve_saldo() RETURNS trigger AS $$
DECLARE
  parcial boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'Rechazado' THEN
      RETURN NEW;
    END IF;
    SELECT permite_parcial INTO parcial FROM programa WHERE id = NEW.programa_id;
    IF parcial THEN
      UPDATE asignacion
         SET comprometido = comprometido + NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RN-19: la persona no tiene asignación en este programa';
      END IF;
    ELSE
      INSERT INTO asignacion (programa_id, beneficiario_id, asignado, comprometido)
      VALUES (NEW.programa_id, NEW.beneficiario_id, NEW.monto, NEW.monto)
      ON CONFLICT (programa_id, beneficiario_id) DO UPDATE
        SET asignado     = asignacion.cobrado + asignacion.comprometido + EXCLUDED.asignado,
            comprometido = asignacion.comprometido + EXCLUDED.comprometido,
            version      = asignacion.version + 1;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'Pagado' THEN
      UPDATE asignacion
         SET comprometido = comprometido - NEW.monto, cobrado = cobrado + NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    ELSIF NEW.estado IN ('Rechazado', 'Fallido') AND OLD.estado <> 'Rechazado' THEN
      UPDATE asignacion
         SET comprometido = comprometido - NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cobro_mueve_saldo ON cobro;
CREATE TRIGGER cobro_mueve_saldo
  AFTER INSERT OR UPDATE OF estado ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_cobro_mueve_saldo();

-- ---------------------------------------------------------------------
-- 8. Auditoría y seguridad
-- ---------------------------------------------------------------------

-- evento también registra cambios de saldo (tipo_entidad = 'asignacion').
-- La restricción original no tenía nombre propio: PostgreSQL la llamó
-- evento_tipo_entidad_check. Se reemplaza por una con nombre.
ALTER TABLE evento DROP CONSTRAINT IF EXISTS evento_tipo_entidad_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'evento_tipo_entidad_valido') THEN
    ALTER TABLE evento ADD CONSTRAINT evento_tipo_entidad_valido CHECK (tipo_entidad IN
      ('programa', 'cuenta', 'cobro', 'beneficiario', 'punto', 'comercio', 'entidad', 'usuario', 'asignacion'));
  END IF;
END $$;

ALTER FUNCTION fn_cobro_reglas()       SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_transicion()   SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_mueve_saldo()  SET search_path FROM CURRENT;

ALTER TABLE asignacion ENABLE ROW LEVEL SECURITY;

COMMIT;


-- #####################################################################
-- #####################################################################
-- ACTUALIZACIÓN 02 · Retiro parcial en el punto y venta asociada
--
-- En la base ya desplegada se ejecuta SOLO esta sección (de aquí hasta el
-- final). Necesita la ACTUALIZACIÓN 01 (tabla asignacion y sus triggers).
-- Lo de arriba no se modifica.
--
-- Es incremental e idempotente: corre sobre una base que ya tiene la
-- estructura anterior y se puede ejecutar varias veces sin duplicar
-- objetos ni perder datos.
--
-- Qué agrega (explicación en db/README.md, sección 12):
--   1. Todo subsidio maneja saldo: se cobra por partes en el punto
--   2. Reglas del cobro: a la cuenta va todo el saldo; el retiro, en
--      unidades enteras de la moneda (RN-21, RN-22)
--   3. Tipo estado_venta y tabla venta: la compra que la persona hizo en
--      el punto durante su retiro (RN-23)
--   4. Reglas y máquina de estados de la venta
--   5. La venta sigue al cobro: Pagado → por enviar a facturar;
--      Rechazado o Fallido → anulada
--   6. Auditoría y seguridad de lo nuevo
-- #####################################################################
-- #####################################################################

BEGIN;

-- ---------------------------------------------------------------------
-- 1 y 2. Reglas del cobro (reemplaza fn_cobro_reglas de la ACTUALIZACIÓN
--    01; lo anterior queda igual y cambia lo marcado con «Nuevo (02)»)
--   Un programa «maneja saldo» si es subsidio o si tiene permite_parcial.
--   Los bonos siguen siendo de un solo uso (RN-02): no se vuelven efectivo.
--   RN-21  retiro de un programa con saldo: en unidades enteras de la
--          moneda (el efectivo no tiene centavos)
--   RN-22  canal cuenta de un programa con saldo: se paga todo el saldo;
--          solo el punto deja elegir cuánto
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cobro_reglas() RETURNS trigger AS $$
DECLARE
  p  programa%ROWTYPE;
  tipo_del_punto tipo_punto;
  saldo bigint;
  maneja_saldo boolean;
BEGIN
  IF NEW.estado = 'Rechazado' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO p FROM programa WHERE id = NEW.programa_id;

  IF p.estado <> 'Activo' OR now() NOT BETWEEN p.vigencia_inicio AND p.vigencia_fin THEN
    RAISE EXCEPTION 'RN-06: el programa no está recibiendo cobros (estado % o fuera de vigencia)', p.estado;
  END IF;

  IF p.tipo = 'subsidio' AND NEW.canal = 'compra' THEN
    RAISE EXCEPTION 'RN-03: un subsidio se cobra a la cuenta o en un punto de retiro';
  END IF;

  IF p.tipo = 'bono' THEN
    IF NEW.canal <> 'compra' THEN
      RAISE EXCEPTION 'RN-03: un bono solo se usa en una compra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM programa_punto
                    WHERE programa_id = NEW.programa_id AND punto_id = NEW.punto_id)
       AND NOT EXISTS (SELECT 1 FROM punto s
                         JOIN comercio c ON c.id = s.comercio_id AND c.verificado_en IS NOT NULL
                         JOIN programa_categoria pc ON pc.programa_id = NEW.programa_id
                                                  AND pc.categoria = c.categoria
                        WHERE s.id = NEW.punto_id) THEN
      RAISE EXCEPTION 'RN-03: este comercio no acepta este bono';
    END IF;
  END IF;

  IF NEW.punto_id IS NOT NULL THEN
    SELECT tipo INTO tipo_del_punto FROM punto WHERE id = NEW.punto_id;
    IF tipo_del_punto::text <> NEW.canal::text THEN
      RAISE EXCEPTION 'RN-03: un punto de % no atiende el canal %', tipo_del_punto, NEW.canal;
    END IF;
  END IF;

  IF NEW.canal = 'cuenta' AND NOT EXISTS (SELECT 1 FROM cuenta_beneficiario
                                           WHERE id = NEW.cuenta_id AND estado = 'Verificada') THEN
    RAISE EXCEPTION 'RN-04: la cuenta no está verificada';
  END IF;

  IF EXISTS (SELECT 1 FROM bloqueo_pin
              WHERE programa_id = NEW.programa_id
                AND beneficiario_id = NEW.beneficiario_id
                AND bloqueado_hasta > now()) THEN
    RAISE EXCEPTION 'RN-07: la persona está bloqueada por PIN en este programa';
  END IF;

  -- Nuevo (02): todo subsidio maneja saldo
  maneja_saldo := p.permite_parcial OR p.tipo = 'subsidio';

  IF NOT maneja_saldo THEN
    IF EXISTS (SELECT 1 FROM cobro
                WHERE programa_id = NEW.programa_id
                  AND beneficiario_id = NEW.beneficiario_id
                  AND estado IN ('Solicitado', 'PorConfirmar', 'Pagando', 'Pagado')) THEN
      RAISE EXCEPTION 'RN-02: este subsidio ya está en proceso o fue cobrado';
    END IF;
  ELSE
    SELECT asignado - cobrado - comprometido INTO saldo
      FROM asignacion
     WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'RN-19: la persona no tiene asignación en este programa';
    END IF;
    IF NEW.monto > saldo THEN
      RAISE EXCEPTION 'RN-19: saldo insuficiente (disponible %)', saldo;
    END IF;
    IF p.monto_minimo_cobro IS NOT NULL AND NEW.monto < p.monto_minimo_cobro AND NEW.monto <> saldo THEN
      RAISE EXCEPTION 'RN-20: el monto es menor que el mínimo de cobro (%)', p.monto_minimo_cobro;
    END IF;
    -- Nuevo (02)
    IF NEW.canal = 'cuenta' AND NEW.monto <> saldo THEN
      RAISE EXCEPTION 'RN-22: a la cuenta se paga todo el saldo (disponible %)', saldo;
    END IF;
    IF NEW.canal = 'retiro' AND NEW.monto % (10::numeric ^ p.escala_moneda)::bigint <> 0 THEN
      RAISE EXCEPTION 'RN-21: el retiro va en unidades enteras de la moneda';
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- El saldo se mueve con el estado del cobro (reemplaza fn_cobro_mueve_saldo
-- de la ACTUALIZACIÓN 01). Único cambio: «maneja saldo» incluye a todo
-- subsidio. La API crea o sube la fila de asignacion con lo que dice la
-- liquidación antes de crear el cobro; este trigger solo reserva, confirma
-- y libera.
CREATE OR REPLACE FUNCTION fn_cobro_mueve_saldo() RETURNS trigger AS $$
DECLARE
  maneja_saldo boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'Rechazado' THEN
      RETURN NEW;
    END IF;
    SELECT permite_parcial OR tipo = 'subsidio' INTO maneja_saldo FROM programa WHERE id = NEW.programa_id;
    IF maneja_saldo THEN
      UPDATE asignacion
         SET comprometido = comprometido + NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RN-19: la persona no tiene asignación en este programa';
      END IF;
    ELSE
      INSERT INTO asignacion (programa_id, beneficiario_id, asignado, comprometido)
      VALUES (NEW.programa_id, NEW.beneficiario_id, NEW.monto, NEW.monto)
      ON CONFLICT (programa_id, beneficiario_id) DO UPDATE
        SET asignado     = asignacion.cobrado + asignacion.comprometido + EXCLUDED.asignado,
            comprometido = asignacion.comprometido + EXCLUDED.comprometido,
            version      = asignacion.version + 1;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'Pagado' THEN
      UPDATE asignacion
         SET comprometido = comprometido - NEW.monto, cobrado = cobrado + NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    ELSIF NEW.estado IN ('Rechazado', 'Fallido') AND OLD.estado <> 'Rechazado' THEN
      UPDATE asignacion
         SET comprometido = comprometido - NEW.monto, version = version + 1
       WHERE programa_id = NEW.programa_id AND beneficiario_id = NEW.beneficiario_id;
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. Venta: la compra que la persona hizo en el punto durante su retiro.
--    Es parte del retiro, no un cobro aparte:
--      efectivo que se entrega = cobro.monto − venta.valor
--    Tatú no factura: guarda la venta y la envía a un sistema externo de
--    facturación cuando el cobro queda Pagado.
--
--    Registrada  el cobro todavía no se paga (espera PIN o se está pagando)
--    PorEnviar   el cobro quedó Pagado: falta que facturación la reciba
--                (también si el envío falló y se va a reintentar)
--    Enviada     facturación la recibió (final)
--    Rechazada   facturación la rechazó por sus datos; se puede reenviar
--    Anulada     el cobro terminó Rechazado o Fallido: no hubo venta (final)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_venta') THEN
    CREATE TYPE estado_venta AS ENUM ('Registrada', 'PorEnviar', 'Enviada', 'Rechazada', 'Anulada');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS venta (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- también es la llave de idempotencia ante facturación
  cobro_id            uuid NOT NULL UNIQUE REFERENCES cobro (id)    ON DELETE RESTRICT,  -- una venta por retiro
  punto_id            uuid NOT NULL REFERENCES punto (id)           ON DELETE RESTRICT,
  beneficiario_id     uuid NOT NULL REFERENCES beneficiario (id)    ON DELETE RESTRICT,
  valor               bigint NOT NULL CHECK (valor > 0),            -- unidades mínimas, como cobro.monto
  descripcion         text CHECK (char_length(descripcion) BETWEEN 2 AND 120),
  estado              estado_venta NOT NULL DEFAULT 'Registrada',
  intentos_envio      smallint NOT NULL DEFAULT 0 CHECK (intentos_envio >= 0),
  ultimo_error        text,                                         -- texto corto; nunca datos personales
  referencia_externa  text,                                         -- id que devolvió facturación
  enviada_en          timestamptz,
  version             int NOT NULL DEFAULT 0,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT enviada_con_fecha CHECK ((estado = 'Enviada') = (enviada_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS venta_punto_idx      ON venta (punto_id, creado_en);
CREATE INDEX IF NOT EXISTS venta_por_enviar_idx ON venta (actualizado_en) WHERE estado = 'PorEnviar';

-- ---------------------------------------------------------------------
-- 4. Reglas y máquina de estados de la venta
--   RN-23  la venta va en un retiro del mismo punto y la misma persona,
--          se registra antes del PIN y es MENOR que el retiro
--   Registrada → PorEnviar (cobro Pagado) | Anulada (cobro Rechazado o Fallido)
--   PorEnviar  → Enviada | Rechazada
--   Rechazada  → PorEnviar (reenvío)
--   Enviada, Anulada: finales. El valor y el cobro no cambian.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_venta_reglas() RETURNS trigger AS $$
DECLARE
  c cobro%ROWTYPE;
BEGIN
  SELECT * INTO c FROM cobro WHERE id = NEW.cobro_id;
  IF c.canal <> 'retiro' THEN
    RAISE EXCEPTION 'RN-23: la venta solo se registra en un retiro en el punto';
  END IF;
  IF c.estado NOT IN ('Solicitado', 'PorConfirmar') THEN
    RAISE EXCEPTION 'RN-23: la venta se registra antes de confirmar el retiro';
  END IF;
  IF c.punto_id <> NEW.punto_id OR c.beneficiario_id <> NEW.beneficiario_id THEN
    RAISE EXCEPTION 'RN-23: la venta no corresponde al punto o a la persona del retiro';
  END IF;
  IF NEW.valor >= c.monto THEN
    RAISE EXCEPTION 'RN-23: la compra debe ser menor que el retiro';
  END IF;
  IF NEW.estado <> 'Registrada' THEN
    RAISE EXCEPTION 'Una venta nace Registrada';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_venta_transicion() RETURNS trigger AS $$
DECLARE
  estado_del_cobro estado_cobro;
BEGIN
  IF NEW.valor IS DISTINCT FROM OLD.valor OR NEW.cobro_id IS DISTINCT FROM OLD.cobro_id
     OR NEW.punto_id IS DISTINCT FROM OLD.punto_id OR NEW.beneficiario_id IS DISTINCT FROM OLD.beneficiario_id THEN
    RAISE EXCEPTION 'El valor y el cobro de una venta no cambian después de creada';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NOT (
         (OLD.estado = 'Registrada' AND NEW.estado IN ('PorEnviar', 'Anulada'))
      OR (OLD.estado = 'PorEnviar'  AND NEW.estado IN ('Enviada', 'Rechazada'))
      OR (OLD.estado = 'Rechazada'  AND NEW.estado = 'PorEnviar')
    ) THEN
      RAISE EXCEPTION 'Transición de venta no permitida: % -> %', OLD.estado, NEW.estado;
    END IF;
    SELECT estado INTO estado_del_cobro FROM cobro WHERE id = NEW.cobro_id;
    IF NEW.estado = 'PorEnviar' AND estado_del_cobro <> 'Pagado' THEN
      RAISE EXCEPTION 'Una venta se envía a facturar solo con el retiro Pagado';
    END IF;
    IF NEW.estado = 'Anulada' AND estado_del_cobro NOT IN ('Rechazado', 'Fallido') THEN
      RAISE EXCEPTION 'Una venta se anula solo si el retiro no se pagó';
    END IF;
  END IF;

  NEW.version        := OLD.version + 1;
  NEW.actualizado_en := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venta_reglas ON venta;
CREATE TRIGGER venta_reglas
  BEFORE INSERT ON venta
  FOR EACH ROW EXECUTE FUNCTION fn_venta_reglas();

DROP TRIGGER IF EXISTS venta_transicion ON venta;
CREATE TRIGGER venta_transicion
  BEFORE UPDATE ON venta
  FOR EACH ROW EXECUTE FUNCTION fn_venta_transicion();

DROP TRIGGER IF EXISTS venta_sin_borrado ON venta;
CREATE TRIGGER venta_sin_borrado
  BEFORE DELETE ON venta
  FOR EACH ROW EXECUTE FUNCTION fn_prohibir_borrado();
DROP TRIGGER IF EXISTS venta_sin_truncate ON venta;
CREATE TRIGGER venta_sin_truncate
  BEFORE TRUNCATE ON venta
  FOR EACH STATEMENT EXECUTE FUNCTION fn_prohibir_borrado();

-- ---------------------------------------------------------------------
-- 5. La venta sigue al cobro, en la misma transacción
--    Pagado → PorEnviar · Rechazado o Fallido → Anulada
--    La API hace lo mismo (también corre sin triggers); la segunda vez no
--    encuentra la venta en Registrada y no cambia nada.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cobro_mueve_venta() RETURNS trigger AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF NEW.estado = 'Pagado' THEN
      UPDATE venta SET estado = 'PorEnviar' WHERE cobro_id = NEW.id AND estado = 'Registrada';
    ELSIF NEW.estado IN ('Rechazado', 'Fallido') THEN
      UPDATE venta SET estado = 'Anulada' WHERE cobro_id = NEW.id AND estado = 'Registrada';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cobro_mueve_venta ON cobro;
CREATE TRIGGER cobro_mueve_venta
  AFTER UPDATE OF estado ON cobro
  FOR EACH ROW EXECUTE FUNCTION fn_cobro_mueve_venta();

-- ---------------------------------------------------------------------
-- 6. Auditoría y seguridad
-- ---------------------------------------------------------------------

-- evento también registra la venta y su envío a facturación. Se reemplaza
-- la restricción de la ACTUALIZACIÓN 01 (y la original, si quedara).
ALTER TABLE evento DROP CONSTRAINT IF EXISTS evento_tipo_entidad_check;
ALTER TABLE evento DROP CONSTRAINT IF EXISTS evento_tipo_entidad_valido;
ALTER TABLE evento ADD CONSTRAINT evento_tipo_entidad_valido CHECK (tipo_entidad IN
  ('programa', 'cuenta', 'cobro', 'beneficiario', 'punto', 'comercio', 'entidad', 'usuario', 'asignacion', 'venta'));

ALTER FUNCTION fn_cobro_reglas()       SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_mueve_saldo()  SET search_path FROM CURRENT;
ALTER FUNCTION fn_venta_reglas()       SET search_path FROM CURRENT;
ALTER FUNCTION fn_venta_transicion()   SET search_path FROM CURRENT;
ALTER FUNCTION fn_cobro_mueve_venta()  SET search_path FROM CURRENT;

ALTER TABLE venta ENABLE ROW LEVEL SECURITY;

COMMIT;

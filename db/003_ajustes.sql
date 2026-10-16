-- =====================================================================
-- Tatú · Ajustes a nivel de base de datos (se ejecuta después de 001 y 002)
--  1. bloqueo_pin: el bloqueo de 15 min tras 3 PIN errados (RN-07)
--  2. evento.actor: quién hizo cada cambio (RNF-09)
--  3. programa.aprobacion_solicitada_en: para vencer la aprobación (HU-05)
--  4. Reglas del cobro que garantiza la base (RN-03, RN-04, RN-06)
--  5. RLS en todas las tablas (Supabase publica el esquema public)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. bloqueo_pin
-- La API registra el bloqueo al tercer PIN errado (PIN_MAX_INTENTOS y
-- PIN_BLOQUEO_MIN son configuración de la API); la base impide cobrar
-- mientras dure.
-- ---------------------------------------------------------------------
CREATE TABLE bloqueo_pin (
  programa_id      uuid NOT NULL REFERENCES programa (id)     ON DELETE RESTRICT,
  beneficiario_id  uuid NOT NULL REFERENCES beneficiario (id) ON DELETE RESTRICT,
  bloqueado_hasta  timestamptz NOT NULL,
  cobro_id         uuid NOT NULL REFERENCES cobro (id)        ON DELETE RESTRICT,  -- cobro que lo causó
  creado_en        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (programa_id, beneficiario_id)
);

-- ---------------------------------------------------------------------
-- 2. evento.actor: rol y, si aplica, su id. Nunca la cédula.
--    Ejemplos: 'sistema', 'entidad', 'punto:<uuid>', 'beneficiario:<uuid>', 'banco'
-- ---------------------------------------------------------------------
ALTER TABLE evento
  ADD COLUMN actor text NOT NULL DEFAULT 'sistema'
  CONSTRAINT actor_valido CHECK (actor ~ '^(sistema|entidad|beneficiario|punto|banco)(:[0-9a-f-]{36})?$');

-- ---------------------------------------------------------------------
-- 3. programa.aprobacion_solicitada_en
-- ---------------------------------------------------------------------
ALTER TABLE programa
  ADD COLUMN aprobacion_solicitada_en timestamptz,
  ADD CONSTRAINT espera_con_fecha CHECK (estado <> 'EsperandoAprobacion' OR aprobacion_solicitada_en IS NOT NULL);

-- ---------------------------------------------------------------------
-- 4. Reglas del cobro garantizadas por la base
-- Aplican a todo cobro que nace vivo. Un cobro que nace Rechazado se deja
-- registrar siempre: es justamente el rastro del intento inválido.
--   RN-06  el programa está Activo y dentro de su vigencia
--   RN-03  subsidio: canal cuenta o retiro · bono: solo compra en un
--          comercio de programa_punto
--          el tipo del punto coincide con el canal (retiro / compra)
--   RN-04  el canal cuenta exige una cuenta Verificada
--   RN-07  la persona no está bloqueada por PIN en ese programa
-- ---------------------------------------------------------------------
-- Un rechazo puede ocurrir antes de tener la cuenta o el valor de la compra
-- (HU-13: "Primero enlaza y verifica tu cuenta"; HU-21: comercio no
-- autorizado). Esos rechazos tienen que poder quedar registrados.
ALTER TABLE cobro DROP CONSTRAINT canal_y_cuenta;
ALTER TABLE cobro ADD CONSTRAINT canal_y_cuenta CHECK (
      (canal <> 'cuenta' AND cuenta_id IS NULL)
   OR (canal =  'cuenta' AND (cuenta_id IS NOT NULL OR estado = 'Rechazado')));

ALTER TABLE cobro DROP CONSTRAINT compra_con_total;
ALTER TABLE cobro ADD CONSTRAINT compra_con_total CHECK (
      (canal <> 'compra' AND total_compra IS NULL)
   OR (canal =  'compra' AND (total_compra IS NOT NULL OR estado = 'Rechazado')));

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
                    WHERE programa_id = NEW.programa_id AND punto_id = NEW.punto_id) THEN
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

-- ---------------------------------------------------------------------
-- 5. RLS en todas las tablas, sin políticas.
-- La API pública de Supabase (roles anon y authenticated) queda sin
-- acceso; el backend se conecta como dueño de las tablas y no pasa por RLS.
-- ---------------------------------------------------------------------
ALTER TABLE programa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE punto               ENABLE ROW LEVEL SECURITY;
ALTER TABLE programa_punto      ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_beneficiario ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobro               ENABLE ROW LEVEL SECURITY;
ALTER TABLE evento              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueo_pin         ENABLE ROW LEVEL SECURITY;

COMMIT;

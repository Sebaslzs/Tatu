-- =====================================================================
-- Tatú · Datos de prueba (ficticios). Escenario de la demo:
-- subsidio de $230.000 para 3 personas (tope $690.000), un punto de
-- retiro y una cuarta persona con un retroactivo cargado después.
-- Las billeteras son de la Test Wallet; ningún token es real.
-- =====================================================================

BEGIN;

INSERT INTO programa (id, entidad, nombre, tipo, destino, billetera_programa,
                      codigo_moneda, escala_moneda, vigencia_inicio, vigencia_fin,
                      tope_total, estado, token_acceso, url_gestion)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Colsubsidio', 'Subsidio jóvenes (simulado)',
        'subsidio', 'libre', 'https://ilp.interledger-test.dev/programa-subsidio',
        'USD', 2, '2026-10-01', '2027-12-31',
        69000000, 'Activo', 'token-falso-solo-demo',
        'https://auth.interledger-test.dev/token/falso');

INSERT INTO punto (id, nombre, direccion, billetera, tipo) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Tienda Marta — corresponsal', 'Calle 1 # 2-3',
   'https://ilp.interledger-test.dev/punto-1', 'retiro');

-- Ana y Luis tienen cuenta; Jorge cobra en el punto; Rosa trae un retroactivo
INSERT INTO beneficiario (id, tipo_documento, numero_documento) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'CC', '900000001'),
  ('c0000000-0000-0000-0000-000000000002', 'CC', '900000002'),
  ('c0000000-0000-0000-0000-000000000003', 'CC', '900000003'),
  ('c0000000-0000-0000-0000-000000000004', 'CC', '900000004');

INSERT INTO cuenta_beneficiario (id, beneficiario_id, billetera, estado, verificada_en) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'https://ilp.interledger-test.dev/ana', 'Verificada', '2026-10-02'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   'https://ilp.interledger-test.dev/luis', 'Verificada', '2026-10-02');

-- Ana cobra a su cuenta (Solicitado -> Pagando -> Pagado)
INSERT INTO cobro (id, programa_id, cuenta_id, beneficiario_id, canal, monto, llave_idempotencia)
VALUES ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
        'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'cuenta', 23000000, 'demo-ana-1');
UPDATE cobro SET estado = 'Pagando',
       url_pago_entrante = 'https://ilp.interledger-test.dev/ana/incoming-payments/demo',
       url_pago_saliente = 'https://ilp.interledger-test.dev/programa-subsidio/outgoing-payments/demo-1'
 WHERE id = 'e0000000-0000-0000-0000-000000000001';
UPDATE cobro SET estado = 'Pagado' WHERE id = 'e0000000-0000-0000-0000-000000000001';

-- Jorge cobra en el punto (PorConfirmar -> Pagando -> Pagado)
INSERT INTO cobro (id, programa_id, punto_id, beneficiario_id, canal, monto, estado, llave_idempotencia)
VALUES ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003',
        'retiro', 23000000, 'PorConfirmar', 'demo-jorge-1');
UPDATE cobro SET estado = 'Pagando',
       url_pago_entrante = 'https://ilp.interledger-test.dev/punto-1/incoming-payments/demo',
       url_pago_saliente = 'https://ilp.interledger-test.dev/programa-subsidio/outgoing-payments/demo-2'
 WHERE id = 'e0000000-0000-0000-0000-000000000002';
UPDATE cobro SET estado = 'Pagado' WHERE id = 'e0000000-0000-0000-0000-000000000002';

-- Rosa: retroactivo de $460.000 que supera el tope -> el banco lo rechaza
INSERT INTO cobro (id, programa_id, punto_id, beneficiario_id, canal, monto, estado, llave_idempotencia)
VALUES ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
        'b0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004',
        'retiro', 46000000, 'PorConfirmar', 'demo-rosa-1');
UPDATE cobro SET estado = 'Pagando' WHERE id = 'e0000000-0000-0000-0000-000000000003';
UPDATE cobro SET estado = 'Fallido', motivo_rechazo = 'TopeSuperado'
 WHERE id = 'e0000000-0000-0000-0000-000000000003';

INSERT INTO evento (tipo_entidad, id_entidad, estado_anterior, estado_nuevo, detalle) VALUES
  ('cobro', 'e0000000-0000-0000-0000-000000000001', 'Pagando', 'Pagado', '{"referencia": "SUB-0001"}'),
  ('cobro', 'e0000000-0000-0000-0000-000000000002', 'Pagando', 'Pagado', '{"referencia": "SUB-0002"}'),
  ('cobro', 'e0000000-0000-0000-0000-000000000003', 'Pagando', 'Fallido', '{"error": "InsufficientGrant"}');

COMMIT;

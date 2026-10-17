// Tablas de los sistemas simulados de la demo: la liquidación del gobierno y el banco puente de Bre-B.
// Viven en el esquema `simulacion`, aparte del modelo de Tatú (que se lee de Supabase con
// `pnpm db:pull`), y la API las crea la primera vez que las usa, en PGlite o en Supabase. Tatú no
// las lee con SQL: solo los routers de /api/liquidacion y /api/puente.
import { sql } from 'drizzle-orm'
import { bigint, boolean, index, pgSchema, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import type { Db } from '../db/conexion.ts'
import { esViolacionUnica } from '../db/errores.ts'

const simulacion = pgSchema('simulacion')

/** Quién está en la liquidación: nombre, PIN (solo su hash) y monto en unidades mínimas. */
export const personaLiquidada = simulacion.table('persona', {
  documento: text('documento').primaryKey(),
  nombre: text('nombre').notNull(),
  pinHash: text('pin_hash'),
  monto: bigint('monto', { mode: 'number' }).notNull(),
  novedad: boolean('novedad').notNull().default(false),
  creadoEn: timestamp('creado_en', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

/** Las llaves Bre-B del banco puente, cada una apuntando a una billetera de la Test Wallet. */
export const llaveBreB = simulacion.table(
  'llave_breb',
  {
    tipo: text('tipo').notNull(),
    valor: text('valor').notNull(),
    documentoTitular: text('documento_titular').notNull(),
    nombreTitular: text('nombre_titular').notNull(),
    billetera: text('billetera').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tipo, t.valor] }), index('llave_breb_titular').on(t.documentoTitular)],
)

const DDL = [
  'CREATE SCHEMA IF NOT EXISTS simulacion',
  `CREATE TABLE IF NOT EXISTS simulacion.persona (
    documento  text PRIMARY KEY,
    nombre     text NOT NULL,
    pin_hash   text,
    monto      bigint NOT NULL CHECK (monto > 0),
    novedad    boolean NOT NULL DEFAULT false,
    creado_en  timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS simulacion.llave_breb (
    tipo               text NOT NULL,
    valor              text NOT NULL,
    documento_titular  text NOT NULL,
    nombre_titular     text NOT NULL,
    billetera          text NOT NULL,
    creado_en          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tipo, valor)
  )`,
  'CREATE INDEX IF NOT EXISTS llave_breb_titular ON simulacion.llave_breb (documento_titular)',
  // En Supabase nadie las lee por la API de datos: solo esta API, con su propia conexión
  'ALTER TABLE simulacion.persona ENABLE ROW LEVEL SECURITY',
  'ALTER TABLE simulacion.llave_breb ENABLE ROW LEVEL SECURITY',
]

const listas = new WeakMap<Db, Promise<void>>()

async function crear(db: Db): Promise<void> {
  for (const sentencia of DDL) {
    try {
      await db.execute(sql.raw(sentencia))
    } catch (e) {
      // Dos instancias creando lo mismo a la vez: la otra ya lo creó
      if (!esViolacionUnica(e)) throw e
    }
  }
}

/** Crea el esquema y las tablas si faltan; una sola vez por conexión. Si falla, se reintenta luego. */
export function prepararTablasSimulacion(db: Db): Promise<void> {
  let lista = listas.get(db)
  if (!lista) {
    lista = crear(db).catch((e: unknown) => {
      listas.delete(db)
      throw e
    })
    listas.set(db, lista)
  }
  return lista
}

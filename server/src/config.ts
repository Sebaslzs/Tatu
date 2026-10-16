// Única lectura de process.env (Estructura § 2). Todo el resto importa `config`.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const raizRepo = resolve(import.meta.dirname, '../..')
const archivoEnv = resolve(raizRepo, '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

const bandera = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true')

const vacioComoIndefinido = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined))

const esquema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: vacioComoIndefinido,

  APP_BASE_URL: z.url().default('http://localhost:5173'),
  API_BASE_URL: z.url().default('http://localhost:3000/api'),
  LIQUIDACION_URL: z.url().default('http://localhost:3000/api/liquidacion'),
  PUENTE_URL: z.url().default('http://localhost:3000/api/puente'),
  POLL_INTERVALO_MS: z.coerce.number().int().positive().default(1000),

  OP_CLIENT_WALLET_ADDRESS: vacioComoIndefinido,
  OP_KEY_ID: vacioComoIndefinido,
  OP_PRIVATE_KEY_PATH: vacioComoIndefinido,
  OP_PRIVATE_KEY_BASE64: vacioComoIndefinido,

  EXTRA_BONO: bandera,
  EXTRA_QR: bandera,
  EXTRA_PDF417: bandera,
  EXTRA_CONTRATO: bandera,
  EXTRA_DEPLOY: bandera,
})

export const config = esquema.parse(process.env)
export type Config = typeof config

/** Carpeta de la base PGlite cuando no hay DATABASE_URL (AD-23). */
export const PGLITE_DIR = resolve(raizRepo, 'server/data/pglite')

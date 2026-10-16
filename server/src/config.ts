// Única lectura de process.env (Estructura § 2). El resto recibe la configuración ya validada.
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

const sinBarraFinal = (url: string) => url.replace(/\/+$/, '')

const entero = (porDefecto: number) => z.coerce.number().int().positive().default(porDefecto)

const esquema = z.object({
  PORT: entero(3000),
  DATABASE_URL: vacioComoIndefinido,

  APP_BASE_URL: z.url().default('http://localhost:5173').transform(sinBarraFinal),
  API_BASE_URL: z.url().default('http://localhost:3000/api').transform(sinBarraFinal),
  LIQUIDACION_URL: z.url().default('http://localhost:3000/api/liquidacion'),
  LIQUIDACION_TIMEOUT_MS: entero(5000),
  PUENTE_URL: z.url().default('http://localhost:3000/api/puente'),
  POLL_INTERVALO_MS: entero(1000),
  /** Minutos que espera una aprobación antes de volver a Borrador (CA-01.08, HU-05). */
  APROBACION_TTL_MIN: entero(10),

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

export type Config = z.infer<typeof esquema>

/** Valida un entorno; se exporta para poder probar la configuración sin tocar process.env. */
export function leerConfig(entorno: Record<string, string | undefined>): Config {
  return esquema.parse(entorno)
}

export const config = leerConfig(process.env)

/** Carpeta de la base PGlite cuando no hay DATABASE_URL (AD-23). */
export const PGLITE_DIR = resolve(raizRepo, 'server/data/pglite')

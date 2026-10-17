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
  PUENTE_TIMEOUT_MS: entero(5000),
  /** CA-07.05: `subject` pide un permiso en la billetera; `simulada` (plan B) la da por verificada. */
  VERIFICACION_CUENTA: z.enum(['subject', 'simulada']).default('subject'),
  POLL_INTERVALO_MS: entero(1000),
  /** Minutos que espera una aprobación antes de volver a Borrador (CA-01.08, HU-05). */
  APROBACION_TTL_MIN: entero(10),
  /** HU-06: cada cuánto se rota el token del permiso; en la Test Wallet vence a los 10 minutos. */
  TOKEN_RENOVAR_CADA_SEG: entero(240),
  /** CA-11.04: segundos que espera un cobro el PIN antes de rechazarse por tiempo agotado. */
  CONFIRMACION_TTL_SEG: entero(120),
  /** CA-11.03: PIN incorrectos antes de rechazar el cobro y bloquear la cédula. */
  PIN_MAX_INTENTOS: entero(3),
  /** CA-11.03: minutos que queda bloqueada la cédula en el programa. */
  PIN_BLOQUEO_MIN: entero(15),

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

type Entorno = Record<string, string | undefined>

/**
 * En Vercel la web y la API comparten dominio: las URLs que falten salen del dominio del despliegue
 * (el de producción, o el de la rama en una preview). Fuera de Vercel el entorno queda igual.
 */
export function completarUrlsDeVercel(entorno: Entorno): Entorno {
  if (!entorno.VERCEL) return entorno
  const dominio =
    entorno.VERCEL_ENV === 'production'
      ? (entorno.VERCEL_PROJECT_PRODUCTION_URL ?? entorno.VERCEL_URL)
      : (entorno.VERCEL_BRANCH_URL ?? entorno.VERCEL_URL)
  if (!dominio) return entorno
  const web = `https://${dominio}`
  const api = entorno.API_BASE_URL || `${web}/api`
  return {
    ...entorno,
    APP_BASE_URL: entorno.APP_BASE_URL || web,
    API_BASE_URL: api,
    LIQUIDACION_URL: entorno.LIQUIDACION_URL || `${sinBarraFinal(api)}/liquidacion`,
    PUENTE_URL: entorno.PUENTE_URL || `${sinBarraFinal(api)}/puente`,
  }
}

/** Valida un entorno; se exporta para poder probar la configuración sin tocar process.env. */
export function leerConfig(entorno: Entorno): Config {
  return esquema.parse(completarUrlsDeVercel(entorno))
}

export const config = leerConfig(process.env)

/** Carpeta de la base PGlite cuando no hay DATABASE_URL (AD-23). */
export const PGLITE_DIR = resolve(raizRepo, 'server/data/pglite')

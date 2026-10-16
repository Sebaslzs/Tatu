// `pnpm db:pull` genera src/db/generado/schema.ts leyendo la base de Supabase (AD-06).
// La base es la fuente de verdad del modelo: aquí no se escribe SQL a mano.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit carga este archivo como CommonJS desde server/: se usa el directorio de trabajo
const archivoEnv = resolve(process.cwd(), '../.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

// La introspección no funciona por el pooler de transacción (6543); se usa el de sesión (5432)
const url = (process.env.DATABASE_URL ?? '').replace(':6543/', ':5432/')

export default defineConfig({
  dialect: 'postgresql',
  out: './src/db/generado',
  schemaFilter: ['public'],
  dbCredentials: { url },
})

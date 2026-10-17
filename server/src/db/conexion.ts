// Conexión a PostgreSQL con Drizzle (AD-06). El modelo vive en Supabase y se refleja en
// db/generado/schema.ts con `pnpm db:pull`; aquí no se escribe SQL de esquema.
//   - Con DATABASE_URL: Supabase por `postgres` (AD-05). La base ya tiene el esquema.
//   - Sin ella: PGlite (AD-23), en una carpeta (desarrollo) o en memoria (pruebas), con el mismo
//     esquema derivado de schema.ts.
import { mkdirSync } from 'node:fs'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { crearEsquemaLocal } from './esquemaLocal.ts'

/** Base o transacción de Drizzle: los repositorios aceptan cualquiera de las dos. */
export type Db = PgDatabase<PgQueryResultHKT>

export type TipoBase = 'postgres' | 'pglite'

export interface Base {
  tipo: TipoBase
  db: Db
  /**
   * Corre `fn` solo si nadie más tiene el candado `clave` (pg_try_advisory_lock); si otro lo tiene,
   * devuelve undefined sin esperar. En Vercel evita que dos instancias hagan la misma tarea a la vez.
   */
  conCandado<T>(clave: number, fn: () => Promise<T>): Promise<T | undefined>
  cerrar(): Promise<void>
}

export interface OpcionesBase {
  /** URL de PostgreSQL (Supabase); sin ella se usa PGlite. */
  url?: string | undefined
  /** Carpeta de PGlite; sin ella, PGlite en memoria. */
  carpetaPglite?: string | undefined
}

export async function abrirBase({ url, carpetaPglite }: OpcionesBase): Promise<Base> {
  return url ? abrirPostgres(url) : abrirPglite(carpetaPglite)
}

async function abrirPostgres(url: string): Promise<Base> {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  // El pooler 6543 (modo Transaction) no admite prepared statements
  const sql = postgres(url, { max: 5, prepare: !url.includes(':6543') })
  await sql`SELECT 1`
  return {
    tipo: 'postgres',
    db: drizzle(sql),
    async conCandado(clave, fn) {
      // El candado vive en la sesión: se toma y se suelta en la misma conexión reservada
      const reservada = await sql.reserve()
      try {
        const [fila] = await reservada<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${clave}) AS ok`
        if (!fila?.ok) return undefined
        try {
          return await fn()
        } finally {
          await reservada`SELECT pg_advisory_unlock(${clave})`
        }
      } finally {
        reservada.release()
      }
    },
    cerrar: () => sql.end(),
  }
}

async function abrirPglite(carpeta: string | undefined): Promise<Base> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  if (carpeta) mkdirSync(carpeta, { recursive: true })
  const cliente = new PGlite(carpeta)
  await crearEsquemaLocal({
    ejecutar: (sentencia) => cliente.exec(sentencia).then(() => undefined),
    existeTabla: (tabla) =>
      cliente
        .query(`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [tabla])
        .then((r) => r.rows.length > 0),
  })
  // PGlite tiene una sola conexión y un solo proceso: no hace falta candado
  return { tipo: 'pglite', db: drizzle(cliente), conCandado: (_clave, fn) => fn(), cerrar: () => cliente.close() }
}

// Conexión a PostgreSQL: Supabase con `postgres` si hay DATABASE_URL (AD-05);
// si no, PGlite en server/data/pglite (AD-23). Ambas con Drizzle (AD-06).
import { mkdirSync } from 'node:fs'
import { config, PGLITE_DIR } from '../config.ts'
import { migrar } from './migrar.ts'

export type TipoBase = 'postgres' | 'pglite'

export interface Base {
  tipo: TipoBase
  db: unknown
  cerrar(): Promise<void>
}

const SQL_APLICADAS = 'SELECT nombre FROM piloto.migracion'

export async function abrirBase(opciones: { enMemoria?: boolean } = {}): Promise<Base> {
  if (config.DATABASE_URL && !opciones.enMemoria) {
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    // El pooler 6543 (modo Transaction) no admite prepared statements
    const sql = postgres(config.DATABASE_URL, { max: 5, prepare: !config.DATABASE_URL.includes(':6543') })
    await migrar({
      ejecutar: (texto) => sql.unsafe(texto).simple().then(() => undefined),
      aplicadas: () => sql.unsafe<{ nombre: string }[]>(SQL_APLICADAS).then((filas) => filas.map((f) => f.nombre)),
    })
    return { tipo: 'postgres', db: drizzle(sql), cerrar: () => sql.end() }
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  if (!opciones.enMemoria) mkdirSync(PGLITE_DIR, { recursive: true })
  const cliente = new PGlite(opciones.enMemoria ? undefined : PGLITE_DIR)
  await migrar({
    ejecutar: (texto) => cliente.exec(texto).then(() => undefined),
    aplicadas: () => cliente.query<{ nombre: string }>(SQL_APLICADAS).then((r) => r.rows.map((f) => f.nombre)),
  })
  return { tipo: 'pglite', db: drizzle(cliente), cerrar: () => cliente.close() }
}

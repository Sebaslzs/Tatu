// Aplica en orden los .sql de db/migraciones/ que no estén en piloto.migracion.
// El esquema lo dictan estas migraciones; schema.ts se genera con `pnpm db:pull`.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface Ejecutor {
  /** Ejecuta uno o varios statements sin parámetros. */
  ejecutar(sql: string): Promise<void>
  /** Devuelve los nombres de las migraciones ya aplicadas. */
  aplicadas(): Promise<string[]>
}

const DIR_MIGRACIONES = resolve(import.meta.dirname, 'migraciones')

export async function migrar(base: Ejecutor): Promise<string[]> {
  await base.ejecutar(`
    CREATE SCHEMA IF NOT EXISTS piloto;
    CREATE TABLE IF NOT EXISTS piloto.migracion (
      nombre text PRIMARY KEY,
      aplicada_en timestamptz NOT NULL DEFAULT now()
    );
  `)

  const yaAplicadas = new Set(await base.aplicadas())
  const pendientes = readdirSync(DIR_MIGRACIONES)
    .filter((f) => f.endsWith('.sql') && !yaAplicadas.has(f))
    .sort()

  for (const archivo of pendientes) {
    const sql = readFileSync(resolve(DIR_MIGRACIONES, archivo), 'utf8')
    await base.ejecutar(`BEGIN;\n${sql}\n;INSERT INTO piloto.migracion (nombre) VALUES ('${archivo.replaceAll("'", "''")}');\nCOMMIT;`)
  }
  return pendientes
}

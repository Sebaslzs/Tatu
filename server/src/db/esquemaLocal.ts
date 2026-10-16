// Crea en PGlite el mismo esquema que tiene Supabase, derivándolo de db/generado/schema.ts con
// drizzle-kit. No hay archivos SQL: si Supabase cambia, `pnpm db:pull` y la base local se rehace
// (borrar server/data/pglite).
import * as esquema from './generado/schema.ts'

export interface DestinoEsquema {
  ejecutar(sentencia: string): Promise<void>
  existeTabla(tabla: string): Promise<boolean>
}

let sentencias: Promise<string[]> | undefined

/** El DDL se deriva una sola vez por proceso. */
function sentenciasDelEsquema(): Promise<string[]> {
  sentencias ??= import('drizzle-kit/api').then(({ generateDrizzleJson, generateMigration }) =>
    generateMigration(generateDrizzleJson({}), generateDrizzleJson(esquema)),
  )
  return sentencias
}

export async function crearEsquemaLocal(destino: DestinoEsquema): Promise<void> {
  if (await destino.existeTabla('programa')) return
  for (const sentencia of await sentenciasDelEsquema()) await destino.ejecutar(sentencia)
}

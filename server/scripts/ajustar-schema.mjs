// Corre después de `drizzle-kit pull`: corrige lo que la introspección genera mal y borra los
// artefactos que no usamos (la base de Supabase es la fuente de verdad; no versionamos SQL).
//   1. `bytea` sale como `unknown(...)`, que no existe: se define como customType.
//   2. Las clases de operador de los índices salen cruzadas (p. ej. timestamptz_ops sobre uuid):
//      se quitan y PostgreSQL usa la de cada tipo.
//   3. El id bigserial de `evento` pasa de bigint a number (ver abajo).
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const carpeta = resolve(import.meta.dirname, '../src/db/generado')
const archivo = resolve(carpeta, 'schema.ts')

let codigo = readFileSync(archivo, 'utf8')
codigo = codigo
  .replace(/\s*\/\/ TODO: failed to parse database type 'bytea'\n/g, '\n')
  .replace(/unknown\("(\w+)"\)/g, 'bytea("$1")')
  .replace(/\.op\("[a-z0-9_]+"\)/g, '')
  // 3. bigserial sale como `bigint`, que JSON no sabe serializar; un id de evento cabe en un number.
  .replace(/bigserial\(\{ mode: "bigint" \}\)/g, 'bigserial({ mode: "number" })')

if (codigo.includes('bytea("')) {
  codigo = codigo
    .replace(/^import \{ (.+) \} from "drizzle-orm\/pg-core"$/m, 'import { customType, $1 } from "drizzle-orm/pg-core"')
    .replace(/^(import \{ sql \} from "drizzle-orm"\n)/m, '$1\nconst bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" })\n')
}

writeFileSync(archivo, `// GENERADO con \`pnpm db:pull\` desde Supabase. No editar a mano.\n${codigo}`)
// relations.ts no se usa (solo el query builder) y sus imports sin extensión no compilan con nodenext
rmSync(resolve(carpeta, 'relations.ts'), { force: true })
rmSync(resolve(carpeta, 'meta'), { recursive: true, force: true })
for (const f of readdirSync(carpeta)) if (f.endsWith('.sql')) rmSync(resolve(carpeta, f))
console.log('schema.ts ajustado')

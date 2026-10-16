/**
 * Arma el despliegue de Vercel (Build Output API v3) en .vercel/output:
 *   - static/            la web (web/dist), con fallback a index.html para el router
 *   - functions/api.func la API de Express empaquetada con esbuild; sirve todo /api
 * Se corre con `pnpm run build:vercel` (ver vercel.json).
 */
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { build } from 'esbuild'

const raiz = path.resolve(import.meta.dirname, '..')
const salida = path.join(raiz, '.vercel/output')
const funcion = path.join(salida, 'functions/api.func')
const web = path.join(raiz, 'web/dist')

if (!existsSync(web)) throw new Error('Falta web/dist: corre antes `pnpm --filter web build`')

rmSync(salida, { recursive: true, force: true })
mkdirSync(funcion, { recursive: true })

cpSync(web, path.join(salida, 'static'), { recursive: true })

await build({
  entryPoints: [path.join(raiz, 'server/src/vercel.ts')],
  outfile: path.join(funcion, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: false,
  // PGlite y drizzle-kit solo se usan en desarrollo (imports dinámicos); swagger-ui-dist sirve
  // sus archivos desde su propia carpeta, así que viaja aparte en node_modules.
  external: [
    '@electric-sql/pglite',
    'drizzle-orm/pglite',
    'drizzle-kit',
    'drizzle-kit/*',
    'swagger-ui-dist',
    'swagger-ui-dist/*',
  ],
  // Paquetes CommonJS dentro de un bundle ESM necesitan require y __dirname
  banner: {
    js: [
      "import { createRequire as __crearRequire } from 'node:module';",
      "import { fileURLToPath as __aRuta } from 'node:url';",
      'const require = __crearRequire(import.meta.url);',
      'const __filename = __aRuta(import.meta.url);',
      "const __dirname = __filename.slice(0, __filename.lastIndexOf('/'));",
    ].join('\n'),
  },
  logLevel: 'warning',
})

const requireServer = createRequire(path.join(raiz, 'server/package.json'))
const swaggerUiExpress = realpathSync(path.dirname(requireServer.resolve('swagger-ui-express/package.json')))
const swaggerUiDist = realpathSync(
  path.dirname(createRequire(path.join(swaggerUiExpress, 'index.js')).resolve('swagger-ui-dist/package.json')),
)
cpSync(swaggerUiDist, path.join(funcion, 'node_modules/swagger-ui-dist'), { recursive: true, dereference: true })

// @interledger/open-payments lee sus specs OpenAPI (.yaml) desde `__dirname/specs` al crear el
// cliente; con el bundle de esbuild ese __dirname es la carpeta de la función
const openPayments = realpathSync(path.dirname(requireServer.resolve('@interledger/open-payments/package.json')))
cpSync(path.join(openPayments, 'dist/openapi/specs'), path.join(funcion, 'specs'), { recursive: true })

writeFileSync(
  path.join(funcion, '.vc-config.json'),
  JSON.stringify(
    {
      runtime: 'nodejs24.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
    },
    null,
    2,
  ),
)
writeFileSync(path.join(funcion, 'package.json'), JSON.stringify({ type: 'module' }))

writeFileSync(
  path.join(salida, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api(?:/.*)?$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
)

console.log('Vercel: .vercel/output listo (static + functions/api.func)')

// Arranque local: abre la base (Supabase o PGlite), arma el contenedor y levanta Express.
import { crearApp } from './app.ts'
import { config, PGLITE_DIR } from './config.ts'
import { crearContenedor } from './contenedor.ts'
import { abrirBase } from './db/conexion.ts'

const base = await abrirBase({ url: config.DATABASE_URL, carpetaPglite: PGLITE_DIR })
console.log(`Base de datos: ${base.tipo}`)

// Express 5 entrega el error de listen (p. ej. EADDRINUSE) al callback
crearApp(crearContenedor({ db: base.db, config })).listen(config.PORT, (error) => {
  if (error) {
    console.error(`No se pudo abrir el puerto ${config.PORT}: ${error.message}`)
    process.exit(1)
  }
  console.log(`API de Tatú en http://localhost:${config.PORT}/api`)
})

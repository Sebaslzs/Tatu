// Arranque local: abre la base, aplica migraciones y levanta Express.
import { config } from './config.ts'
import { crearApp } from './app.ts'
import { abrirBase } from './db/conexion.ts'

const base = await abrirBase()
console.log(`Base de datos: ${base.tipo}`)

// Express 5 entrega el error de listen (p. ej. EADDRINUSE) al callback
crearApp().listen(config.PORT, (error) => {
  if (error) {
    console.error(`No se pudo abrir el puerto ${config.PORT}: ${error.message}`)
    process.exit(1)
  }
  console.log(`API de Tatú en http://localhost:${config.PORT}/api`)
})

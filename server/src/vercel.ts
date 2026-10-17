// Entrada de la API en Vercel: una función que sirve todo /api con la misma app de Express que
// main.ts. No hay proceso prendido, así que lo que main.ts hace al arrancar (abrir la base, en
// Supabase con el esquema ya cargado) se hace en el primer pedido de cada instancia.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import { crearApp } from './app.ts'
import { config } from './config.ts'
import { crearContenedor } from './contenedor.ts'
import { log } from './comun/log.ts'
import { abrirBase } from './db/conexion.ts'

let listo: Promise<ReturnType<typeof crearApp>> | undefined

function preparar(): Promise<ReturnType<typeof crearApp>> {
  listo ??= (async () => {
    if (!config.DATABASE_URL) {
      throw new Error('En Vercel DATABASE_URL tiene que ser una URL de PostgreSQL (Supabase)')
    }
    const base = await abrirBase({ url: config.DATABASE_URL })
    log.info(`Base de datos: ${base.tipo}`)
    const contenedor = crearContenedor({ db: base.db, config })
    // RNF-05: una sola pasada para retomar los cobros en Pagando; corre en segundo plano porque
    // puede esperar pagos en curso (no worker, pero tampoco se colgará el primer pedido).
    waitUntil(
      contenedor.cobros
        .recuperarAlArrancar()
        .then((n) => n && log.info(`Recuperación al arrancar: ${n} cobros en Pagando`))
        .catch((e) => log.warn('Falló la recuperación al arrancar', { error: e })),
    )
    // HU-27: las ventas que quedaron por enviar a facturación
    waitUntil(
      contenedor.facturacion
        .recuperarAlArrancar()
        .then((n) => n && log.info(`Recuperación al arrancar: ${n} ventas por enviar a facturación`))
        .catch((e) => log.warn('Falló el reenvío de ventas al arrancar', { error: e })),
    )
    return crearApp(contenedor)
  })().catch((e) => {
    listo = undefined
    throw e
  })
  return listo
}

export default async function manejar(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await preparar()
    app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1])
  } catch (e) {
    log.error('La API no pudo arrancar', { error: e })
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: { codigo: 'NoDisponible', mensaje: 'La API no pudo conectarse a la base de datos' } }))
  }
}

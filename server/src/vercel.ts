// Entrada de la API en Vercel: una función que sirve todo /api con la misma app de Express que
// main.ts. No hay proceso prendido, así que lo que main.ts hace al arrancar (abrir la base, en
// Supabase con el esquema ya cargado) se hace en el primer pedido de cada instancia, y la
// renovación del token del permiso (HU-06) se dispara con los pedidos en vez de un setInterval.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import { crearApp } from './app.ts'
import { config } from './config.ts'
import { crearContenedor, type Contenedor } from './contenedor.ts'
import { log } from './comun/log.ts'
import { abrirBase, type Base } from './db/conexion.ts'

interface Lista {
  app: ReturnType<typeof crearApp>
  base: Base
  contenedor: Contenedor
}

let listo: Promise<Lista> | undefined
let ultimaRenovacion = 0
let renovando = false

/** Las tareas de segundo plano no pueden colgarse: si Open Payments no responde, se sueltan a los 45 s. */
function conLimite<T>(p: Promise<T>, ms = 45_000): Promise<T> {
  let reloj: NodeJS.Timeout | undefined
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`Sin respuesta en ${ms / 1000} s`)), ms)
  })
  return Promise.race([p, limite]).finally(() => clearTimeout(reloj))
}

function preparar(): Promise<Lista> {
  listo ??= (async () => {
    if (!config.DATABASE_URL) {
      throw new Error('En Vercel DATABASE_URL tiene que ser una URL de PostgreSQL (Supabase)')
    }
    const base = await abrirBase({ url: config.DATABASE_URL })
    log.info(`Base de datos: ${base.tipo}`)
    const contenedor = crearContenedor({ db: base.db, config, candado: base.conCandado })
    // RNF-05: una sola pasada para retomar los cobros en Pagando; corre en segundo plano porque
    // puede esperar pagos en curso (no worker, pero tampoco se colgará el primer pedido).
    waitUntil(
      contenedor.cobros
        .recuperarAlArrancar()
        .then((n) => n && log.info(`Recuperación al arrancar: ${n} cobros en Pagando`))
        .catch((e) => log.warn('Falló la recuperación al arrancar', { error: e })),
    )
    return { app: crearApp(contenedor), base, contenedor }
  })().catch((e) => {
    listo = undefined
    throw e
  })
  return listo
}

/**
 * HU-06: el token del permiso vence a los 10 minutos. Si pasaron TOKEN_RENOVAR_CADA_SEG desde la
 * última vuelta de esta instancia, se rota en segundo plano. Los candados de la base (dentro de la
 * renovación y de la rotación) evitan que dos instancias roten el mismo token a la vez.
 */
function renovarSiToca({ contenedor }: Lista): void {
  const ahora = Date.now()
  if (renovando || ahora - ultimaRenovacion < config.TOKEN_RENOVAR_CADA_SEG * 1000) return
  ultimaRenovacion = ahora
  renovando = true
  waitUntil(
    conLimite(contenedor.renovacion.renovarTodos())
      .then((r) => r && r.renovados + r.vencidos + r.fallidos && log.info('Renovación de tokens', { ...r }))
      .catch((e) => log.warn('Falló la renovación de tokens', { error: e }))
      .finally(() => {
        renovando = false
      }),
  )
}

export default async function manejar(req: IncomingMessage, res: ServerResponse) {
  let lista: Lista
  try {
    lista = await preparar()
  } catch (e) {
    log.error('La API no pudo arrancar', { error: e })
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: { codigo: 'NoDisponible', mensaje: 'La API no pudo conectarse a la base de datos' } }))
    return
  }
  renovarSiToca(lista)
  lista.app(req as Parameters<typeof lista.app>[0], res as Parameters<typeof lista.app>[1])
}

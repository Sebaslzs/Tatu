// GET /estado · ¿pagos reales o simulados? Siempre 200; `faltan` dice qué impide pagar de verdad.
import { Router } from 'express'
import type { Config } from './config.ts'

export interface EstadoApi {
  pagosReales: boolean
  faltan: string[]
  openPayments: { billeteraCliente: string | null; llave: string | null }
  programasConTokenFalso: number
  verificacionCuenta: Config['VERIFICACION_CUENTA']
  baseDeDatos: { tipo: 'postgres' | 'pglite'; donde: string }
  puenteBreB: { simulado: boolean; responde: boolean }
}

/** Servidor y base de datos, nunca el usuario ni la contraseña. */
export function dondeEstaLaBd(url: string | undefined): string {
  if (!url) return 'local (PGlite)'
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`
  } catch {
    return 'url no válida'
  }
}

export function calcularEstado(config: Config): EstadoApi {
  const tieneLlave = Boolean(config.OP_PRIVATE_KEY_PATH || config.OP_PRIVATE_KEY_BASE64)
  const faltan = [
    ...(config.OP_CLIENT_WALLET_ADDRESS ? [] : ['OP_CLIENT_WALLET_ADDRESS']),
    ...(config.OP_KEY_ID ? [] : ['OP_KEY_ID']),
    ...(tieneLlave ? [] : ['OP_PRIVATE_KEY_PATH u OP_PRIVATE_KEY_BASE64']),
  ]
  const propia = config.PUENTE_URL.startsWith(config.API_BASE_URL)
  return {
    pagosReales: faltan.length === 0,
    faltan,
    openPayments: { billeteraCliente: config.OP_CLIENT_WALLET_ADDRESS ?? null, llave: config.OP_KEY_ID ?? null },
    programasConTokenFalso: 0,
    verificacionCuenta: config.VERIFICACION_CUENTA,
    baseDeDatos: { tipo: config.DATABASE_URL ? 'postgres' : 'pglite', donde: dondeEstaLaBd(config.DATABASE_URL) },
    puenteBreB: { simulado: propia, responde: true },
  }
}

export function rutasEstado(config: Config): Router {
  const r = Router()
  r.get('/estado', (_req, res) => {
    res.json(calcularEstado(config))
  })
  return r
}

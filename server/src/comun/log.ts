// Registro que nunca imprime secretos (RNF-09): toda clave que parezca un token, un nonce, un PIN o
// una llave se reemplaza por «[oculto]», a cualquier profundidad. De los errores solo se imprimen
// nombre, mensaje, status, code y description.

const CLAVES_SECRETAS = /token|nonce|pin|llave|key|secret|password|authorization|signature|hash|interact_ref/i

function limpiar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 5) return '[…]'
  if (valor instanceof Error) {
    const e = valor as Error & { status?: unknown; code?: unknown; description?: unknown }
    return { nombre: e.name, mensaje: e.message, status: e.status, code: e.code, description: e.description }
  }
  if (Array.isArray(valor)) return valor.map((v) => limpiar(v, profundidad + 1))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, CLAVES_SECRETAS.test(k) ? '[oculto]' : limpiar(v, profundidad + 1)]),
    )
  }
  return valor
}

type Nivel = 'info' | 'warn' | 'error'

function escribir(nivel: Nivel, mensaje: string, datos?: Record<string, unknown>) {
  // En las pruebas solo se ven las advertencias y los errores
  if (process.env.VITEST && nivel !== 'error') return
  const linea = `[${new Date().toISOString()}] ${nivel.toUpperCase()} ${mensaje}`
  const salida = nivel === 'error' ? console.error : nivel === 'warn' ? console.warn : console.log
  if (datos) salida(linea, JSON.stringify(limpiar(datos)))
  else salida(linea)
}

export const log = {
  info: (mensaje: string, datos?: Record<string, unknown>) => escribir('info', mensaje, datos),
  warn: (mensaje: string, datos?: Record<string, unknown>) => escribir('warn', mensaje, datos),
  error: (mensaje: string, datos?: Record<string, unknown>) => escribir('error', mensaje, datos),
}

/** «900000003» → «*****0003»: la cédula que puede ir en un evento. */
export function enmascararDocumento(documento: string): string {
  return documento.length <= 4 ? '****' : `${'*'.repeat(documento.length - 4)}${documento.slice(-4)}`
}

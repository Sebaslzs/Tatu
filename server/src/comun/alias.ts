// La web ya conectada manda `cedula`; Endpoints.md usa `documento`. Las rutas aceptan los dos nombres.

/** Devuelve el pedido con `documento` si llegó como `cedula`; si llegan los dos, manda `documento`. */
export function conAliasCedula(pedido: unknown): unknown {
  if (typeof pedido !== 'object' || pedido === null || Array.isArray(pedido)) return pedido
  const { cedula, ...resto } = pedido as Record<string, unknown>
  if (cedula === undefined) return pedido
  return { documento: cedula, ...resto }
}

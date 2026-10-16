// Errores de la base que el dominio sabe interpretar, sin depender del cliente de Postgres.

interface ErrorConCodigo {
  code?: unknown
  cause?: ErrorConCodigo
}

/** SQLSTATE 23505: ya existe una fila con esa llave única (p. ej. dos registros a la vez). */
export function esViolacionUnica(e: unknown): boolean {
  // Drizzle envuelve el error original en `cause`
  for (let actual = e as ErrorConCodigo | undefined; actual; actual = actual.cause) {
    if (actual.code === '23505') return true
  }
  return false
}

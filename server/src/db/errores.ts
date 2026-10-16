// Errores de la base que el dominio sabe interpretar, sin depender del cliente de Postgres.

interface ErrorConCodigo {
  code?: unknown
  message?: unknown
  cause?: ErrorConCodigo
}

/** Recorre el error y sus causas: Drizzle envuelve el error original en `cause`. */
function* cadena(e: unknown): Generator<ErrorConCodigo> {
  for (let actual = e as ErrorConCodigo | undefined; actual; actual = actual.cause) yield actual
}

/** SQLSTATE 23505: ya existe una fila con esa llave única (p. ej. dos registros a la vez). */
export function esViolacionUnica(e: unknown): boolean {
  for (const actual of cadena(e)) if (actual.code === '23505') return true
  return false
}

/**
 * El mensaje de una regla que la base hace cumplir con un trigger (`RAISE EXCEPTION 'RN-06: …'`);
 * null si el error no es de una regla.
 */
export function mensajeDeRegla(e: unknown): string | null {
  for (const actual of cadena(e)) {
    if (typeof actual.message === 'string' && /^RN-\d{2}/.test(actual.message)) return actual.message
  }
  return null
}

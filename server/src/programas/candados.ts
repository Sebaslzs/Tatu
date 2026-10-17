// Candados de la base (pg_try_advisory_lock) compartidos por todos los servidores que usan la misma
// base: las instancias de Vercel y un servidor local. Si otro tiene el candado, `Candado` devuelve
// undefined sin esperar.

export type Candado = <T>(clave: number, fn: () => Promise<T>) => Promise<T | undefined>

/** Sin base compartida (pruebas, PGlite): corre directo. */
export const sinCandado: Candado = (_clave, fn) => fn()

/** Una vuelta de renovación a la vez, entre todos los servidores. */
export const CANDADO_RENOVACION = 720_035
/** Una rotación de token a la vez, entre todos los servidores (la renovación y la rotación a demanda). */
export const CANDADO_ROTACION = 720_036

// Escenarios de prueba reutilizables: el programa de la demo ya Activo, con sus personas, cuentas y
// puntos. Así cada test arranca de una situación conocida en lugar de repetir 20 líneas de preparación.
import { COP } from './billeterasFalsas.ts'
import type { Entorno } from './entorno.ts'

export const BILLETERA_PROGRAMA = 'https://ilp.interledger-test.dev/tatu-programa'
export const BILLETERA_PUNTO = 'https://ilp.interledger-test.dev/tatu-punto1'
export const BILLETERA_PUNTO_2 = 'https://ilp.interledger-test.dev/tatu-punto2'
export const BILLETERA_ANA = 'https://ilp.interledger-test.dev/prueba-ana'
export const BILLETERA_LUIS = 'https://ilp.interledger-test.dev/prueba-luis'

/** Las personas de la liquidación de prueba: cada una con $230.000 y su PIN. */
export const ANA = { cedula: '1000000001', pin: '1111' }
export const LUIS = { cedula: '1000000002', pin: '2222' }
export const JORGE = { cedula: '1000000003', pin: '3333' }

export interface Escenario {
  programaId: string
  puntoId: string
  punto2Id: string
}

/** Crea un programa, lo autoriza y completa el callback del banco: queda Activo. Devuelve su id. */
export async function activarPrograma(e: Entorno, nombre: string, billetera = BILLETERA_PROGRAMA): Promise<string> {
  const entidad = await e.crearEntidad()
  const id = (
    await e.pedir('POST', '/programas', { entidadId: entidad.id, nombre, billetera, vigenciaInicio: '2026-10-01', vigenciaFin: '2026-12-31' })
  ).cuerpo.id as string
  await e.pedir('POST', `/programas/${id}/autorizar`)
  const q = new URLSearchParams({ interact_ref: 'ref-1', hash: await e.hashValido(id, 'ref-1') })
  await e.pedir('GET', `/callback/${id}?${q}`)
  return id
}

/**
 * Deja listo: las billeteras, el programa de transporte ya Activo (tope $690.000), dos puntos de
 * retiro y a Ana y a Luis registrados con su cuenta Verificada. Jorge no tiene cuenta (cobra en punto).
 */
export async function escenarioDeCobro(e: Entorno): Promise<Escenario> {
  for (const w of [BILLETERA_PROGRAMA, BILLETERA_PUNTO, BILLETERA_PUNTO_2, BILLETERA_ANA, BILLETERA_LUIS]) e.billeteras.registrar(w, COP)

  const programaId = await activarPrograma(e, 'Subsidio de transporte')
  // El banco ya fijó el tope que se aprobó (RN-08)
  e.pagos.tope = 69_000_000

  const puntoId = (await e.pedir('POST', '/puntos', { nombre: 'Tienda Marta', billetera: BILLETERA_PUNTO })).cuerpo.id as string
  const punto2Id = (await e.pedir('POST', '/puntos', { nombre: 'Droguería El Centro', billetera: BILLETERA_PUNTO_2 })).cuerpo.id as string

  await e.pedir('POST', '/beneficiarios', { cedula: ANA.cedula, billetera: BILLETERA_ANA, nombre: 'Ana Pérez', pin: ANA.pin })
  await e.pedir('POST', '/beneficiarios', { cedula: LUIS.cedula, billetera: BILLETERA_LUIS, nombre: 'Luis Gómez', pin: LUIS.pin })
  // Jorge: sin cuenta ni llave; solo cobra en un punto
  await e.repos.beneficiarios.crear(JORGE.cedula)
  return { programaId, puntoId, punto2Id }
}

let consecutivo = 0
/** Una llave de idempotencia nueva por intento, como haría la web. */
export const llaveNueva = (): string => `llave-de-prueba-${++consecutivo}-${Date.now()}`

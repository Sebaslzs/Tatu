// La liquidación y el banco puente simulados guardados en la base: lo inscrito sigue ahí aunque la API
// se reinicie (otra conexión a la misma base) o lo atienda otra instancia.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { abrirBase, type Base } from '../db/conexion.ts'
import { LiquidacionEnBase } from '../liquidacion/enBase.ts'
import { PuenteEnBase } from '../puente/enBase.ts'

const carpeta = mkdtempSync(join(tmpdir(), 'tatu-simulacion-'))
const abiertas: Base[] = []

async function abrir(): Promise<Base> {
  const base = await abrirBase({ carpetaPglite: carpeta })
  abiertas.push(base)
  return base
}

afterAll(async () => {
  for (const b of abiertas) await b.cerrar().catch(() => undefined)
  rmSync(carpeta, { recursive: true, force: true })
})

const WALLET = 'https://ilp.interledger-test.dev/rosa'

describe('liquidación simulada en la base', () => {
  it('empieza vacía: nadie que no se haya registrado entra en el total', async () => {
    const base = await abrir()
    expect(await new LiquidacionEnBase(base.db).resumen('programa')).toEqual({ cedulas: 0, total: '0' })
  })

  it('lo inscrito sobrevive a cerrar y abrir la base, con nombre y PIN', async () => {
    const primera = abiertas[0]!
    const liquidacion = new LiquidacionEnBase(primera.db)
    expect(await liquidacion.inscribir('1035915448', 'Rosa Díaz', '4321')).toEqual({ documento: '1035915448', nombre: 'Rosa Díaz', tienePin: true })
    await primera.cerrar()
    abiertas.shift()

    const otra = new LiquidacionEnBase((await abrir()).db)
    expect(await otra.buscar(['1035915448', '1000000077'])).toEqual([{ documento: '1035915448', nombre: 'Rosa Díaz', tienePin: true }])
    expect(await otra.validarPin('1035915448', '4321')).toBe(true)
    expect(await otra.validarPin('1035915448', '0000')).toBe(false)
    expect(await otra.resumen('programa')).toEqual({ cedulas: 1, total: '23000000' })
  })

  it('usa el monto por persona del programa cuando lo tiene', async () => {
    const liquidacion = new LiquidacionEnBase(abiertas[0]!.db)
    liquidacion.montoPorPrograma = async (id) => (id === 'con-monto' ? 6_000_000 : null)
    expect(await liquidacion.resumen('con-monto')).toEqual({ cedulas: 1, total: '6000000' })
    expect(await liquidacion.pago('con-monto', '1035915448')).toEqual({ documento: '1035915448', disponible: true, monto: '6000000', novedad: false })
    expect(await liquidacion.pago('con-monto', '1000000077')).toBeUndefined()
  })

  it('volver a inscribir cambia el nombre y conserva el PIN si no llega otro', async () => {
    const liquidacion = new LiquidacionEnBase(abiertas[0]!.db)
    await liquidacion.inscribir('1035915448', 'Rosa María Díaz')
    expect(await liquidacion.buscar(['1035915448'])).toEqual([{ documento: '1035915448', nombre: 'Rosa María Díaz', tienePin: true }])
    expect(await liquidacion.validarPin('1035915448', '4321')).toBe(true)
    expect(await liquidacion.ponerPin('1035915448', '9999')).toBe(true)
    expect(await liquidacion.validarPin('1035915448', '9999')).toBe(true)
    expect(await liquidacion.ponerPin('1000000077', '9999')).toBe(false)
  })
})

describe('banco puente simulado en la base', () => {
  const llave = { tipo: 'cedula' as const, valor: '1035915448', documentoTitular: '1035915448', nombreTitular: 'Rosa Díaz', billetera: WALLET }

  it('registra, actualiza la billetera de su titular y no deja que otro la tome', async () => {
    const puente = new PuenteEnBase(abiertas[0]!.db)
    expect(await puente.registrar(llave)).toBe('creada')
    expect(await puente.registrar({ ...llave, billetera: `${WALLET}-2` })).toBe('actualizada')
    expect(await puente.registrar({ ...llave, documentoTitular: '1000000002' })).toBe('deOtro')
    expect(await new PuenteEnBase(abiertas[0]!.db).obtener('cedula', '1035915448')).toEqual({ ...llave, billetera: `${WALLET}-2` })
    expect(await puente.deTitular('1035915448')).toHaveLength(1)
  })

  it('borra la llave una sola vez', async () => {
    const puente = new PuenteEnBase(abiertas[0]!.db)
    expect(await puente.borrar('cedula', '1035915448')).toBe(true)
    expect(await puente.borrar('cedula', '1035915448')).toBe(false)
    expect(await puente.obtener('cedula', '1035915448')).toBeUndefined()
  })
})

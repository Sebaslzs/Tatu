// HU-06 · Renovación del token del permiso: se rota antes de que venza (10 min en la Test Wallet).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { activarPrograma, BILLETERA_PROGRAMA } from '../pruebas/escenario.ts'

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(BILLETERA_PROGRAMA, COP)
})

const programa = async (id: string) => (await e.repos.programas.obtener(id))!

describe('renovarTodos', () => {
  it('rota el token de cada programa Activo y lo guarda; el permiso sigue vigente', async () => {
    const id = await activarPrograma(e, 'Subsidio de transporte')
    const antes = (await programa(id)).tokenAcceso

    const r = await e.contenedor.renovacion.renovarTodos()

    expect(r).toEqual({ renovados: 1, vencidos: 0, fallidos: 0 })
    expect(e.permisos.rotaciones).toBe(1)
    const despues = await programa(id)
    expect(despues.tokenAcceso).not.toBe(antes)
    expect(despues.permisoVencidoEn).toBeNull()
  })

  it('no toca programas sin permiso (Borrador) ni con el permiso ya vencido', async () => {
    const id = await activarPrograma(e, 'Subsidio de transporte')
    await e.repos.programas.actualizar(id, { permisoVencidoEn: e.ahora.toISOString() }, 'Activo')

    expect(await e.contenedor.renovacion.renovarTodos()).toEqual({ renovados: 0, vencidos: 0, fallidos: 0 })
    expect(e.permisos.rotaciones).toBe(0)
  })

  it('si el banco ya no acepta la rotación (4xx), el programa queda con el permiso vencido', async () => {
    const id = await activarPrograma(e, 'Subsidio de transporte')
    e.permisos.errorAlRotar = new ErrorOpenPayments('ErrorOpenPayments', 401)

    expect(await e.contenedor.renovacion.renovarTodos()).toEqual({ renovados: 0, vencidos: 1, fallidos: 0 })
    expect((await programa(id)).permisoVencidoEn).not.toBeNull()
  })

  it('si el banco no responde, no lo da por vencido: se reintenta en la próxima vuelta', async () => {
    const id = await activarPrograma(e, 'Subsidio de transporte')
    e.permisos.errorAlRotar = new ErrorOpenPayments('SinRespuesta')

    expect(await e.contenedor.renovacion.renovarTodos()).toEqual({ renovados: 0, vencidos: 0, fallidos: 1 })
    expect((await programa(id)).permisoVencidoEn).toBeNull()
  })
})

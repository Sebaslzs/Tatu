// Endpoints.md: GET /estado · pagos reales o simulados, sin exponer secretos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearEntorno, type Entorno } from './pruebas/entorno.ts'
import { dondeEstaLaBd } from './estado.ts'

let e: Entorno
beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())

describe('GET /estado', () => {
  it('responde 200 con el modo de pago, la base y el puente', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/estado')
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({
      pagosReales: expect.any(Boolean),
      faltan: expect.any(Array),
      programasConTokenFalso: 0,
      baseDeDatos: { tipo: expect.stringMatching(/^(postgres|pglite)$/) },
      puenteBreB: { simulado: expect.any(Boolean), responde: true },
    })
  })

  it('nunca incluye la llave privada ni la contraseña de la base', async () => {
    const texto = JSON.stringify((await e.pedir('GET', '/estado')).cuerpo)
    expect(texto).not.toMatch(/PRIVATE KEY|password|postgres:\/\//i)
  })
})

describe('dondeEstaLaBd', () => {
  it('muestra servidor y base, sin usuario ni contraseña', () => {
    expect(dondeEstaLaBd('postgresql://usuario:secreto@db.ejemplo.co:5432/postgres')).toBe('db.ejemplo.co/postgres')
    expect(dondeEstaLaBd(undefined)).toBe('local (PGlite)')
  })
})

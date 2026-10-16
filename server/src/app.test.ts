import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearApp } from './app.ts'
import { abrirBase, type Base } from './db/conexion.ts'

let base: Base
let servidor: ReturnType<ReturnType<typeof crearApp>['listen']>
let url: string

beforeAll(async () => {
  base = await abrirBase({ enMemoria: true })
  servidor = crearApp().listen(0)
  await new Promise((r) => servidor.once('listening', r))
  url = `http://localhost:${(servidor.address() as AddressInfo).port}/api`
})

afterAll(async () => {
  servidor.close()
  await base.cerrar()
})

describe('esqueleto de la API', () => {
  it('la base PGlite en memoria abre y migra', () => {
    expect(base.tipo).toBe('pglite')
  })

  it('GET /api/salud responde', async () => {
    const res = await fetch(`${url}/salud`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ estado: 'ok' })
  })

  it('GET /api/config expone las banderas EXTRA_*', async () => {
    const res = await fetch(`${url}/config`)
    const cuerpo = (await res.json()) as { extras: Record<string, boolean> }
    expect(cuerpo.extras).toHaveProperty('bono')
  })

  it('las rutas del mapa existen y responden 501 mientras no tengan lógica', async () => {
    const res = await fetch(`${url}/cobros`, { method: 'POST' })
    expect(res.status).toBe(501)
  })
})

// Registro del equipo de prueba: la cédula y la billetera de cada persona (lo guardado, lo inscrito
// en la liquidación y, si cobra con su cédula, la llave Bre-B).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'

const WALLET = 'https://ilp.interledger-test.dev/prueba-rosa'
const CEDULA = '1000000010'

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  e.billeteras.registrar(WALLET, COP)
})

const registrar = (extra: Record<string, unknown> = {}) =>
  e.pedir('POST', '/beneficiarios', { documento: CEDULA, billetera: '$ilp.interledger-test.dev/prueba-rosa', nombre: 'Rosa Díaz', pin: '4444', ...extra })

describe('POST /beneficiarios', () => {
  it('registra la cédula con su cuenta Verificada y la inscribe en la liquidación', async () => {
    const { status, cuerpo } = await registrar()
    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ documento: CEDULA, nombre: 'Rosa Díaz', billetera: WALLET, moneda: { assetCode: 'COP', assetScale: 2 }, estadoCuenta: 'Verificada', tienePin: true })
    expect(e.simulador.buscar([CEDULA])).toEqual([{ documento: CEDULA, nombre: 'Rosa Díaz', tienePin: true }])
    expect(e.simulador.validarPin(CEDULA, '4444')).toBe(true)
  })

  it('Tatú guarda solo la cédula y la cuenta: ni el nombre ni el PIN', async () => {
    await registrar()
    const persona = await e.repos.beneficiarios.porCedula(CEDULA)
    expect(JSON.stringify(persona)).not.toMatch(/Rosa|4444/)
    const cuenta = await e.repos.cuentas.vigenteDe(persona!.id)
    expect(cuenta).toMatchObject({ estado: 'Verificada', billetera: WALLET })
    expect(JSON.stringify(await e.repos.eventos.de('cuenta', cuenta!.id))).not.toMatch(/Rosa|4444/)
  })

  it('sin nombre usa «Persona 0010»; sin PIN, no tiene PIN', async () => {
    const { cuerpo } = await registrar({ nombre: undefined, pin: undefined })
    expect(cuerpo).toMatchObject({ nombre: 'Persona 0010', tienePin: false })
  })

  it('con cobraCon=llaveCedula registra la llave Bre-B y no enlaza cuenta', async () => {
    const { cuerpo } = await registrar({ cobraCon: 'llaveCedula' })
    expect(cuerpo).toMatchObject({ billetera: null, estadoCuenta: null })
    expect(e.puente.obtener('cedula', CEDULA)).toMatchObject({ billetera: WALLET, documentoTitular: CEDULA, nombreTitular: 'Rosa Díaz' })
    expect(await e.contar('cuenta_beneficiario')).toBe(0)
  })

  it('una cédula repetida: 409 PersonaExiste', async () => {
    await registrar()
    const r = await registrar({ billetera: '$ilp.interledger-test.dev/otra' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.error.codigo).toBe('PersonaExiste')
  })

  it('quien quedó a medias (en Tatú pero no en la liquidación) se completa al registrarla otra vez', async () => {
    await registrar()
    e.simulador.reiniciar()
    expect(e.simulador.buscar([CEDULA])).toEqual([])

    const r = await registrar({ nombre: 'Rosa M. Díaz', pin: '5151' })
    expect(r.status).toBe(201)
    expect(r.cuerpo).toMatchObject({ documento: CEDULA, nombre: 'Rosa M. Díaz', billetera: WALLET, estadoCuenta: 'Verificada', tienePin: true })
    expect(e.simulador.validarPin(CEDULA, '5151')).toBe(true)
    expect(await e.contar('beneficiario')).toBe(1)
    expect(await e.contar('cuenta_beneficiario')).toBe(1)
    expect((await registrar()).status).toBe(409)
  })

  it('al completarla con llave Bre-B registra la llave y conserva su cuenta', async () => {
    await registrar()
    e.simulador.reiniciar()
    const r = await registrar({ cobraCon: 'llaveCedula' })
    expect(r.status).toBe(201)
    expect(e.puente.obtener('cedula', CEDULA)).toMatchObject({ billetera: WALLET, documentoTitular: CEDULA })
    expect(await e.contar('cuenta_beneficiario')).toBe(1)
  })

  it('una billetera ya usada por otra persona: 409 BilleteraEnUso con su nombre', async () => {
    await registrar()
    const r = await registrar({ documento: '1000000011', nombre: 'Otra' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toMatchObject({ codigo: 'BilleteraEnUso', mensaje: 'Esa billetera ya está registrada para Rosa Díaz' })
  })

  it('una billetera que no existe: 404; la cédula con formato inválido: 400', async () => {
    expect((await registrar({ billetera: '$ilp.interledger-test.dev/no-existe' })).status).toBe(404)
    expect((await registrar({ documento: '12-ab' })).status).toBe(400)
    expect(await e.contar('beneficiario')).toBe(0)
  })

  it('si la liquidación no responde: 503 y no se guarda nada', async () => {
    const sin = await crearEntorno({ entorno: { LIQUIDACION_URL: 'http://127.0.0.1:9/api/liquidacion', LIQUIDACION_TIMEOUT_MS: '500' } })
    try {
      sin.billeteras.registrar(WALLET, COP)
      const r = await sin.pedir('POST', '/beneficiarios', { documento: CEDULA, billetera: WALLET })
      expect(r.status).toBe(503)
      expect(await sin.contar('beneficiario')).toBe(0)
    } finally {
      await sin.cerrar()
    }
  })

  it('dos registros de la misma cédula a la vez dejan una sola persona', async () => {
    const [a, b] = await Promise.all([registrar(), registrar()])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    expect(await e.contar('beneficiario')).toBe(1)
  })
})

describe('GET /beneficiarios y PIN', () => {
  it('sin personas el listado y el demo están vacíos', async () => {
    expect((await e.pedir('GET', '/beneficiarios')).cuerpo).toEqual([])
    expect((await e.pedir('GET', '/beneficiarios/demo')).cuerpo).toEqual([])
  })

  it('lista a las personas registradas con su cuenta y su moneda', async () => {
    await registrar()
    const { cuerpo } = await e.pedir('GET', '/beneficiarios')
    expect(cuerpo).toHaveLength(1)
    expect(cuerpo[0]).toMatchObject({ documento: CEDULA, nombre: 'Rosa Díaz', estadoCuenta: 'Verificada', moneda: { assetCode: 'COP', assetScale: 2 }, billeteraCorta: '…/prueba-rosa' })
    const demo = (await e.pedir('GET', '/beneficiarios/demo')).cuerpo
    expect(demo).toEqual([{ nombre: 'Rosa Díaz', etiqueta: 'C.C. de prueba 10', documento: CEDULA }])
  })

  it('si la liquidación no responde, la lista sigue con «Persona 0010»', async () => {
    await registrar()
    const sin = await crearEntorno({ entorno: { LIQUIDACION_URL: 'http://127.0.0.1:9/api/liquidacion', LIQUIDACION_TIMEOUT_MS: '500' } })
    try {
      await sin.repos.beneficiarios.crear(CEDULA)
      const { status, cuerpo } = await sin.pedir('GET', '/beneficiarios')
      expect(status).toBe(200)
      expect(cuerpo[0].nombre).toBe('Persona 0010')
    } finally {
      await sin.cerrar()
    }
  })

  it('pone el PIN de alguien ya registrado', async () => {
    await registrar({ pin: undefined })
    const { status, cuerpo } = await e.pedir('POST', `/beneficiarios/${CEDULA}/pin`, { pin: '5555' })
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ documento: CEDULA, tienePin: true })
    expect(e.simulador.validarPin(CEDULA, '5555')).toBe(true)
  })

  it('el PIN de una cédula no registrada: 404; un PIN inválido: 400', async () => {
    expect((await e.pedir('POST', '/beneficiarios/1000000077/pin', { pin: '5555' })).status).toBe(404)
    await registrar()
    expect((await e.pedir('POST', `/beneficiarios/${CEDULA}/pin`, { pin: 'abcd' })).status).toBe(400)
  })
})

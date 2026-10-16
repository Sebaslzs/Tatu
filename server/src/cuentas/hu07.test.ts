// HU-07 · Enlazar y verificar mi cuenta (llave Bre-B o billetera). Un bloque por criterio.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { detalleDe } from '../db/repositorios/eventos.ts'
import { COP } from '../pruebas/billeterasFalsas.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'

const LUIS = '1000000002'
const ANA = '1000000001'
const WALLET_LUIS = 'https://ilp.interledger-test.dev/prueba-luis'
const WALLET_LUIS_2 = 'https://ilp.interledger-test.dev/prueba-luis-2'
const WALLET_ANA = 'https://ilp.interledger-test.dev/prueba-ana'
const DIEZ_MINUTOS = 10 * 60_000

let e: Entorno

beforeAll(async () => {
  e = await crearEntorno()
})
afterAll(() => e.cerrar())
beforeEach(async () => {
  await e.limpiar()
  for (const w of [WALLET_LUIS, WALLET_LUIS_2, WALLET_ANA]) e.billeteras.registrar(w, COP)
  await e.repos.beneficiarios.crear(LUIS)
  await e.repos.beneficiarios.crear(ANA)
  // Luis tiene la llave cédula y un celular en su banco; Ana, su celular
  e.puente.registrar({ tipo: 'cedula', valor: LUIS, cedulaTitular: LUIS, nombreTitular: 'Luis Gómez', billetera: WALLET_LUIS })
  e.puente.registrar({ tipo: 'celular', valor: '3001234567', cedulaTitular: LUIS, nombreTitular: 'Luis Gómez', billetera: WALLET_LUIS })
  e.puente.registrar({ tipo: 'celular', valor: '3109998888', cedulaTitular: ANA, nombreTitular: 'Ana Pérez', billetera: WALLET_ANA })
})

const enlazar = (cuerpo: Record<string, unknown>) => e.pedir('POST', '/cuentas', { cedula: LUIS, ...cuerpo })
const llaveCelular = (extra: Record<string, unknown> = {}) => enlazar({ tipoLlave: 'celular', llave: '3001234567', pin: '2222', ...extra })
const cuentas = () => e.contar('cuenta_beneficiario')

describe('CA-07.01 · el tipo de llave lo elige la persona (RN-14)', () => {
  it('busca la llave en el banco puente y muestra el titular enmascarado', async () => {
    const { status, cuerpo } = await e.pedir('GET', '/cuentas/llaves/celular/3001234567')
    expect(status).toBe(200)
    expect(cuerpo).toEqual({ tipoLlave: 'celular', llave: '300***4567', titular: 'Luis G***' })
  })

  it('limpia el valor según el tipo: espacios, +57 y guiones', async () => {
    const { cuerpo } = await e.pedir('GET', `/cuentas/llaves/celular/${encodeURIComponent('+57 300-123 4567')}`)
    expect(cuerpo.llave).toBe('300***4567')
  })

  it('nunca adivina el tipo: un celular con el tipo «correo» es 400 LlaveInvalida', async () => {
    const consulta = await e.pedir('GET', '/cuentas/llaves/correo/3001234567')
    expect(consulta.status).toBe(400)
    expect(consulta.cuerpo.error.codigo).toBe('LlaveInvalida')
    const r = await enlazar({ tipoLlave: 'correo', llave: '3001234567', pin: '2222' })
    expect(r.status).toBe(400)
    expect(r.cuerpo.error.codigo).toBe('LlaveInvalida')
  })

  it('un tipo que no existe es 400 EntradaInvalida', async () => {
    expect((await e.pedir('GET', '/cuentas/llaves/placa/ABC123')).status).toBe(400)
  })

  it('no devuelve la llave completa ni la cédula del titular', async () => {
    const { cuerpo } = await e.pedir('GET', '/cuentas/llaves/celular/3001234567')
    expect(JSON.stringify(cuerpo)).not.toContain('3001234567')
    expect(JSON.stringify(cuerpo)).not.toContain(LUIS)
  })
})

describe('CA-07.02 · llave tipo cédula (RN-15)', () => {
  it('si coincide con mi cédula, queda Verificada sin PIN ni aprobación en el banco', async () => {
    const { status, cuerpo } = await enlazar({ tipoLlave: 'cedula', llave: LUIS })
    expect(status).toBe(201)
    expect(cuerpo.redirect).toBeNull()
    expect(cuerpo.cuenta).toMatchObject({ estado: 'Verificada', tipoLlave: 'cedula', llave: '******0002', billetera: WALLET_LUIS })
    expect(e.permisos.verificacionesPedidas).toHaveLength(0)
  })

  it('si es de otra persona: 422 LlaveDeOtraPersona «Esa llave no está a tu nombre»', async () => {
    const { status, cuerpo } = await enlazar({ tipoLlave: 'cedula', llave: ANA })
    expect(status).toBe(422)
    expect(cuerpo.error).toEqual({ codigo: 'LlaveDeOtraPersona', mensaje: 'Esa llave no está a tu nombre' })
    expect(await cuentas()).toBe(0)
  })
})

describe('CA-07.03 · otra llave: PIN y titular confirmado por el banco puente (RN-16)', () => {
  it('con el PIN correcto y el titular que coincide, queda Verificada', async () => {
    const { status, cuerpo } = await llaveCelular()
    expect(status).toBe(201)
    expect(cuerpo.cuenta).toMatchObject({ estado: 'Verificada', tipoLlave: 'celular', llave: '300***4567' })
  })

  it.each([
    ['sin PIN', { pin: undefined }],
    ['con PIN incorrecto', { pin: '0000' }],
  ])('%s: 422 PinIncorrecto y no se enlaza', async (_caso, cambio) => {
    const { status, cuerpo } = await llaveCelular(cambio)
    expect(status).toBe(422)
    expect(cuerpo.error.codigo).toBe('PinIncorrecto')
    expect(await cuentas()).toBe(0)
  })

  it('si el titular es otra persona: 422 LlaveDeOtraPersona y no se enlaza', async () => {
    const { status, cuerpo } = await enlazar({ tipoLlave: 'celular', llave: '3109998888', pin: '2222' })
    expect(status).toBe(422)
    expect(cuerpo.error.codigo).toBe('LlaveDeOtraPersona')
    expect(await cuentas()).toBe(0)
  })

  it('quien no tiene PIN registrado no necesita PIN', async () => {
    await e.simulador.inscribir('1000000009', 'Rosa Díaz')
    await e.repos.beneficiarios.crear('1000000009')
    e.puente.registrar({ tipo: 'celular', valor: '3205556666', cedulaTitular: '1000000009', nombreTitular: 'Rosa Díaz', billetera: WALLET_ANA })
    const { status } = await e.pedir('POST', '/cuentas', { cedula: '1000000009', tipoLlave: 'celular', llave: '3205556666' })
    expect(status).toBe(201)
  })

  it('un PIN con formato inválido es 400', async () => {
    expect((await llaveCelular({ pin: '12' })).status).toBe(400)
  })
})

describe('CA-07.04 · llave inexistente', () => {
  it('«No encontramos esa llave en Bre-B» (404 LlaveNoExiste), al consultar y al enlazar', async () => {
    const consulta = await e.pedir('GET', '/cuentas/llaves/celular/3201112233')
    const r = await enlazar({ tipoLlave: 'celular', llave: '3201112233', pin: '2222' })
    for (const respuesta of [consulta, r]) {
      expect(respuesta.status).toBe(404)
      expect(respuesta.cuerpo.error).toEqual({ codigo: 'LlaveNoExiste', mensaje: 'No encontramos esa llave en Bre-B' })
    }
  })

  it('si el banco puente no responde: 503 PuenteNoResponde', async () => {
    const sinPuente = await crearEntorno({ entorno: { PUENTE_URL: 'http://127.0.0.1:9/api/puente', PUENTE_TIMEOUT_MS: '500' } })
    try {
      const r = await sinPuente.pedir('GET', '/cuentas/llaves/celular/3001234567')
      expect(r.status).toBe(503)
      expect(r.cuerpo.error.codigo).toBe('PuenteNoResponde')
    } finally {
      await sinPuente.cerrar()
    }
  })

  it('una cédula no registrada en Tatú: 404 PersonaNoEncontrada', async () => {
    const r = await e.pedir('POST', '/cuentas', { cedula: '1000000077', tipoLlave: 'cedula', llave: '1000000077' })
    expect(r.status).toBe(404)
    expect(r.cuerpo.error.codigo).toBe('PersonaNoEncontrada')
  })
})

describe('CA-07.05 · billetera Open Payments (opción avanzada)', () => {
  const porBilletera = (extra: Record<string, unknown> = {}) => enlazar({ billetera: '$ilp.interledger-test.dev/prueba-luis', pin: '2222', ...extra })

  it('con VERIFICACION_CUENTA=subject queda PorVerificar y devuelve el enlace de aprobación', async () => {
    const { status, cuerpo } = await porBilletera()
    expect(status).toBe(201)
    expect(cuerpo.redirect).toBe('https://auth.interledger-test.dev/interact/1')
    expect(cuerpo.cuenta).toMatchObject({ estado: 'PorVerificar', billetera: WALLET_LUIS, tipoLlave: null, llave: null })
    expect(e.permisos.verificacionesPedidas[0]).toEqual({ billetera: WALLET_LUIS, urlRetorno: `${e.config.API_BASE_URL}/cuentas/callback/${cuerpo.cuenta.id}` })
  })

  it('con el callback de hash válido queda Verificada y borra los temporales', async () => {
    const { cuenta } = (await porBilletera()).cuerpo
    const r = await e.pedir('GET', `/cuentas/callback/${cuenta.id}?${new URLSearchParams({ interact_ref: 'r1', hash: await e.hashCuenta(cuenta.id, 'r1') })}`)
    expect(r.status).toBe(302)
    expect(r.ubicacion).toBe(`${e.config.APP_BASE_URL}/beneficiario/cuenta?resultado=verificada`)
    const fila = (await e.repos.cuentas.obtener(cuenta.id))!
    expect(fila.estado).toBe('Verificada')
    expect([fila.nonceCliente, fila.nonceCierre, fila.uriContinuacion, fila.tokenContinuacion]).toEqual([null, null, null, null])
    expect((await e.pedir('GET', `/cuentas/${LUIS}`)).cuerpo.estado).toBe('Verificada')
  })

  it('un callback repetido sobre una cuenta Verificada sigue siendo «verificada»', async () => {
    const { cuenta } = (await porBilletera()).cuerpo
    const q = new URLSearchParams({ interact_ref: 'r1', hash: await e.hashCuenta(cuenta.id, 'r1') })
    await e.pedir('GET', `/cuentas/callback/${cuenta.id}?${q}`)
    expect((await e.pedir('GET', `/cuentas/callback/${cuenta.id}?${q}`)).ubicacion).toMatch(/resultado=verificada$/)
  })

  it('con un hash inválido sigue PorVerificar y queda un evento', async () => {
    const { cuenta } = (await porBilletera()).cuerpo
    const r = await e.pedir('GET', `/cuentas/callback/${cuenta.id}?interact_ref=r1&hash=alterado`)
    expect(r.ubicacion).toMatch(/resultado=invalido$/)
    expect((await e.repos.cuentas.obtener(cuenta.id))!.estado).toBe('PorVerificar')
    expect(detalleDe((await e.repos.eventos.de('cuenta', cuenta.id)).at(-1)!).texto).toMatch(/hash inválido/)
  })

  it.each([['grant_rejected'], ['grant_invalid']])('result=%s la devuelve a SinEnlazar', async (result) => {
    const { cuenta } = (await porBilletera()).cuerpo
    const r = await e.pedir('GET', `/cuentas/callback/${cuenta.id}?result=${result}`)
    expect(r.ubicacion).toMatch(/resultado=rechazada$/)
    expect((await e.repos.cuentas.obtener(cuenta.id))!.estado).toBe('SinEnlazar')
  })

  it('si el banco dice que la cuenta no es de la persona, vuelve a SinEnlazar', async () => {
    const { cuenta } = (await porBilletera()).cuerpo
    e.permisos.cuentaEsDeLaPersona = false
    const r = await e.pedir('GET', `/cuentas/callback/${cuenta.id}?${new URLSearchParams({ interact_ref: 'r1', hash: await e.hashCuenta(cuenta.id, 'r1') })}`)
    expect(r.ubicacion).toMatch(/resultado=rechazada$/)
    expect((await e.repos.cuentas.obtener(cuenta.id))!.estado).toBe('SinEnlazar')
  })

  it('pasados 10 minutos sin respuesta, vuelve a SinEnlazar', async () => {
    const { cuenta } = (await porBilletera()).cuerpo
    e.avanzarReloj(DIEZ_MINUTOS + 1)
    expect((await e.pedir('GET', `/cuentas/${LUIS}`)).cuerpo.estado).toBe('SinEnlazar')
    const eventos = await e.repos.eventos.de('cuenta', cuenta.id)
    expect(eventos.at(-1)).toMatchObject({ estadoAnterior: 'PorVerificar', estadoNuevo: 'SinEnlazar' })
  })

  it('un callback de una cuenta inexistente o con un id que no es UUID redirige como inválido', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000000', 'no-es-uuid']) {
      expect((await e.pedir('GET', `/cuentas/callback/${id}`)).ubicacion).toMatch(/resultado=invalido$/)
    }
  })

  it('con PIN incorrecto: 422 y no crea la cuenta', async () => {
    expect((await porBilletera({ pin: '0000' })).status).toBe(422)
    expect(await cuentas()).toBe(0)
  })

  it('si la billetera no existe: 404 BilleteraNoEncontrada', async () => {
    const r = await porBilletera({ billetera: '$ilp.interledger-test.dev/no-existe' })
    expect(r.status).toBe(404)
    expect(r.cuerpo.error.codigo).toBe('BilleteraNoEncontrada')
  })

  it('si el banco no acepta la verificación: 502 y no queda cuenta', async () => {
    e.permisos.falloAlPedir = true
    const r = await porBilletera()
    expect(r.status).toBe(502)
    expect(await cuentas()).toBe(0)
  })

  it('con VERIFICACION_CUENTA=simulada (plan B) queda Verificada, sin redirect', async () => {
    const simulada = await crearEntorno({ entorno: { VERIFICACION_CUENTA: 'simulada' } })
    try {
      simulada.billeteras.registrar(WALLET_LUIS, COP)
      await simulada.repos.beneficiarios.crear(LUIS)
      const r = await simulada.pedir('POST', '/cuentas', { cedula: LUIS, billetera: '$ilp.interledger-test.dev/prueba-luis', pin: '2222' })
      expect(r.status).toBe(201)
      expect(r.cuerpo).toMatchObject({ redirect: null, cuenta: { estado: 'Verificada' } })
      expect(simulada.permisos.verificacionesPedidas).toHaveLength(0)
    } finally {
      await simulada.cerrar()
    }
  })
})

describe('CA-07.06 · una sola cuenta vigente por persona', () => {
  it('al enlazar otra, la anterior se desenlaza con su evento', async () => {
    const primera = (await enlazar({ tipoLlave: 'cedula', llave: LUIS })).cuerpo.cuenta.id
    const segunda = (await enlazar({ billetera: WALLET_LUIS_2, pin: '2222' })).cuerpo.cuenta.id
    expect((await e.repos.cuentas.obtener(primera))!.estado).toBe('SinEnlazar')
    expect((await e.repos.cuentas.vigenteDe((await e.repos.beneficiarios.porCedula(LUIS))!.id))!.id).toBe(segunda)
    expect((await e.repos.eventos.de('cuenta', primera)).at(-1)).toMatchObject({ estadoAnterior: 'Verificada', estadoNuevo: 'SinEnlazar' })
    expect(await cuentas()).toBe(2)
  })

  it('el estado muestra la vigente, no la histórica', async () => {
    await enlazar({ tipoLlave: 'cedula', llave: LUIS })
    await llaveCelular()
    expect((await e.pedir('GET', `/cuentas/${LUIS}`)).cuerpo).toMatchObject({ estado: 'Verificada', tipoLlave: 'celular' })
  })

  it('quien nunca enlazó una cuenta recibe 404', async () => {
    const r = await e.pedir('GET', `/cuentas/${LUIS}`)
    expect(r.status).toBe(404)
    expect(r.cuerpo.error.codigo).toBe('CuentaNoEncontrada')
  })
})

describe('CA-07.07 · lo mínimo guardado', () => {
  it('nunca guarda el nombre del titular ni tokens de la cuenta', async () => {
    const { cuenta } = (await llaveCelular()).cuerpo
    const fila = (await e.repos.cuentas.obtener(cuenta.id))!
    expect(JSON.stringify(fila)).not.toMatch(/Luis|Gómez/)
    // Una cuenta con llave Bre-B no guarda ninguna credencial: solo tipo de llave, llave y estado
    expect([fila.nonceCliente, fila.nonceCierre, fila.uriContinuacion, fila.tokenContinuacion]).toEqual([null, null, null, null])
    expect(fila).toMatchObject({ tipoLlave: 'celular', llave: '3001234567', estado: 'Verificada' })
    const eventos = JSON.stringify(await e.repos.eventos.de('cuenta', cuenta.id))
    expect(eventos).not.toMatch(/Luis|Gómez/)
    expect(JSON.stringify(cuenta)).not.toMatch(/Luis|Gómez/)
  })

  it('la respuesta no expone los nonces ni la continuación de una verificación pendiente', async () => {
    const { cuerpo } = await enlazar({ billetera: WALLET_LUIS, pin: '2222' })
    expect(JSON.stringify(cuerpo.cuenta)).not.toMatch(/nonce|token|continue/i)
  })
})

describe('RN-17 y RN-18 · la llave cédula y su refresco', () => {
  const persona = async () => (await e.repos.beneficiarios.porCedula(LUIS))!

  it('RN-17: sin cuenta, la cédula que es llave Bre-B se enlaza sola, Verificada', async () => {
    const cuenta = await e.contenedor.cuentas.cuentaPorCedula(await persona())
    expect(cuenta).toMatchObject({ estado: 'Verificada', tipoLlave: 'cedula', llave: LUIS, billetera: WALLET_LUIS })
    expect(detalleDe((await e.repos.eventos.de('cuenta', cuenta!.id)).at(-1)!)).toMatchObject({ automatica: true })
  })

  it('RN-17: si la cédula no es llave Bre-B, no hay cuenta', async () => {
    e.puente.borrar('cedula', LUIS)
    expect(await e.contenedor.cuentas.cuentaPorCedula(await persona())).toBeUndefined()
  })

  it('RN-17: dos «Cobrar» a la vez dejan una sola cuenta', async () => {
    const p = await persona()
    const [a, b] = await Promise.all([e.contenedor.cuentas.cuentaPorCedula(p), e.contenedor.cuentas.cuentaPorCedula(p)])
    expect(a?.id).toBe(b?.id)
    expect(await cuentas()).toBe(1)
  })

  it('RN-18: si la llave llega ahora a otra billetera, se guarda la nueva con su evento', async () => {
    const cuenta = (await e.contenedor.cuentas.cuentaPorCedula(await persona()))!
    e.puente.registrar({ tipo: 'cedula', valor: LUIS, cedulaTitular: LUIS, nombreTitular: 'Luis Gómez', billetera: WALLET_LUIS_2 })
    const nueva = await e.contenedor.cuentas.refrescarLlave(cuenta)
    expect(nueva).toMatchObject({ id: cuenta.id, billetera: WALLET_LUIS_2 })
    expect(detalleDe((await e.repos.eventos.de('cuenta', cuenta.id)).at(-1)!).texto).toMatch(/otra cuenta/)
  })

  it('RN-18: si la llave ya no existe, lo dice sin tocar la cuenta', async () => {
    const cuenta = (await e.contenedor.cuentas.cuentaPorCedula(await persona()))!
    e.puente.borrar('cedula', LUIS)
    expect(await e.contenedor.cuentas.refrescarLlave(cuenta)).toBe('LlaveNoExiste')
    expect((await e.repos.cuentas.obtener(cuenta.id))!.estado).toBe('Verificada')
  })

  it('RN-18: una cuenta de billetera escrita a mano no se refresca', async () => {
    const cuenta = (await e.contenedor.cuentas.cuentaPorCedula(await persona()))!
    expect(await e.contenedor.cuentas.refrescarLlave({ ...cuenta, tipoLlave: null, llave: null })).toMatchObject({ id: cuenta.id })
  })
})

// Un permiso pedido por otro servidor de Tatú (otras llaves de Open Payments) no está vencido: el banco
// responde 401 de firma. No se rota ni se marca el permiso; el cobro queda Fallido con su motivo.
import { OpenPaymentsClientError } from '@interledger/open-payments'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ErrorOpenPayments } from '../comun/openPayments.ts'
import { esErrorDeCliente, traducir } from '../openPaymentsService.ts'
import { crearEntorno, type Entorno } from '../pruebas/entorno.ts'
import { ANA, escenarioDeCobro, llaveNueva, type Escenario } from '../pruebas/escenario.ts'

const FIRMA = 'Signature validation error: could not find key in list of client keys'

describe('clasificación del error de firma', () => {
  const del = (status: number, description: string) => traducir(new OpenPaymentsClientError('x', { status, description }), 'pagoSaliente')

  it('el 401 de firma y el 400 «could not determine client» son LlavesDistintas, no TokenVencido', () => {
    expect(del(401, FIRMA).tipo).toBe('LlavesDistintas')
    expect(del(400, 'could not determine client').tipo).toBe('LlavesDistintas')
  })

  it('un token de verdad vencido sigue siendo TokenVencido', () => {
    expect(del(403, 'Inactive Token').tipo).toBe('TokenVencido')
    expect(del(401, 'Invalid Token').tipo).toBe('TokenVencido')
  })

  it('reconoce las descripciones de cliente desconocido', () => {
    expect(esErrorDeCliente(FIRMA)).toBe(true)
    expect(esErrorDeCliente('Inactive Token')).toBe(false)
    expect(esErrorDeCliente(undefined)).toBe(false)
  })
})

describe('el permiso no se quema por llaves distintas', () => {
  let e: Entorno
  let s: Escenario
  beforeAll(async () => {
    e = await crearEntorno()
  })
  afterAll(() => e.cerrar())
  beforeEach(async () => {
    await e.limpiar()
    s = await escenarioDeCobro(e)
  })

  const vencidoEn = async () => (await e.repos.programas.obtener(s.programaId))!.permisoVencidoEn
  const tokenActual = async () => (await e.repos.programas.obtener(s.programaId))!.tokenAcceso
  const cobrarACuenta = async () => {
    const r = await e.pedir('POST', '/cobros', { documento: ANA.documento, canal: 'cuenta', llaveIdempotencia: llaveNueva() })
    await e.esperarPagos()
    return (await e.pedir('GET', `/cobros/${r.cuerpo.id}`)).cuerpo
  }

  it('al pagar con llaves distintas: Fallido LlavesDistintas, sin rotar ni marcar el permiso', async () => {
    const antes = await tokenActual()
    e.pagos.erroresSaliente.push(new ErrorOpenPayments('LlavesDistintas', 401, '401', FIRMA))
    const c = await cobrarACuenta()
    expect(c).toMatchObject({ estado: 'Fallido', motivo: { codigo: 'LlavesDistintas' } })
    expect(await vencidoEn()).toBeNull()
    expect(await tokenActual()).toBe(antes)
  })

  it('si el token sí venció pero rotar falla por llaves distintas, tampoco se marca', async () => {
    e.pagos.erroresSaliente.push(new ErrorOpenPayments('TokenVencido', 403, '403', 'Inactive Token'))
    e.permisos.errorAlRotar = new ErrorOpenPayments('LlavesDistintas', 400, '400', 'could not determine client')
    const c = await cobrarACuenta()
    expect(c).toMatchObject({ estado: 'Fallido', motivo: { codigo: 'LlavesDistintas' } })
    expect(await vencidoEn()).toBeNull()
  })

  it('la renovación en segundo plano con llaves distintas no marca el permiso', async () => {
    e.permisos.errorAlRotar = new ErrorOpenPayments('LlavesDistintas', 400, '400', 'could not determine client')
    await expect(e.contenedor.token.rotarPermiso(s.programaId)).rejects.toMatchObject({ tipo: 'LlavesDistintas' })
    expect(await vencidoEn()).toBeNull()
  })

  it('un rechazo definitivo de la rotación (otro 4xx) sí marca el permiso vencido, como antes', async () => {
    e.pagos.erroresSaliente.push(new ErrorOpenPayments('TokenVencido', 403, '403', 'Inactive Token'))
    e.permisos.errorAlRotar = new ErrorOpenPayments('ErrorOpenPayments', 400, '400', 'invalid grant')
    const c = await cobrarACuenta()
    expect(c).toMatchObject({ estado: 'Fallido', motivo: { codigo: 'PermisoVencido' } })
    expect(await vencidoEn()).not.toBeNull()
  })
})

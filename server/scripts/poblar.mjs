// Puebla la base con datos de prueba usando SOLO los endpoints de la API en marcha (pnpm start).
// Uso: node server/scripts/poblar.mjs [http://localhost:3000/api]
// Es repetible: lo que ya existe responde 409 y se cuenta como «ya estaba». Imprime una línea por llamada.
const API = process.argv[2] ?? 'http://localhost:3000/api'
const W = {
  jpmv: '$ilp.interledger-test.dev/jpmv',
  sebas: '$ilp.interledger-test.dev/sebas55',
  teoclas: '$ilp.interledger-test.dev/teoclas',
  servidor: '$ilp.interledger-test.dev/s3rv3r',
}
const resumen = { ok: 0, yaEstaba: 0, fallo: 0 }

async function llamar(metodo, ruta, cuerpo) {
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
    redirect: 'manual',
  })
  const texto = await r.text()
  let datos = null
  try { datos = JSON.parse(texto) } catch { /* sin cuerpo */ }
  const marca = r.status < 300 ? 'OK ' : r.status === 409 ? '=  ' : 'ERR'
  if (r.status < 300) resumen.ok++
  else if (r.status === 409) resumen.yaEstaba++
  else resumen.fallo++
  console.log(`${marca} ${r.status} ${metodo.padEnd(6)} ${ruta}${datos?.error ? '  → ' + datos.error.codigo : ''}`)
  return { status: r.status, datos }
}

console.log('== Sistema')
for (const ruta of ['/salud', '/estado', '/config', '/openapi.json', '/entidades']) await llamar('GET', ruta)

console.log('== Liquidación simulada (personas con PIN)')
const PERSONAS = [
  { documento: '1047994481', nombre: 'Juan Pablo Méndez', pin: '4821' },
  { documento: '1035915448', nombre: 'Sebas', pin: '7352' },
  { documento: '1026161053', nombre: 'Fer', pin: '3916' },
  { documento: '1000000011', nombre: 'Marta Ríos', pin: '5127' },
  { documento: '1000000012', nombre: 'Camilo Torres', pin: '6038' },
]
for (const p of PERSONAS) await llamar('POST', '/liquidacion/personas', p)
await llamar('GET', `/liquidacion/personas?documentos=${PERSONAS.map((p) => p.documento).join(',')}`)
await llamar('POST', '/liquidacion/personas/1000000011/pin', { pin: '5128' })
await llamar('POST', '/liquidacion/pin/validar', { documento: '1000000011', pin: '5128' })

console.log('== Puente Bre-B simulado (llaves)')
const LLAVES = [
  { tipo: 'celular', valor: '3001234567', documentoTitular: '1047994481', nombreTitular: 'Juan Pablo Méndez', billetera: 'https://ilp.interledger-test.dev/jpmv' },
  { tipo: 'correo', valor: 'sebas@ejemplo.co', documentoTitular: '1035915448', nombreTitular: 'Sebas', billetera: 'https://ilp.interledger-test.dev/sebas55' },
  { tipo: 'alfanumerica', valor: '@fer', documentoTitular: '1026161053', nombreTitular: 'Fer', billetera: 'https://ilp.interledger-test.dev/teoclas' },
  { tipo: 'celular', valor: '3109876543', documentoTitular: '1000000011', nombreTitular: 'Marta Ríos', billetera: 'https://ilp.interledger-test.dev/s3rv3r' },
  { tipo: 'correo', valor: 'camilo@ejemplo.co', documentoTitular: '1000000012', nombreTitular: 'Camilo Torres', billetera: 'https://ilp.interledger-test.dev/s3rv3r' },
]
for (const l of LLAVES) await llamar('POST', '/puente/llaves', l)
await llamar('GET', '/puente/llaves?documento=1047994481')
await llamar('GET', '/puente/llaves/celular/3001234567')
await llamar('POST', '/puente/llaves/celular/3001234567/pertenece', { documento: '1047994481' })
await llamar('GET', '/cuentas/llaves/celular/3001234567')

console.log('== Billeteras')
await llamar('GET', `/billeteras/resolver?direccion=${encodeURIComponent(W.jpmv)}`)
await llamar('GET', `/billeteras/resolver?direccion=${encodeURIComponent(W.sebas)}`)

console.log('== Puntos de pago')
const PUNTOS = [
  { nombre: 'Punto de pago Fer', direccion: 'Medellín', billetera: W.teoclas },
  { nombre: 'Punto Centro', direccion: 'Calle 50 # 45-10', billetera: W.servidor },
  { nombre: 'Punto Poblado', direccion: 'Carrera 43A # 10-20', billetera: W.sebas },
  { nombre: 'Punto Laureles', direccion: 'Circular 4 # 70-15', billetera: W.jpmv },
]
for (const p of PUNTOS) await llamar('POST', '/puntos', p)
const puntos = (await llamar('GET', '/puntos')).datos ?? []

console.log('== Programas')
const entidad = ((await llamar('GET', '/entidades')).datos ?? [])[0]
const PROGRAMAS = [
  { nombre: 'Subsidio de transporte', billetera: W.jpmv, montoPorPersona: '230000', vigenciaInicio: '2026-10-16', vigenciaFin: '2026-12-31' },
  { nombre: 'Subsidio de alimentación', billetera: W.sebas, montoPorPersona: '150000', vigenciaInicio: '2026-10-16', vigenciaFin: '2026-11-30' },
  { nombre: 'Auxilio de arriendo', billetera: W.servidor, montoPorPersona: '400000', vigenciaInicio: '2026-11-01', vigenciaFin: '2027-01-31' },
  { nombre: 'Ayuda escolar', billetera: W.teoclas, montoPorPersona: '120000', vigenciaInicio: '2026-10-20', vigenciaFin: '2026-12-15' },
  { nombre: 'Auxilio de conectividad', billetera: W.jpmv, montoPorPersona: '60000', vigenciaInicio: '2026-10-16', vigenciaFin: '2026-12-31' },
]
let programas = (await llamar('GET', '/programas')).datos ?? []
for (const p of PROGRAMAS) {
  if (!programas.some((x) => x.nombre === p.nombre)) await llamar('POST', '/programas', { entidadId: entidad.id, ...p })
}
programas = (await llamar('GET', '/programas')).datos ?? []
const borrador = programas.find((p) => p.estado === 'Borrador')
if (borrador) {
  await llamar('GET', `/programas/${borrador.id}`)
  await llamar('PATCH', `/programas/${borrador.id}`, { montoPorPersona: '65000' })
  await llamar('GET', `/programas/${borrador.id}/liquidacion`)
}
const activo = programas.find((p) => p.estado === 'Activo')

console.log('== Beneficiarios y cuentas')
const BENEF = [
  { documento: '1047994481', billetera: W.jpmv, nombre: 'Juan Pablo Méndez', pin: '4821' },
  { documento: '1035915448', billetera: W.sebas, nombre: 'Sebas', pin: '7352' },
  { documento: '1026161053', billetera: W.teoclas, nombre: 'Fer', pin: '3916' },
  { documento: '1000000011', billetera: W.servidor, nombre: 'Marta Ríos', pin: '5128', cobraCon: 'llaveCedula' },
  { documento: '1000000012', billetera: W.servidor, nombre: 'Camilo Torres', pin: '6038', cobraCon: 'llaveCedula' },
]
for (const b of BENEF) await llamar('POST', '/beneficiarios', b)
await llamar('GET', '/beneficiarios')
await llamar('GET', '/beneficiarios/demo')
await llamar('POST', '/beneficiarios/1047994481/pin', { pin: '4821' })
for (const b of BENEF) await llamar('GET', `/beneficiarios/${b.documento}/resumen`)
for (const b of BENEF) await llamar('GET', `/cuentas/${b.documento}`)
await llamar('POST', '/cuentas', { documento: '1000000012', tipoLlave: 'correo', llave: 'camilo@ejemplo.co', pin: '6038' })

console.log('== Cobros (solo si hay un programa Activo)')
if (activo) {
  const punto = puntos.find((p) => p.billeteraCorta?.endsWith('teoclas')) ?? puntos[0]
  if (punto) {
    await llamar('GET', `/puntos/${punto.id}/pagos?documento=1035915448`)
    await llamar('GET', `/puntos/${punto.id}/cobros`)
    await llamar('GET', `/puntos/${punto.id}/resumen`)
    const c = await llamar('POST', '/cobros', { programaId: activo.id, documento: '1035915448', canal: 'retiro', puntoId: punto.id, llaveIdempotencia: 'poblar-retiro-sebas-1' })
    if (c.datos?.id) {
      await llamar('GET', `/cobros/${c.datos.id}`)
      await llamar('POST', `/cobros/${c.datos.id}/cancelar`)
    }
    for (const b of BENEF) {
      const x = await llamar('POST', '/cobros', { programaId: activo.id, documento: b.documento, canal: 'retiro', puntoId: punto.id, llaveIdempotencia: 'poblar-retiro-' + b.documento })
      if (x.datos?.id) {
        await llamar('GET', `/cobros/${x.datos.id}`)
        await llamar('POST', `/cobros/${x.datos.id}/cancelar`)
      }
    }
  }
} else {
  console.log('(sin programa Activo: aprueba uno con POST /programas/{id}/autorizar)')
}

console.log(`\nResumen: ${resumen.ok} OK · ${resumen.yaEstaba} ya estaba (409) · ${resumen.fallo} con error`)

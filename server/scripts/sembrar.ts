// Siembra datos de demo usando la propia API (sin SQL a mano): entidad, punto, programa y beneficiario.
// Es repetible: lo que ya existe se reutiliza. Uso: pnpm --filter server seed
// La liquidación y el puente son simulados y viven en memoria: se vuelven a cargar en cada arranque.
import { crearApp } from '../src/app.ts'
import { config, PGLITE_DIR } from '../src/config.ts'
import { crearContenedor } from '../src/contenedor.ts'
import { abrirBase } from '../src/db/conexion.ts'

const BANCO = '$ilp.interledger-test.dev/sebas55'
const PUNTO = '$ilp.interledger-test.dev/teoclas'
const PERSONA = { documento: '1047994481', billetera: '$ilp.interledger-test.dev/jpmv', nombre: 'Juan Pablo Méndez', pin: '4821' }

const base = await abrirBase({ url: config.DATABASE_URL, carpetaPglite: PGLITE_DIR })
const contenedor = crearContenedor({ db: base.db, config })
const servidor = crearApp(contenedor).listen(config.PORT)
const api = `http://localhost:${config.PORT}/api`
console.log(`Base de datos: ${base.tipo}`)

async function pedir(metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(api + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  })
  return { status: r.status, cuerpo: (await r.json().catch(() => null)) as any }
}

function exigir(paso: string, r: { status: number; cuerpo: any }, aceptados: number[] = [200, 201]) {
  if (!aceptados.includes(r.status)) {
    console.error(`✗ ${paso}: ${r.status} ${JSON.stringify(r.cuerpo)}`)
    servidor.close()
    process.exit(1)
  }
  const aviso = r.status >= 400 ? ` · ${r.cuerpo?.error?.codigo}` : ''
  console.log(`✓ ${paso} (${r.status})${aviso}`)
  return r.cuerpo
}

try {
  // Entidad (solo hay lectura por API: se crea con el repositorio)
  const entidades = contenedor.uow.repos.entidades
  const entidad =
    (await entidades.listar()).find((e) => e.nombre === 'Alcaldía de Prueba') ??
    (await entidades.crear({ documento: '900000001', nombre: 'Alcaldía de Prueba', tipo: 'gobierno' }))
  console.log(`✓ entidad ${entidad.nombre}`)

  const puntos = exigir('listar puntos', await pedir('GET', '/puntos'))
  if (!puntos.some((p: any) => p.billetera.endsWith('/teoclas'))) {
    exigir('crear punto de pago', await pedir('POST', '/puntos', { nombre: 'Punto de pago Fer', direccion: 'Medellín', billetera: PUNTO }))
  }

  const programas = exigir('listar programas', await pedir('GET', '/programas'))
  if (!programas.some((p: any) => p.nombre === 'Subsidio de transporte')) {
    exigir(
      'crear programa',
      await pedir('POST', '/programas', {
        entidadId: entidad.id,
        nombre: 'Subsidio de transporte',
        billetera: BANCO,
        vigenciaInicio: '2026-10-16',
        vigenciaFin: '2026-12-31',
        montoPorPersona: '230000',
      }),
    )
  }

  // 201 si es nueva; 409 PersonaExiste si ya estaba
  exigir('registrar beneficiario', await pedir('POST', '/beneficiarios', PERSONA), [201, 409])
} finally {
  servidor.close()
  process.exit(0)
}

// Casos de uso de puntos de retiro (HU-03).
import { resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { conflicto, noEncontrado } from '../comun/errores.ts'
import { mismaMoneda, monedaApi, type Moneda } from '../comun/montos.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import { monedaDe } from '../programas/vista.ts'
import type { EntradaPunto } from './esquemas.ts'
import type { TipoPunto } from './reglas.ts'

export interface DependenciasPuntos {
  uow: UnidadDeTrabajo
  billeteras: PuertoBilleteras
}

export interface VistaPunto {
  id: string
  nombre: string
  direccion: string
  billetera: string
  tipo: TipoPunto
}

export interface VistaPuntoRegistrado extends VistaPunto {
  moneda: Moneda
}

const vistaPunto = (p: FilaPunto): VistaPunto => ({
  id: p.id,
  nombre: p.nombre,
  direccion: p.direccion,
  billetera: p.billetera,
  tipo: p.tipo,
})

export class ServicioPuntos {
  private readonly deps: DependenciasPuntos

  constructor(deps: DependenciasPuntos) {
    this.deps = deps
  }

  /** CA-03.01 a CA-03.03. */
  async registrar(entrada: EntradaPunto): Promise<VistaPuntoRegistrado> {
    const { repos } = this.deps.uow
    const billetera = await resolverBilletera(this.deps.billeteras, entrada.billetera, 'No encontramos esa billetera del punto')

    if (entrada.programaId) {
      const programa = await repos.programas.obtener(entrada.programaId)
      if (!programa) throw noEncontrado('Ese programa no existe')
      const delPrograma = monedaDe(programa)
      if (!mismaMoneda(billetera, delPrograma)) {
        throw conflicto('MonedaDistinta', `La billetera del punto es en ${billetera.assetCode} y el programa en ${delPrograma.assetCode}`)
      }
    }

    const existente = await repos.puntos.porBilletera(billetera.url)
    if (existente) throw conflicto('PuntoExiste', `Esa billetera ya es del punto «${existente.nombre}»`)

    const punto = await this.deps.uow.transaccion(async (tx) => {
      const nuevo = await tx.puntos.crear({ nombre: entrada.nombre, direccion: entrada.direccion, billetera: billetera.url, tipo: entrada.tipo })
      if (entrada.programaId) await tx.puntos.asociarPrograma(entrada.programaId, nuevo.id)
      return nuevo
    })
    return { ...vistaPunto(punto), moneda: monedaApi(billetera) }
  }

  async listar(): Promise<VistaPunto[]> {
    return (await this.deps.uow.repos.puntos.listar()).map(vistaPunto)
  }
}

// Casos de uso del programa (HU-01, HU-02). Recibe sus dependencias por constructor: la base
// (unidad de trabajo), la billetera (Open Payments), la liquidación y el reloj.
import { resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { conflicto, entradaInvalida, noEncontrado } from '../comun/errores.ts'
import { finDelDia, inicioDelDia, type Reloj } from '../comun/fechas.ts'
import { desdeDecimal, monto, type Monto } from '../comun/montos.ts'
import type { CamposPrograma, FilaPrograma } from '../db/repositorios/programas.ts'
import type { Repos, UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import type { EdicionPrograma, EntradaPrograma } from './esquemas.ts'
import type { TipoPrograma } from './estados.ts'
import { aprobacionVencida, destinoDe, exigirEditable, exigirVigencia } from './reglas.ts'
import { monedaDe, vistaPrograma, type VistaPrograma } from './vista.ts'

export interface DependenciasProgramas {
  uow: UnidadDeTrabajo
  billeteras: PuertoBilleteras
  liquidacion: PuertoLiquidacion
  reloj: Reloj
  /** CA-01.08: minutos que espera una aprobación, en ms. */
  aprobacionTtlMs: number
  /** RNF-10: el bono es el extra HU-21. */
  bonoHabilitado: boolean
}

export interface ResumenLiquidacion {
  cedulas: number
  total: Monto
}

const MENSAJE_BILLETERA = 'No encontramos esa cuenta'

/** CA-01.08: lo que se limpia cuando una aprobación vence. */
const SIN_APROBACION_PENDIENTE = {
  aprobacionSolicitadaEn: null,
  uriContinuacion: null,
  tokenContinuacion: null,
  nonceCliente: null,
  nonceCierre: null,
} satisfies CamposPrograma

export class ServicioProgramas {
  private readonly deps: DependenciasProgramas

  constructor(deps: DependenciasProgramas) {
    this.deps = deps
  }

  /** CA-01.01 a CA-01.05 y CA-01.07. */
  async crear(entrada: EntradaPrograma): Promise<VistaPrograma> {
    this.exigirTipoHabilitado(entrada.tipo)
    this.exigirCategoriasSegunTipo(entrada.tipo, entrada.categorias)
    await this.exigirEntidad(entrada.entidadId)
    const billetera = await resolverBilletera(this.deps.billeteras, entrada.billetera, MENSAJE_BILLETERA)
    const inicio = inicioDelDia(entrada.vigenciaInicio)
    const fin = finDelDia(entrada.vigenciaFin)
    exigirVigencia(inicio, fin)

    return this.deps.uow.transaccion(async (repos) => {
      const p = await repos.programas.crear({
        entidadId: entrada.entidadId,
        nombre: entrada.nombre,
        tipo: entrada.tipo,
        destino: destinoDe(entrada.tipo),
        billeteraPrograma: billetera.url,
        // CA-01.03: la moneda sale de la billetera resuelta, nunca del formulario
        codigoMoneda: billetera.assetCode,
        escalaMoneda: billetera.assetScale,
        vigenciaInicio: inicio.toISOString(),
        vigenciaFin: fin.toISOString(),
        montoPorPersona: this.montoOpcional(entrada.montoPorPersona, billetera.assetScale),
      })
      const categorias = entrada.tipo === 'bono' ? (entrada.categorias ?? []) : []
      await repos.programas.ponerCategorias(p.id, categorias)
      await repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: p.id,
        estadoNuevo: 'Borrador',
        detalle: { billetera: p.billeteraPrograma, codigoMoneda: p.codigoMoneda },
        actor: 'entidad',
      })
      return vistaPrograma(p, categorias)
    })
  }

  /** CA-01.06: en Borrador se cambia todo; fuera de Borrador, 409 EstadoNoPermite. */
  async editar(id: string, cambios: EdicionPrograma): Promise<VistaPrograma> {
    const actual = await this.exigir(this.deps.uow.repos, id)
    exigirEditable(actual.estado)
    const tipo = cambios.tipo ?? actual.tipo
    if (cambios.tipo) this.exigirTipoHabilitado(cambios.tipo)
    this.exigirCategoriasSegunTipo(tipo, cambios.categorias)
    if (cambios.entidadId) await this.exigirEntidad(cambios.entidadId)

    const campos: CamposPrograma = {}
    if (cambios.entidadId) campos.entidadId = cambios.entidadId
    if (cambios.nombre) campos.nombre = cambios.nombre
    if (cambios.tipo) Object.assign(campos, { tipo, destino: destinoDe(tipo) })
    if (cambios.vigenciaInicio) campos.vigenciaInicio = inicioDelDia(cambios.vigenciaInicio).toISOString()
    if (cambios.vigenciaFin) campos.vigenciaFin = finDelDia(cambios.vigenciaFin).toISOString()
    exigirVigencia(new Date(campos.vigenciaInicio ?? actual.vigenciaInicio), new Date(campos.vigenciaFin ?? actual.vigenciaFin))

    let escala = actual.escalaMoneda
    if (cambios.billetera) {
      const billetera = await resolverBilletera(this.deps.billeteras, cambios.billetera, MENSAJE_BILLETERA)
      Object.assign(campos, {
        billeteraPrograma: billetera.url,
        codigoMoneda: billetera.assetCode,
        escalaMoneda: billetera.assetScale,
      })
      if (billetera.assetScale !== escala && actual.montoPorPersona !== null && !cambios.montoPorPersona) {
        throw entradaInvalida('montoPorPersona: la moneda cambió; escribe de nuevo el monto por persona')
      }
      escala = billetera.assetScale
    }
    if (cambios.montoPorPersona) campos.montoPorPersona = this.montoOpcional(cambios.montoPorPersona, escala)

    return this.deps.uow.transaccion(async (repos) => {
      const p = (await repos.programas.actualizar(id, campos, 'Borrador')) ?? this.yaNoEsBorrador()
      if (cambios.categorias || cambios.tipo) {
        await repos.programas.ponerCategorias(id, tipo === 'bono' ? (cambios.categorias ?? (await this.categorias(repos, id))) : [])
      }
      return vistaPrograma(p, await this.categorias(repos, id))
    })
  }

  async leer(id: string): Promise<VistaPrograma> {
    const p = await this.aplicarVencimiento(await this.exigir(this.deps.uow.repos, id))
    return vistaPrograma(p, await this.categorias(this.deps.uow.repos, id))
  }

  /** CA-01.08: estado, permiso, tope y monto por persona, con el vencimiento ya aplicado. */
  async listar(): Promise<VistaPrograma[]> {
    const { repos } = this.deps.uow
    const programas = await Promise.all((await repos.programas.listar()).map((p) => this.aplicarVencimiento(p)))
    const categorias = await repos.programas.categoriasDe(programas.map((p) => p.id))
    return programas.map((p) => vistaPrograma(p, categorias.get(p.id) ?? []))
  }

  /** CA-02.01: cuántas cédulas y el total, consultados a la liquidación sin copiarla (CA-02.05). */
  async resumenLiquidacion(id: string): Promise<ResumenLiquidacion> {
    const p = await this.exigir(this.deps.uow.repos, id)
    const r = await this.deps.liquidacion.resumen(p.id)
    return { cedulas: r.cedulas, total: monto(r.total, monedaDe(p)) }
  }

  /** CA-01.08 / HU-05: una aprobación vencida vuelve a Borrador con su evento. */
  private async aplicarVencimiento(p: FilaPrograma): Promise<FilaPrograma> {
    if (!aprobacionVencida(p, this.deps.reloj(), this.deps.aprobacionTtlMs)) return p
    return this.deps.uow.transaccion(async (repos) => {
      const cambiado = await repos.programas.actualizar(p.id, { ...SIN_APROBACION_PENDIENTE, estado: 'Borrador' }, 'EsperandoAprobacion')
      if (!cambiado) return this.exigir(repos, p.id)
      await repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: p.id,
        estadoAnterior: 'EsperandoAprobacion',
        estadoNuevo: 'Borrador',
        detalle: { resultado: 'vencido' },
        actor: 'sistema',
      })
      return cambiado
    })
  }

  private async exigir(repos: Repos, id: string): Promise<FilaPrograma> {
    const p = await repos.programas.obtener(id)
    if (!p) throw noEncontrado('Ese programa no existe')
    return p
  }

  private async exigirEntidad(id: string): Promise<void> {
    if (!(await this.deps.uow.repos.entidades.obtener(id))) throw noEncontrado('Esa entidad no existe', 'EntidadNoEncontrada')
  }

  private exigirTipoHabilitado(tipo: TipoPrograma): void {
    if (tipo === 'bono' && !this.deps.bonoHabilitado) throw conflicto('ExtraApagado', 'Los bonos no están habilitados (EXTRA_BONO)')
  }

  private exigirCategoriasSegunTipo(tipo: TipoPrograma, categorias: readonly string[] | undefined): void {
    if (tipo !== 'bono' && categorias?.length) throw entradaInvalida('categorias: solo un bono lleva categorías')
  }

  private montoOpcional(enPesos: string | undefined, escala: number): number | null {
    if (enPesos === undefined) return null
    let unidades: number
    try {
      unidades = desdeDecimal(enPesos, escala)
    } catch (e) {
      throw entradaInvalida(`montoPorPersona: ${(e as Error).message}`)
    }
    if (unidades <= 0) throw entradaInvalida('montoPorPersona: debe ser mayor que cero')
    return unidades
  }

  private async categorias(repos: Repos, id: string): Promise<string[]> {
    return (await repos.programas.categoriasDe([id])).get(id) ?? []
  }

  private yaNoEsBorrador(): never {
    throw conflicto('EstadoNoPermite', 'El programa ya no está en Borrador')
  }
}

// Casos de uso del programa (HU-01, HU-02): crear, editar, leer, listar y consultar su liquidación.
// Recibe sus dependencias por constructor: la base (unidad de trabajo), la billetera (Open Payments),
// la liquidación y los colaboradores del ciclo de vida.
import { resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { conflicto, entradaInvalida, noEncontrado } from '../comun/errores.ts'
import { finDelDia, inicioDelDia } from '../comun/fechas.ts'
import { desdeDecimal, monedaApi, monto, type MonedaApi, type Monto } from '../comun/montos.ts'
import type { CamposPrograma } from '../db/repositorios/programas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import type { EdicionPrograma, EntradaPrograma } from './esquemas.ts'
import type { TipoPrograma } from './estados.ts'
import type { LectorProgramas } from './lector.ts'
import { destinoDe, exigirEditable, exigirVigencia } from './reglas.ts'
import type { Transiciones } from './transiciones.ts'
import { monedaDe, type VistaPrograma } from './vista.ts'

export interface DependenciasProgramas {
  uow: UnidadDeTrabajo
  billeteras: PuertoBilleteras
  liquidacion: PuertoLiquidacion
  lector: LectorProgramas
  transiciones: Transiciones
  /** RNF-10: el bono es el extra HU-21. */
  bonoHabilitado: boolean
}

export interface ResumenLiquidacion {
  cedulas: number
  total: Monto
  moneda: MonedaApi
}

const MENSAJE_BILLETERA = 'No encontramos esa cuenta'

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
      return this.deps.lector.vista(p, repos)
    })
  }

  /** CA-01.06: en Borrador se cambia todo; fuera de Borrador, 409 EstadoNoPermite. */
  async editar(id: string, cambios: EdicionPrograma): Promise<VistaPrograma> {
    const { lector, uow } = this.deps
    const actual = await lector.exigir(id)
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

    return uow.transaccion(async (repos) => {
      const p = (await repos.programas.actualizar(id, campos, 'Borrador')) ?? this.yaNoEsBorrador()
      if (cambios.categorias || cambios.tipo) {
        await repos.programas.ponerCategorias(id, tipo === 'bono' ? (cambios.categorias ?? (await lector.categorias(id, repos))) : [])
      }
      return lector.vista(p, repos)
    })
  }

  async leer(id: string): Promise<VistaPrograma> {
    const { lector, transiciones } = this.deps
    return lector.vista(await transiciones.aplicarVencimiento(await lector.exigir(id)))
  }

  /** CA-01.08: estado, permiso, tope y monto por persona, con el vencimiento ya aplicado. */
  async listar(): Promise<VistaPrograma[]> {
    const { uow, lector, transiciones } = this.deps
    const programas = await Promise.all((await uow.repos.programas.listar()).map((p) => transiciones.aplicarVencimiento(p)))
    return lector.vistas(programas)
  }

  /** CA-02.01: cuántas cédulas y el total, consultados a la liquidación sin copiarla (CA-02.05). */
  async resumenLiquidacion(id: string): Promise<ResumenLiquidacion> {
    const p = await this.deps.lector.exigir(id)
    const r = await this.deps.liquidacion.resumen(p.id)
    return { cedulas: r.cedulas, total: monto(r.total), moneda: monedaApi(monedaDe(p)) }
  }

  private async exigirEntidad(id: string): Promise<void> {
    const { uow } = this.deps
    if (!(await uow.repos.entidades.obtener(id))) throw noEncontrado('Esa entidad no existe', 'EntidadNoEncontrada')
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

  private yaNoEsBorrador(): never {
    throw conflicto('EstadoNoPermite', 'El programa ya no está en Borrador')
  }
}

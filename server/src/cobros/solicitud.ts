// Solicitar un cobro (HU-09, HU-10, HU-14): liquidación → reglas → cobro. Aquí se aplican RN-01 a
// RN-06 y RN-17/18; no se mueve dinero: el pago lo dispara el pagador cuando el cobro llega a Pagando.
import { ErrorApi, noEncontrado } from '../comun/errores.ts'
import type { Reloj } from '../comun/fechas.ts'
import { enmascararDocumento } from '../comun/log.ts'
import type { Moneda } from '../comun/montos.ts'
import type { PuertoBilleteras } from '../comun/billeteras.ts'
import { mensajeDeRegla, esViolacionUnica } from '../db/errores.ts'
import type { FilaBeneficiario } from '../db/repositorios/beneficiarios.ts'
import type { FilaCobro, NuevoCobro } from '../db/repositorios/cobros.ts'
import type { FilaCuenta } from '../db/repositorios/cuentas.ts'
import { actorBeneficiario, actorPunto, type Actor } from '../db/repositorios/eventos.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { FilaPunto } from '../db/repositorios/puntos.ts'
import type { Repos, UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { ServicioCuentas } from '../cuentas/servicio.ts'
import type { ConsultaPago, PuertoLiquidacion } from '../liquidacion/contrato.ts'
import { LiquidacionNoResponde } from '../liquidacion/cliente.ts'
import type { LectorProgramas } from '../programas/lector.ts'
import { exigirCanalDelPunto } from '../puntos/reglas.ts'
import { monedaDe } from '../programas/vista.ts'
import type { Canal } from '../programas/reglas.ts'
import { PuenteNoResponde } from '../puente/cliente.ts'
import { despuesDeSolicitado } from './estados.ts'
import { MOTIVOS, type Motivo } from './mensajes.ts'
import { textoEvento } from './movimientos.ts'
import type { PagadorCobros } from './pagador.ts'
import * as reglas from './reglas.ts'
import type { VistaCobro, VistasCobro } from './vista.ts'

export interface EntradaCobro {
  programaId?: string | undefined
  documento: string
  canal: Canal
  puntoId?: string | undefined
  /** CA-10.07: la web genera un UUID por intento; repetirla devuelve el mismo cobro. */
  llaveIdempotencia: string
  /** RN-11: el monto nunca viene del navegador; solo el total de una compra (bono). */
  totalCompra?: string | undefined
}

export interface DependenciasSolicitud {
  uow: UnidadDeTrabajo
  lector: LectorProgramas
  liquidacion: PuertoLiquidacion
  cuentas: ServicioCuentas
  billeteras: PuertoBilleteras
  vistas: VistasCobro
  pagador: PagadorCobros
  reloj: Reloj
}

type PagoConsultado = ConsultaPago | 'falla'

/** Prioridad al resolver el programa de una cédula: Activo, luego Pausado, luego Cerrado. */
const PRIORIDAD: Partial<Record<FilaPrograma['estado'], number>> = { Activo: 0, Pausado: 1, Cerrado: 2 }

/** Lo que cambia entre un cobro que se crea vivo y uno que se rechaza al nacer. */
interface Contexto {
  base: Omit<NuevoCobro, 'estado'>
  monto: number | null
  novedad: Record<string, boolean>
  actor: Actor
  programa: FilaPrograma
  persona: { id: string }
  punto: FilaPunto | undefined
}

export class SolicitudCobro {
  private readonly deps: DependenciasSolicitud

  constructor(deps: DependenciasSolicitud) {
    this.deps = deps
  }

  async solicitar(e: EntradaCobro): Promise<VistaCobro> {
    const { uow, vistas, pagador } = this.deps
    const previo = await uow.repos.cobros.porLlave(e.llaveIdempotencia)
    if (previo) return vistas.una(previo) // CA-10.07: doble clic

    const punto = await this.resolverPunto(e)
    if ((e.canal === 'compra') !== (e.totalCompra !== undefined)) throw new ErrorApi(400, 'EntradaInvalida', 'totalCompra va solo en el canal compra')

    let programa: FilaPrograma
    let pago: PagoConsultado | undefined
    if (e.programaId) {
      const indicado = await uow.repos.programas.obtener(e.programaId)
      if (!indicado) throw noEncontrado('Ese programa no existe', 'ProgramaNoEncontrado')
      programa = indicado
    } else {
      ;({ programa, pago } = await this.resolverPrograma(e.documento, e.canal))
    }

    const persona = await uow.repos.beneficiarios.porCedula(e.documento)
    if (!persona) {
      // Una cédula que no existe no deja cobro, solo un evento con la cédula enmascarada
      await uow.repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: programa.id,
        detalle: { texto: 'Se intentó cobrar con una cédula que no está registrada.', documento: enmascararDocumento(e.documento) },
        actor: punto ? actorPunto(punto.id) : 'sistema',
      })
      throw new ErrorApi(404, 'SinPagoDisponible', MOTIVOS.SinPagoDisponible.mensaje)
    }
    // El retiro en un punto se confirma con rostro o huella: ya no exige un PIN registrado

    const { motivo, cuenta, pago: pagoFinal } = await this.evaluar(e, programa, persona, punto, pago)
    const monto =
      pagoFinal && pagoFinal !== 'falla' && pagoFinal.tipo === 'disponible'
        ? reglas.rn05Monto({ tipo: programa.tipo, valorDisponible: pagoFinal.monto, totalCompra: e.totalCompra ? Number(e.totalCompra) : undefined })
        : null
    const esNovedad = pagoFinal && pagoFinal !== 'falla' && pagoFinal.tipo === 'disponible' && pagoFinal.novedad
    const novedad: Record<string, boolean> = esNovedad ? { novedad: true } : {}
    const ctx: Contexto = {
      base: {
        programaId: programa.id,
        beneficiarioId: persona.id,
        canal: e.canal,
        puntoId: punto?.id ?? null,
        cuentaId: e.canal === 'cuenta' ? (cuenta?.id ?? null) : null,
        totalCompra: e.totalCompra ? Number(e.totalCompra) : null,
        llaveIdempotencia: e.llaveIdempotencia,
        creadoEn: this.deps.reloj().toISOString(),
      },
      monto,
      novedad,
      actor: punto ? actorPunto(punto.id) : actorBeneficiario(persona.id),
      programa,
      persona,
      punto,
    }

    const creado = await this.crear(ctx, motivo)
    if (!creado) {
      // Canal cuenta sin ninguna cuenta ni llave cédula (RN-17): se responde sin dejar cobro
      throw new ErrorApi(409, 'CuentaNoVerificada', 'No tienes una cuenta enlazada ni tu cédula registrada como llave Bre-B. Enlaza una llave o cobra en un punto')
    }
    // En el canal cuenta se paga sin esperar PIN
    if (creado.estado === 'Pagando') pagador.disparar(creado.id)
    return vistas.una(creado)
  }

  /** CA-10.04: el punto no elige programa; se toma el activo que tenga un pago disponible para esa cédula. */
  async resolverPrograma(documento: string, canal?: Canal): Promise<{ programa: FilaPrograma; pago?: PagoConsultado }> {
    const todos = (await this.deps.uow.repos.programas.listar())
      .filter((p) => p.estado in PRIORIDAD)
      .sort((a, b) => PRIORIDAD[a.estado]! - PRIORIDAD[b.estado]!)
    // En un comercio se buscan primero los bonos; en un punto de retiro, los subsidios: así el
    // rechazo habla del programa que corresponde («Este comercio no acepta este bono»)
    const destino = canal === 'compra' ? 'restringido' : canal === 'retiro' ? 'libre' : undefined
    const delCanal = destino ? todos.filter((p) => p.destino === destino) : todos
    const candidatos = delCanal.length ? delCanal : todos
    if (!candidatos.length) throw new ErrorApi(409, 'SinProgramas', 'No hay programas recibiendo cobros')
    const ahora = this.deps.reloj()
    for (const p of candidatos) {
      if (reglas.rn06ProgramaRecibe({ estado: p.estado, vigenciaInicio: p.vigenciaInicio, vigenciaFin: p.vigenciaFin, ahora })) continue
      const pago = await this.consultarPago(p.id, documento)
      if (pago === 'falla' || pago.tipo === 'disponible') return { programa: p, pago }
    }
    // Si ninguno recibe o tiene pago, el más relevante, para que el rechazo quede en su tablero
    return { programa: candidatos[0]! }
  }

  // ---------------------------------------------------------------------------------------------

  /** Canal y punto: la base también lo exige (canal_y_punto y el tipo del punto). */
  private async resolverPunto(e: EntradaCobro): Promise<FilaPunto | undefined> {
    if (e.canal === 'cuenta') {
      if (e.puntoId) throw new ErrorApi(400, 'EntradaInvalida', 'El cobro a la cuenta no lleva punto')
      return undefined
    }
    if (!e.puntoId) throw new ErrorApi(400, 'EntradaInvalida', 'El cobro en un punto necesita puntoId')
    const punto = await this.deps.uow.repos.puntos.obtener(e.puntoId)
    if (!punto) throw noEncontrado('Ese punto no existe', 'PuntoNoEncontrado')
    exigirCanalDelPunto(punto.tipo, e.canal) // CA-03.04
    return punto
  }

  /** Aplica las reglas en orden y devuelve el primer motivo de rechazo, o null si el cobro puede nacer vivo. */
  private async evaluar(
    e: EntradaCobro,
    programa: FilaPrograma,
    persona: FilaBeneficiario,
    punto: FilaPunto | undefined,
    pagoPrevio: PagoConsultado | undefined,
  ): Promise<{ motivo: Motivo | null; cuenta: FilaCuenta | undefined; pago: PagoConsultado | undefined }> {
    const { uow, cuentas, billeteras, reloj } = this.deps
    const beneficiarioId = persona.id
    const ahora = reloj()
    let pago = pagoPrevio
    let cuenta: FilaCuenta | undefined

    // RN-06 · Activo y en vigencia
    let motivo: reglas.Resultado = reglas.rn06ProgramaRecibe({
      estado: programa.estado,
      vigenciaInicio: programa.vigenciaInicio,
      vigenciaFin: programa.vigenciaFin,
      ahora,
    })
    // RN-03 · canal permitido por el destino
    motivo ??= reglas.rn03CanalPermitido({
      destino: programa.destino,
      canal: e.canal,
      puntoAutorizado: punto ? await uow.repos.puntos.autorizadoEnPrograma(programa.id, punto.id) : false,
    })
    // RN-07 · bloqueo por PIN en este programa
    if (!motivo) {
      const bloqueo = await uow.repos.bloqueos.de(programa.id, beneficiarioId)
      if (reglas.rn07Bloqueada({ bloqueadoHasta: bloqueo?.bloqueadoHasta ?? null, ahora })) motivo = 'PinBloqueado'
    }
    // RN-02 · aviso temprano, antes de ir a la red (la base lo arbitra igual con el índice)
    motivo ??= reglas.rn02CobroExistente((await uow.repos.cobros.vivoDe(programa.id, beneficiarioId))?.estado ?? null)
    // RN-01 · la liquidación
    if (!motivo) {
      pago ??= await this.consultarPago(programa.id, e.documento)
      motivo = pago === 'falla' ? 'LiquidacionNoResponde' : reglas.rn01PagoDisponible({ disponible: pago.tipo === 'disponible' })
    }
    // RN-04 · cuenta Verificada y en la misma moneda; RN-17 y RN-18 para la llave Bre-B
    if (!motivo && e.canal === 'cuenta') {
      cuenta = await uow.repos.cuentas.vigenteDe(beneficiarioId)
      try {
        cuenta ??= await cuentas.cuentaPorCedula(persona)
        if (cuenta?.estado === 'Verificada' && cuenta.tipoLlave) {
          const r = await cuentas.refrescarLlave(cuenta)
          if (r === 'LlaveNoExiste') motivo = 'LlaveNoExiste'
          else cuenta = r
        }
      } catch (err) {
        // Sin ninguna cuenta no hay dónde dejar el rechazo: el 503 llega tal cual
        if (!(err instanceof PuenteNoResponde) || !cuenta) throw err
        motivo = 'PuenteNoResponde'
      }
      if (!motivo) {
        let monedaCuenta: Moneda | null = null
        if (cuenta?.estado === 'Verificada') {
          try {
            const w = await billeteras.resolver(cuenta.billetera)
            monedaCuenta = { assetCode: w.assetCode, assetScale: w.assetScale }
          } catch {
            throw new ErrorApi(503, 'SinRespuesta', 'No pudimos revisar tu cuenta; intenta en un momento')
          }
        }
        motivo = reglas.rn04CuentaLista({ cuenta: cuenta ?? null, monedaCuenta, monedaPrograma: monedaDe(programa) })
      }
    }
    return { motivo, cuenta, pago }
  }

  private async consultarPago(programaId: string, documento: string): Promise<PagoConsultado> {
    try {
      return await this.deps.liquidacion.pago(programaId, documento)
    } catch (e) {
      if (e instanceof LiquidacionNoResponde) return 'falla'
      throw e
    }
  }

  /**
   * Crea el cobro: vivo (Solicitado y su siguiente estado, con sus eventos, en una transacción) o
   * rechazado al nacer. Si la base lo rechaza (idempotencia, RN-02 por el índice o una regla), la
   * transacción se deshace entera y se resuelve fuera: nunca queda un cobro a medias.
   */
  private async crear(ctx: Contexto, motivo: Motivo | null): Promise<FilaCobro | null> {
    const { uow } = this.deps
    try {
      return await uow.transaccion(async (repos) => (motivo ? this.crearRechazado(repos, ctx, motivo) : this.crearVivo(repos, ctx)))
    } catch (err) {
      const otro = await uow.repos.cobros.porLlave(ctx.base.llaveIdempotencia)
      if (otro) return otro // dos envíos con la misma llave a la vez
      const deLaBase = this.motivoDeLaBase(err)
      if (deLaBase) return uow.transaccion((repos) => this.crearRechazado(repos, ctx, deLaBase))
      if (esViolacionUnica(err)) {
        // CA-14.01: RN-02 lo decidió el índice único parcial; llegaron dos a la vez
        const vivo = await uow.repos.cobros.vivoDe(ctx.programa.id, ctx.persona.id)
        if (vivo) return uow.transaccion((repos) => this.crearRechazado(repos, ctx, reglas.rn02CobroExistente(vivo.estado)!))
      }
      throw err
    }
  }

  private async crearVivo(repos: Repos, ctx: Contexto): Promise<FilaCobro> {
    const { base, monto, novedad, actor, punto } = ctx
    const c = await repos.cobros.crear({ ...base, monto, estado: 'Solicitado' })
    await repos.eventos.registrar({
      tipoEntidad: 'cobro',
      idEntidad: c.id,
      estadoNuevo: 'Solicitado',
      detalle: { texto: textoEvento(c, 'Solicitado', punto), ...novedad },
      actor,
    })
    const hacia = despuesDeSolicitado(c.canal)
    await repos.cobros.actualizar(c.id, c.version, { estado: hacia })
    await repos.eventos.registrar({
      tipoEntidad: 'cobro',
      idEntidad: c.id,
      estadoAnterior: 'Solicitado',
      estadoNuevo: hacia,
      detalle: { texto: textoEvento(c, hacia, punto) },
      actor,
    })
    return (await repos.cobros.obtener(c.id))!
  }

  /** Un rechazo del canal cuenta se guarda con la última cuenta conocida; sin ninguna, no hay cobro (null). */
  private async crearRechazado(repos: Repos, ctx: Contexto, motivo: Motivo): Promise<FilaCobro | null> {
    const { base, monto, novedad, actor } = ctx
    const cuentaId = base.canal === 'cuenta' ? (base.cuentaId ?? (await repos.cuentas.ultimaDe(ctx.persona.id))?.id ?? null) : null
    if (base.canal === 'cuenta' && !cuentaId) return null
    const c = await repos.cobros.crear({ ...base, cuentaId, monto, estado: 'Rechazado', motivoRechazo: motivo })
    await repos.eventos.registrar({
      tipoEntidad: 'cobro',
      idEntidad: c.id,
      estadoNuevo: 'Rechazado',
      detalle: { texto: MOTIVOS[motivo].mensaje, motivo, ...novedad },
      actor,
    })
    return c
  }

  /**
   * Las reglas que también hace cumplir la base con triggers. La API las revisa antes, pero si algo
   * cambió en ese instante (por ejemplo, el programa se pausó), el error de la base se traduce al
   * mismo motivo.
   */
  private motivoDeLaBase(e: unknown): Motivo | null {
    const m = mensajeDeRegla(e)
    if (!m) return null
    if (m.startsWith('RN-06')) return m.includes('Cerrado') ? 'ProgramaCerrado' : 'ProgramaNoRecibe'
    if (m.startsWith('RN-03: un bono')) return 'SoloEnComercios'
    if (m.startsWith('RN-03: este comercio')) return 'ComercioNoAutorizado'
    if (m.startsWith('RN-03')) return 'ProgramaNoRecibe'
    if (m.startsWith('RN-04')) return 'CuentaNoVerificada'
    if (m.startsWith('RN-07')) return 'PinBloqueado'
    return null
  }
}

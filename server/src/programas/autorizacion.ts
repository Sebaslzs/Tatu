// Autorización del programa con Open Payments (HU-04, HU-05): pedir el permiso con tope en el
// banco, atender el callback con su hash y cancelar una aprobación pendiente.
import { randomUUID } from 'node:crypto'
import { conflicto } from '../comun/errores.ts'
import { esUuid } from '../comun/parametros.ts'
import { log } from '../comun/log.ts'
import { errorOpApi } from '../comun/openPayments.ts'
import type { Reloj } from '../comun/fechas.ts'
import type { UnidadDeTrabajo } from '../db/unidadDeTrabajo.ts'
import type { PuertoLiquidacion } from '../liquidacion/contrato.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import { verificarHash } from './hash.ts'
import type { LectorProgramas } from './lector.ts'
import type { PuertoPermisos } from './puertos.ts'
import { exigirAutorizable } from './reglas.ts'
import { SIN_TEMPORALES, type Transiciones } from './transiciones.ts'
import { monedaDe, type VistaPrograma } from './vista.ts'

export type ResultadoCallback = 'aprobado' | 'rechazado' | 'invalido' | 'vencido'

/** Lo que la Test Wallet manda al volver a `GET /api/callback/:id`. */
export interface ParametrosCallback {
  hash?: string | undefined
  interact_ref?: string | undefined
  result?: string | undefined
}

export interface DependenciasAutorizacion {
  uow: UnidadDeTrabajo
  lector: LectorProgramas
  transiciones: Transiciones
  permisos: PuertoPermisos
  liquidacion: PuertoLiquidacion
  reloj: Reloj
  /** `API_BASE_URL`: de ahí sale el `urlRetorno` del consentimiento. */
  apiBaseUrl: string
  /** `APP_BASE_URL`: adónde se manda a la entidad tras el callback. */
  appBaseUrl: string
  /** Nonce propio del cliente por solicitud; se inyecta para poder probar el hash. */
  nuevoNonce?: () => string
}

export interface Autorizacion {
  /** Enlace de consentimiento en el banco. No se guarda: solo se devuelve (CA-04.02). */
  redirect: string
  programa: VistaPrograma
}

export class ServicioAutorizacion {
  private readonly deps: DependenciasAutorizacion

  constructor(deps: DependenciasAutorizacion) {
    this.deps = deps
  }

  /** CA-04.01: pide el permiso con tope = total de la liquidación (RN-08) y espera la aprobación. */
  async autorizar(id: string): Promise<Autorizacion> {
    const { lector, transiciones, liquidacion, permisos, uow } = this.deps
    const p = await lector.exigir(id)
    transiciones.exigirEstado(p, 'Borrador')
    // RN-08: el tope es el total de la liquidación al pedir la aprobación, y queda fijo
    const tope = (await liquidacion.resumen(p.id)).total
    if (tope <= 0) throw conflicto('SinLiquidacion', 'La liquidación no tiene cédulas para este programa')
    exigirAutorizable({ tipo: p.tipo, categorias: await lector.categorias(p.id) })

    const nonce = (this.deps.nuevoNonce ?? randomUUID)()
    const pendiente = await permisos
      .pedirPermisoPrograma({ billetera: p.billeteraPrograma, tope, moneda: monedaDe(p), nonce, urlRetorno: this.urlCallback(p.id) })
      .catch((e: unknown) => {
        throw errorOpApi(e, 'No pudimos pedir la aprobación al banco')
      })

    const cambiado = await transiciones.aplicar(
      p,
      'EsperandoAprobacion',
      {
        topeTotal: tope,
        aprobacionSolicitadaEn: this.deps.reloj().toISOString(),
        nonceCliente: nonce,
        nonceCierre: pendiente.nonceCierre,
        uriContinuacion: pendiente.uriContinuacion,
        tokenContinuacion: pendiente.tokenContinuacion,
        urlPermiso: pendiente.urlPermiso,
      },
      { texto: 'Se pidió la aprobación del permiso con tope.', tope },
    )
    if (!cambiado) throw conflicto('EstadoNoPermite', 'El programa cambió mientras se pedía la aprobación')
    return { redirect: pendiente.redirect, programa: await lector.vista(cambiado, uow.repos) }
  }

  /**
   * CA-04.03 a CA-04.05 y CA-05.01/02: atiende la vuelta de la Test Wallet y devuelve la URL de la
   * web adonde redirigir. Nunca lanza por un callback malo: siempre hay a dónde volver.
   */
  async callback(id: string, q: ParametrosCallback): Promise<string> {
    const { lector, transiciones, permisos, uow } = this.deps
    if (!esUuid(id)) return `${this.deps.appBaseUrl}/entidad?resultado=invalido`
    const original = await uow.repos.programas.obtener(id)
    if (!original) return `${this.deps.appBaseUrl}/entidad?resultado=invalido`
    const p = await transiciones.aplicarVencimiento(original)

    // CA-04.05: un callback repetido con el programa ya Activo redirige igual sin cambiar nada
    if (p.estado === 'Activo' || p.estado === 'Pausado') return this.urlRegreso(id, 'aprobado')
    if (p.estado !== 'EsperandoAprobacion') return this.urlRegreso(id, 'vencido')

    if (q.result === 'grant_rejected' || q.result === 'grant_invalid') {
      await transiciones.aplicar(
        p,
        'Borrador',
        SIN_TEMPORALES,
        {
          texto: q.result === 'grant_rejected' ? 'La aprobación fue rechazada en el banco.' : 'El banco marcó la aprobación como inválida.',
          resultado: q.result,
        },
        'banco',
      )
      return this.urlRegreso(id, 'rechazado')
    }

    const coincidencia = this.verificar(p, q)
    if (!coincidencia) {
      // CA-04.04: el programa no cambia; queda el evento
      await uow.repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: id,
        detalle: { texto: 'Callback con hash inválido: se ignoró.', resultado: 'invalido' },
      })
      return this.urlRegreso(id, 'invalido')
    }

    let permiso
    try {
      permiso = await permisos.continuarPermiso({
        uriContinuacion: p.uriContinuacion!,
        tokenContinuacion: p.tokenContinuacion!,
        interactRef: q.interact_ref!,
      })
    } catch (e) {
      // Dos callbacks a la vez: el segundo falla al continuar, pero el primero ya activó
      if ((await lector.exigir(id)).estado === 'Activo') return this.urlRegreso(id, 'aprobado')
      log.warn('grant.continue falló', { error: e, programa: id })
      await uow.repos.eventos.registrar({
        tipoEntidad: 'programa',
        idEntidad: id,
        detalle: { texto: 'El banco no confirmó el permiso.', resultado: 'invalido' },
        actor: 'banco',
      })
      return this.urlRegreso(id, 'invalido')
    }

    const cambiado = await transiciones.aplicar(
      p,
      'Activo',
      { ...SIN_TEMPORALES, tokenAcceso: permiso.token, urlGestion: permiso.urlGestion },
      // La variante del hash y la duración del token, nunca el token
      { texto: 'Permiso aprobado en el banco.', varianteHash: coincidencia.variante, grantUrl: coincidencia.grantUrl, expiresIn: permiso.expiraEnSeg ?? null },
      'banco',
    )
    if (!cambiado && (await lector.exigir(id)).estado !== 'Activo') return this.urlRegreso(id, 'invalido')
    return this.urlRegreso(id, 'aprobado')
  }

  /** CA-05.03: «Cancelar aprobación» → `grant.cancel` (best-effort) y vuelve a Borrador. */
  async cancelarAprobacion(id: string): Promise<VistaPrograma> {
    const { lector, transiciones } = this.deps
    const p = await lector.exigir(id)
    transiciones.exigirEstado(p, 'EsperandoAprobacion')
    await transiciones.cancelarPendiente(p)
    const cambiado = await transiciones.aplicar(p, 'Borrador', SIN_TEMPORALES, { texto: 'La entidad canceló la aprobación.', resultado: 'cancelado' })
    return lector.vista(cambiado ?? (await lector.exigir(id)))
  }

  private verificar(p: FilaPrograma, q: ParametrosCallback) {
    if (!q.hash || !q.interact_ref || !p.nonceCliente || !p.nonceCierre || !p.urlPermiso) return null
    return verificarHash(q.hash, {
      nonceCliente: p.nonceCliente,
      nonceCierre: p.nonceCierre,
      interactRef: q.interact_ref,
      urlPermiso: p.urlPermiso,
    })
  }

  private urlCallback(id: string): string {
    return `${this.deps.apiBaseUrl}/callback/${id}`
  }

  private urlRegreso(id: string, resultado: ResultadoCallback): string {
    return `${this.deps.appBaseUrl}/entidad/programas/${encodeURIComponent(id)}/aprobar?resultado=${resultado}`
  }
}

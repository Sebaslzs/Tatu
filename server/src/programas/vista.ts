// Lo que la API muestra de un programa. Tokens, URLs de gestión y nonces nunca salen (RNF-01).
import { monedaApi, montoOpcional, type Moneda, type MonedaApi, type Monto } from '../comun/montos.ts'
import type { FilaPrograma } from '../db/repositorios/programas.ts'
import type { Destino, EstadoPrograma, TipoPrograma } from './estados.ts'
import { canalesDe, permisoActivo, permisoVencido, type Canal } from './reglas.ts'

export interface VistaPrograma {
  id: string
  entidadId: string
  nombre: string
  tipo: TipoPrograma
  destino: Destino
  canales: Canal[]
  categorias: string[]
  billetera: string
  moneda: MonedaApi
  vigenciaInicio: string
  vigenciaFin: string
  estado: EstadoPrograma
  montoPorPersona: Monto | null
  tope: Monto | null
  permisoActivo: boolean
  permisoVencido: boolean
}

export function monedaDe(p: Pick<FilaPrograma, 'codigoMoneda' | 'escalaMoneda'>): Moneda {
  return { assetCode: p.codigoMoneda, assetScale: p.escalaMoneda }
}

export function vistaPrograma(p: FilaPrograma, categorias: string[]): VistaPrograma {
  const moneda = monedaDe(p)
  return {
    id: p.id,
    entidadId: p.entidadId,
    nombre: p.nombre,
    tipo: p.tipo,
    destino: p.destino,
    canales: canalesDe(p.tipo),
    categorias,
    billetera: p.billeteraPrograma,
    moneda: monedaApi(moneda),
    vigenciaInicio: new Date(p.vigenciaInicio).toISOString(),
    vigenciaFin: new Date(p.vigenciaFin).toISOString(),
    estado: p.estado,
    montoPorPersona: montoOpcional(p.montoPorPersona, moneda),
    tope: montoOpcional(p.topeTotal, moneda),
    permisoActivo: permisoActivo(p),
    permisoVencido: permisoVencido(p),
  }
}

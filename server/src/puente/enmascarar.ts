import { enmascararDocumento } from '../comun/log.ts'
import type { TipoLlave } from './contrato.ts'

/** «Ana María Rojas» → «Ana M*** R***»: lo que muestra Bre-B antes de transferir. */
export function enmascararNombre(nombre: string): string {
  const [primero, ...resto] = nombre.trim().split(/\s+/)
  return [primero ?? '', ...resto.map((p) => `${p.charAt(0).toUpperCase()}***`)].join(' ')
}

/** La llave como se muestra en pantalla: «300***4567», «******7890», «s***@correo.com», «@seb***». */
export function enmascararLlave(tipo: TipoLlave, valor: string): string {
  switch (tipo) {
    case 'cedula':
      return enmascararDocumento(valor)
    case 'celular':
      return valor.length === 10 ? `${valor.slice(0, 3)}***${valor.slice(-4)}` : enmascararDocumento(valor)
    case 'correo': {
      const [usuario = '', dominio = ''] = valor.split('@')
      return `${usuario.charAt(0)}***@${dominio}`
    }
    case 'alfanumerica':
      return `${valor.slice(0, 4)}***`
  }
}

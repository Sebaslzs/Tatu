// O1/O2/O7/O8 · Programas y su permiso con tope.
import { Router } from 'express'
import { noImplementado } from '../noImplementado.ts'

export const rutasProgramas = Router()

rutasProgramas.post('/', noImplementado) // O1 · conectar programa
rutasProgramas.post('/:id/autorizar', noImplementado) // O2 · grant interactivo con tope (RN-08)
rutasProgramas.get('/:id/tablero', noImplementado) // O7 · autorizado / cobrado / nunca salió
rutasProgramas.post('/:id/cerrar', noImplementado) // O8 · grant.cancel o token.revoke

/** GET /callback/:id · vuelve de la Test Wallet; verifica el hash y hace grant.continue (O2). */
export const rutasCallbackProgramas = Router()

rutasCallbackProgramas.get('/:id', noImplementado)

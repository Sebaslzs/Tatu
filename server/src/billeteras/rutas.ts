// GET /billeteras/resolver · «Cuenta encontrada»: valida una billetera antes de guardarla.
import { Router } from 'express'
import { z } from 'zod'
import { resolverBilletera, type PuertoBilleteras } from '../comun/billeteras.ts'
import { validar } from '../comun/errores.ts'

const Consulta = z.object({ direccion: z.string().trim().min(3).meta({ examples: ['$ilp.interledger-test.dev/mi-wallet'] }) })

export function rutasBilleteras(billeteras: PuertoBilleteras): Router {
  const r = Router()

  r.get('/resolver', async (req, res) => {
    const { direccion } = validar(Consulta, req.query)
    const w = await resolverBilletera(billeteras, direccion, 'No encontramos esa cuenta')
    res.json({ id: w.url, nombre: w.nombre, moneda: { codigo: w.assetCode, escala: w.assetScale } })
  })

  return r
}

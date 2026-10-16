// GET /config · banderas EXTRA_* para que la web no muestre botones de extras apagados (RNF-10).
import { Router } from 'express'
import { config } from './config.ts'

export const rutasExtras = Router()

rutasExtras.get('/config', (_req, res) => {
  res.json({
    pollIntervaloMs: config.POLL_INTERVALO_MS,
    extras: {
      bono: config.EXTRA_BONO,
      qr: config.EXTRA_QR,
      pdf417: config.EXTRA_PDF417,
      contrato: config.EXTRA_CONTRATO,
      deploy: config.EXTRA_DEPLOY,
    },
  })
})

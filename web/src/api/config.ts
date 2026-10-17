// Banderas EXTRA_* (GET /config, RNF-10): la web no muestra los extras apagados.
import { useEffect, useState } from 'react'
import { obtenerConfig, type ConfigPublica } from './client'

const CONFIG_INICIAL: ConfigPublica = {
  pollIntervaloMs: 1000,
  extras: { bono: false, qr: false, pdf417: false, contrato: false, deploy: false },
}

let cache: Promise<ConfigPublica> | null = null

export function useConfig(): ConfigPublica {
  const [config, setConfig] = useState(CONFIG_INICIAL)
  useEffect(() => {
    let vivo = true
    cache ??= obtenerConfig().catch(() => {
      cache = null
      return CONFIG_INICIAL
    })
    void cache.then((c) => vivo && setConfig(c))
    return () => {
      vivo = false
    }
  }, [])
  return config
}

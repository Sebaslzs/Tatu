// Configuración: las URLs internas en local y en Vercel.
import { describe, expect, it } from 'vitest'
import { leerConfig } from './config.ts'

describe('URLs de la API', () => {
  it('fuera de Vercel usa las de localhost', () => {
    const c = leerConfig({})
    expect(c.API_BASE_URL).toBe('http://localhost:3000/api')
    expect(c.LIQUIDACION_URL).toBe('http://localhost:3000/api/liquidacion')
  })

  it('en producción de Vercel salen del dominio del proyecto', () => {
    const c = leerConfig({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'tatu.vercel.app', VERCEL_URL: 'tatu-abc123.vercel.app' })
    expect(c.APP_BASE_URL).toBe('https://tatu.vercel.app')
    expect(c.API_BASE_URL).toBe('https://tatu.vercel.app/api')
    expect(c.LIQUIDACION_URL).toBe('https://tatu.vercel.app/api/liquidacion')
    expect(c.PUENTE_URL).toBe('https://tatu.vercel.app/api/puente')
  })

  it('en una preview salen del dominio de la rama', () => {
    const c = leerConfig({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'tatu-git-develop.vercel.app', VERCEL_URL: 'tatu-abc123.vercel.app' })
    expect(c.API_BASE_URL).toBe('https://tatu-git-develop.vercel.app/api')
    expect(c.LIQUIDACION_URL).toBe('https://tatu-git-develop.vercel.app/api/liquidacion')
  })

  it('las variables definidas en Vercel mandan sobre el dominio', () => {
    const c = leerConfig({
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'tatu.vercel.app',
      API_BASE_URL: 'https://tatu.co/api/',
      LIQUIDACION_URL: 'https://gobierno.example/liquidacion',
    })
    expect(c.APP_BASE_URL).toBe('https://tatu.vercel.app')
    expect(c.API_BASE_URL).toBe('https://tatu.co/api')
    expect(c.LIQUIDACION_URL).toBe('https://gobierno.example/liquidacion')
    expect(c.PUENTE_URL).toBe('https://tatu.co/api/puente')
  })
})

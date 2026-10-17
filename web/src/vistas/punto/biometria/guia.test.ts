// La regla de posición del rostro: sin cara no avanza, y cada situación tiene su mensaje.
import { describe, expect, it } from 'vitest'
import { aVisible, evaluarRostro, MENSAJES_GUIA } from './guia'

const centrada = { x: 0.3, y: 0.2, ancho: 0.4, alto: 0.5 }

describe('evaluarRostro', () => {
  it('sin cara en el cuadro no está alineado', () => {
    expect(evaluarRostro([])).toBe('sinRostro')
    expect(MENSAJES_GUIA.sinRostro).toBe('Ubica tu rostro dentro del óvalo')
  })

  it.each([
    ['varios', [centrada, centrada]],
    ['lejos', [{ ...centrada, x: 0.4, ancho: 0.2 }]],
    ['cerca', [{ x: 0.1, y: 0.05, ancho: 0.8, alto: 0.8 }]],
    ['descentrado', [{ ...centrada, x: 0.0 }]],
    ['alineado', [centrada]],
  ] as const)('%s', (esperado, cajas) => {
    expect(evaluarRostro(cajas)).toBe(esperado)
  })
})

describe('aVisible', () => {
  it('descuenta el recorte de object-cover', () => {
    // Video 640×480 en un recuadro 300×400: se escala a 533×400 y se recortan 116,7 px a cada lado
    const c = aVisible({ x: 320 - 60, y: 120, ancho: 120, alto: 160 }, { ancho: 640, alto: 480 }, { ancho: 300, alto: 400 })
    expect(c.x + c.ancho / 2).toBeCloseTo(0.5)
    expect(c.ancho).toBeCloseTo((120 * (400 / 480)) / 300)
  })
})

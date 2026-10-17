import { describe, expect, it } from 'vitest'
import { leerCsv, PLANTILLA_CSV, revisarLista } from './cargaPersonas'

describe('leerCsv', () => {
  it('lee comas, punto y coma, comillas y el BOM de Excel', () => {
    expect(leerCsv('﻿cedula;nombre\r\n123456;"Pérez; Ana"\r\n\r\n')).toEqual([
      ['cedula', 'nombre'],
      ['123456', 'Pérez; Ana'],
    ])
    expect(leerCsv('a,b\n"dijo ""hola""",2')).toEqual([
      ['a', 'b'],
      ['dijo "hola"', '2'],
    ])
  })
})

describe('revisarLista', () => {
  it('la plantilla trae dos personas listas', () => {
    const r = revisarLista(leerCsv(PLANTILLA_CSV))
    expect(r.problemas).toEqual([])
    expect(r.listas.map((p) => [p.cedula, p.cobraCon, p.pin])).toEqual([
      ['1000000101', 'wallet', '1234'],
      ['1000000102', 'llaveCedula', undefined],
    ])
  })

  it('acepta encabezados con tildes, mayúsculas y sinónimos, y la cédula como número de Excel', () => {
    const r = revisarLista([
      ['Cédula', 'Billetera', 'Nombre completo'],
      [52418300, '$ilp.interledger-test.dev/ana', 'Ana  Rodríguez'],
    ])
    expect(r.listas).toEqual([{ fila: 2, cedula: '52418300', billetera: '$ilp.interledger-test.dev/ana', nombre: 'Ana Rodríguez', cobraCon: 'wallet' }])
  })

  it('explica cada fila con problemas y salta las vacías', () => {
    const r = revisarLista([
      ['cedula', 'wallet', 'pin', 'cobra_con'],
      ['12.345.678', 'w1', '', ''],
      ['', '', '', ''],
      ['123', 'w2', '', ''],
      ['12345678', 'w3', '', ''],
      ['87654321', '', '', ''],
      ['11111111', 'w4', '12', ''],
      ['22222222', 'w5', '', 'efectivo'],
    ])
    expect(r.leidas).toBe(6)
    expect(r.listas.map((p) => p.cedula)).toEqual(['12345678'])
    expect(r.problemas.map((p) => p.fila)).toEqual([4, 5, 6, 7, 8])
    expect(r.problemas[1]!.problema).toContain('ya está en la fila 2')
  })

  it('sin las columnas obligatorias o sin filas, no se puede revisar', () => {
    expect(() => revisarLista([['nombre', 'pin']])).toThrow('Faltan las columnas cedula y wallet')
    expect(() => revisarLista([['cedula', 'wallet']])).toThrow('solo el encabezado')
    expect(() => revisarLista([])).toThrow('vacío')
  })
})

// «C.C. de prueba 3»: cómo se muestra a una persona sin revelar su cédula (Endpoints.md).
export function etiquetaDe(b: { tipoDocumento: string; numeroDocumento: string }): string {
  return `${b.tipoDocumento === 'CC' ? 'C.C.' : b.tipoDocumento} de prueba ${Number(b.numeroDocumento.slice(-3))}`
}

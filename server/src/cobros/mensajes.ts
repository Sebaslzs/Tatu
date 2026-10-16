// Catálogo único de textos de rechazo/falla por causa (HU-13). Un solo lugar para no
// desalinear la API, la web y el video. Se completa con la tabla de HU-13.

export type CausaRechazo = string

export const MENSAJES: Record<CausaRechazo, string> = {}

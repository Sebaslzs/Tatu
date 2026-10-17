// Cierre del programa (wireframe 07): lo que nunca salió de la cuenta y el resumen de cobros. Las
// cifras salen del evento de cierre del tablero; sin tablero, se muestra lo del programa.
import { Lock } from 'lucide-react'
import { useState } from 'react'
import { AvisoPendiente, Boton, Tarjeta, Titulo, Volver } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { PasosPrograma } from '@/componentes/PasosPrograma'
import { Celda, Encabezado, Fila, FilaEncabezado, Tabla } from '@/componentes/Tabla'
import { montoCero, sumarMontos, textoMonto } from '@/lib/montos'
import { formatFechaHora, plural } from '@/lib/textos'
import { TablaCobros } from './Tablero'
import { AVISO_TABLERO } from './textos'
import type { DatosPrograma } from './useTablero'

export default function ProgramaCerrado({ datos }: { datos: DatosPrograma }) {
  const { programa: p, tablero: t } = datos
  const m = p.moneda
  const cierre = t?.cierre ?? (t ? { autorizado: t.autorizado, cobrado: t.cobrado, nuncaSalio: t.noHaSalido, cerradoEn: null } : null)
  const [verTodos, setVerTodos] = useState(false)

  const pagados = t?.cobros.filter((c) => c.estado === 'Pagado') ?? []
  const aCuenta = pagados.filter((c) => c.canal === 'cuenta')
  const enPunto = pagados.filter((c) => c.canal === 'retiro')
  const monto = (l: typeof pagados) => textoMonto(sumarMontos(m, l.map((c) => c.monto)))

  return (
    <MarcoEntidad entidadId={p.entidadId}>
      <Volver to="/entidad">Tus programas</Volver>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-tenue">{p.nombre}</span>
          <Titulo>Cierre del programa</Titulo>
        </div>
        <PasosPrograma estado="Cerrado" />
      </div>

      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-linea bg-papel px-5 py-4">
        <Lock aria-hidden className="size-6" />
        <strong className="text-[17px]">Programa cerrado. Revocamos el permiso en tu banco.</strong>
        {cierre?.cerradoEn && (
          <time dateTime={cierre.cerradoEn} className="ml-auto text-sm text-tenue">
            {formatFechaHora(cierre.cerradoEn)}
          </time>
        )}
      </div>

      {!t && <AvisoPendiente>{AVISO_TABLERO}</AvisoPendiente>}

      <section className="bloque flex items-center gap-6 rounded-2xl p-6 sm:p-8">
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <h2 className="m-0 text-lg font-bold">Nunca salió de tu cuenta</h2>
          <span className="cifra text-[44px] text-ambar [overflow-wrap:anywhere] sm:text-[64px]">{textoMonto(cierre?.nuncaSalio)}</span>
          <p className="m-0 text-[17px]">No hay nada que reintegrar: lo que no se cobró sigue en la cuenta del programa.</p>
        </div>
        <img src="/brand/tatu-logo-oscuro.svg" alt="" className="hidden size-36 shrink-0 sm:block" />
      </section>

      <div className="flex flex-wrap gap-4">
        {(
          [
            ['Autorizado', cierre?.autorizado ?? p.tope],
            ['Cobrado', cierre?.cobrado],
            ['Girado por adelantado', t?.giradoPorAdelantado],
          ] as const
        ).map(([etiqueta, valor]) => (
          <section key={etiqueta} className="flex flex-[1_1_220px] flex-col gap-1 rounded-2xl border border-linea bg-papel px-6 py-5">
            <h2 className="m-0 text-[15px] font-bold">{etiqueta}</h2>
            <span className="cifra text-[30px]">{textoMonto(valor)}</span>
          </section>
        ))}
      </div>

      {t && (
        <Tarjeta className="gap-3 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="m-0 text-lg font-bold" id="titulo-cobros">
              Resumen de cobros
            </h2>
            <Boton variante="suave" tamano="chico" className="text-enlace" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}>
              {verTodos ? 'Ocultar los cobros' : 'Ver todos los cobros'}
            </Boton>
          </div>
          <Tabla className="min-w-[520px]">
            <thead>
              <FilaEncabezado>
                <Encabezado>Resultado</Encabezado>
                <Encabezado className="text-right">Cobros</Encabezado>
                <Encabezado className="text-right">Monto</Encabezado>
              </FilaEncabezado>
            </thead>
            <tbody>
              {(
                [
                  ['Pagados a la cuenta', String(aCuenta.length), monto(aCuenta)],
                  ['Pagados en un punto', String(enPunto.length), monto(enPunto)],
                  ['Rechazados o fallidos (no movieron dinero)', String(t.rechazadosYFallidos), textoMonto(montoCero(m))],
                  ['Sin cobrar al cierre', t.sinCobrar ? plural(t.sinCobrar.cedulas, 'cédula') : '—', textoMonto(t.sinCobrar?.monto)],
                ] as const
              ).map(([a, b, c]) => (
                <Fila key={a}>
                  <Celda>{a}</Celda>
                  <Celda className="text-right">{b}</Celda>
                  <Celda className="text-right">{c}</Celda>
                </Fila>
              ))}
            </tbody>
          </Tabla>
          <p className="m-0 text-sm text-tenue">Desde ahora, todo intento de cobro se rechaza con «El programa está cerrado y ya no recibe cobros».</p>
          {verTodos && <TablaCobros cobros={t.cobros} />}
        </Tarjeta>
      )}
    </MarcoEntidad>
  )
}

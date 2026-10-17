// Pantalla E6 del prototipo: quién está en la liquidación y quién ya cobró en este programa.
// Las personas salen de GET /beneficiarios; si ya cobraron, del tablero (cuando la API lo tenga).
import { Check, Landmark } from 'lucide-react'
import { useParams } from 'react-router'
import { http } from '@/api/http'
import type { Beneficiario } from '@/api/tipos'
import { usePolling } from '@/api/usePolling'
import { Cargando, ErrorCarga, Tarjeta, Titulo, Volver } from '@/componentes/Comun'
import { MarcoEntidad } from '@/componentes/MarcoEntidad'
import { Celda, Encabezado, Fila, FilaEncabezado, Tabla } from '@/componentes/Tabla'
import { textoMonto } from '@/lib/montos'
import { rutaDelPrograma } from '@/lib/pantallas'
import { conEspacios, NOMBRE_ESTADO_PROGRAMA } from '@/lib/textos'
import { FormularioPersona } from './FormularioPersona'
import { cargarPrograma, type DatosPrograma } from './useTablero'

interface Datos extends DatosPrograma {
  personas: Beneficiario[]
}

export default function BeneficiariosPrograma() {
  const { id = '' } = useParams()
  const { datos, error, recargar } = usePolling<Datos>(
    async () => {
      const [programa, personas] = await Promise.all([cargarPrograma(id), http.get<Beneficiario[]>('/beneficiarios')])
      return { ...programa, personas }
    },
    5000,
    true,
    { clave: id },
  )

  const p = datos?.programa
  const cobros = datos?.tablero?.cobros ?? []
  // El cobro no trae la cédula completa, solo el nombre: con él se sabe quién ya cobró
  const cobro = (nombre: string) => cobros.find((c) => c.estado === 'Pagado' && c.persona.nombre === nombre)
  // Una novedad que el banco rechazó por el tope
  const fuera = (nombre: string) => cobros.find((c) => c.estado === 'Fallido' && c.motivo?.codigo === 'TopeSuperado' && c.persona.nombre === nombre)
  const yaCobraron = datos ? datos.personas.filter((x) => cobro(x.nombre)).length : 0

  return (
    <MarcoEntidad entidadId={p?.entidadId}>
      <Volver to={p ? rutaDelPrograma(p.id, p.estado) : '/entidad'}>{p?.estado === 'Borrador' ? 'Volver al borrador' : 'Tablero del programa'}</Volver>
      {error && !datos && <ErrorCarga mensaje={error} reintentar={() => void recargar()} />}
      {!datos && !error && <Cargando />}
      {datos && p && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-tenue">{p.nombre}</span>
            <div className="flex flex-wrap items-center gap-3">
              <Titulo>Beneficiarios</Titulo>
              <span className="rounded-full bg-azul px-3 py-1 text-sm font-bold text-white">{NOMBRE_ESTADO_PROGRAMA[p.estado]}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <section className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl border border-linea bg-papel px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Beneficiarios</h2>
              <span className="cifra text-[34px] sm:text-[38px]">{datos.personas.length}</span>
            </section>
            <section className="flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl border border-linea bg-papel px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Ya cobraron</h2>
              <span className="cifra text-[34px] sm:text-[38px]">{datos.tablero ? yaCobraron : '—'}</span>
              <span className="text-sm text-tenue">de {datos.personas.length} personas</span>
            </section>
            <section className="bloque flex min-w-0 flex-[1_1_220px] flex-col gap-1.5 rounded-2xl px-[22px] py-5">
              <h2 className="m-0 text-base font-bold">Tope del permiso</h2>
              <span className="cifra text-[34px] text-ambar sm:text-[38px]">{textoMonto(datos.tablero?.autorizado ?? p.tope)}</span>
              <span className="text-sm text-noche-tenue">Quien llegue después queda fuera del tope</span>
            </section>
          </div>

          <Tarjeta className="gap-3.5">
            <h2 className="m-0 text-xl font-bold">Agregar persona</h2>
            <FormularioPersona alRegistrar={() => void recargar()} />
          </Tarjeta>

          <Tarjeta className="gap-3.5">
            <h2 className="m-0 text-xl font-bold">Lista</h2>
            <Tabla apilada className="md:min-w-[640px]">
              <thead>
                <FilaEncabezado>
                  <Encabezado>Cédula</Encabezado>
                  <Encabezado>Nombre</Encabezado>
                  <Encabezado>Cuenta</Encabezado>
                  <Encabezado className="text-right">Valor</Encabezado>
                  <Encabezado>Estado</Encabezado>
                </FilaEncabezado>
              </thead>
              <tbody>
                {datos.personas.length === 0 && (
                  <Fila>
                    <Celda colSpan={5} className="text-tenue">
                      Todavía no hay personas registradas.
                    </Celda>
                  </Fila>
                )}
                {datos.personas.map((x) => {
                  const c = cobro(x.nombre)
                  const f = !c ? fuera(x.nombre) : undefined
                  return (
                    <Fila key={x.cedula}>
                      <Celda etiqueta="Cédula" className="font-bold">
                        {conEspacios(x.cedula)}
                      </Celda>
                      <Celda etiqueta="Nombre">{x.nombre}</Celda>
                      <Celda etiqueta="Cuenta" className="max-md:flex-wrap">
                        <span className="mono text-[13px]">{x.billeteraCorta ?? '—'}</span>
                        {x.estadoCuenta && x.estadoCuenta !== 'Verificada' && <div className="text-sm text-tenue max-md:basis-full">Cuenta sin verificar</div>}
                      </Celda>
                      <Celda etiqueta="Valor" className="text-right font-bold">
                        {textoMonto(f?.monto ?? p.montoPorPersona)}
                      </Celda>
                      <Celda etiqueta="Estado" className="max-md:flex-wrap">
                        {c ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-nota px-2.5 py-1 text-[13px] font-bold text-tinta-suave">
                            <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
                            Ya cobrado
                          </span>
                        ) : f ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rechazo-fondo px-2.5 py-1 text-[13px] font-bold text-rechazo">
                            <Landmark aria-hidden className="size-3.5" strokeWidth={2.5} />
                            Fuera del tope
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border-2 border-pagando bg-pagando-fondo px-2.5 py-1 text-[13px] font-bold text-pagando">Disponible</span>
                        )}
                        <div className="mt-1 text-sm text-tenue">{c ? c.referencia : f ? 'Novedad agregada después de aprobar' : x.tienePin ? 'Puede cobrar en cuenta o punto' : 'Solo cobra a su cuenta'}</div>
                      </Celda>
                    </Fila>
                  )
                })}
              </tbody>
            </Tabla>
          </Tarjeta>
        </>
      )}
    </MarcoEntidad>
  )
}

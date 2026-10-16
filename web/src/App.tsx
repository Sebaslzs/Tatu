// Selector de rol sin login (HU-19, AD-15) y montaje del grupo de vistas de cada rol.
import { Button } from '@/componentes/ui/button'
import { useRol, type Rol } from '@/contexto/Rol'
import { VistaBeneficiario } from '@/vistas/beneficiario/VistaBeneficiario'
import { VistaEntidad } from '@/vistas/entidad/VistaEntidad'
import { VistaPunto } from '@/vistas/punto/VistaPunto'

const OPCIONES: { rol: Rol; etiqueta: string }[] = [
  { rol: 'entidad', etiqueta: 'Entidad' },
  { rol: 'beneficiario', etiqueta: 'Beneficiario' },
  { rol: 'punto', etiqueta: 'Punto de pago' },
]

const VISTAS: Record<Rol, () => React.JSX.Element> = {
  entidad: VistaEntidad,
  beneficiario: VistaBeneficiario,
  punto: VistaPunto,
}

export default function App() {
  const { rol, elegirRol } = useRol()
  const Vista = rol ? VISTAS[rol] : null

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tatú</h1>
        {rol && (
          <Button variant="ghost" size="sm" onClick={() => elegirRol(null)}>
            Cambiar rol
          </Button>
        )}
      </header>

      {Vista ? (
        <Vista />
      ) : (
        <section className="flex flex-col gap-3">
          <p className="text-muted-foreground">¿Con qué rol quieres entrar?</p>
          {OPCIONES.map(({ rol, etiqueta }) => (
            <Button key={rol} size="lg" onClick={() => elegirRol(rol)}>
              {etiqueta}
            </Button>
          ))}
        </section>
      )}
    </main>
  )
}

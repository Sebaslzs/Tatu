# Plan — Vista de inicio y acceso por rol

> Alcance pedido: **solo** la pantalla de inicio (elegir rol) y el acceso de cada rol, tal cual
> `tatu-prototipo-2.html`, con los recursos de `web/public/brand`. Nada de lo que viene después del
> botón **Entrar**.

## Pantallas del prototipo que entran

| Prototipo | Ruta (Especificación § 9.5) | Qué tiene |
|---|---|---|
| `Main` · Elegir rol | `/` | Etiqueta "Dinero de prueba", logo, "Tatú", frase, 3 tarjetas (Entidad, Beneficiaria, Punto de retiro), enlace "Punto de retiro en computador" y nota de Jorge |
| `LD1` · Entidad | `/entrar/entidad` | Panel azul noche con logo oscuro y mensaje + formulario de NIT |
| `L1` · Beneficiaria | `/entrar/beneficiario` | Formulario de cédula y nota de seguridad |
| `L2` / `LD2` · Punto | `/entrar/punto` | Buscador + lista de puntos (radio) + "Entrar como …". Versión celular por debajo de 960 px y versión computador por encima, como hace el prototipo |

Fuera: el menú lateral de pantallas, los toasts y todas las pantallas P*, PD*, B*, E*.

## Frontend

**Base (decidido: `develop`).** El andamiaje React 19 + Vite + Tailwind 4 + shadcn solo existía en
`origin/feature/project-initialization`. Se copiaron a `develop` sus archivos de `web/` y los de la
raíz del workspace (`package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.nvmrc`) **sin cambios**,
para que al fusionar con esa rama no haya conflicto salvo en lo que esta tarea toca (`index.css`,
`index.html`, `App.tsx`, `main.tsx`, `contexto/Rol.tsx`, `web/package.json`). El servidor no se trajo.

1. **Identidad (`web/src/index.css`).** Reemplazar Geist por **Archivo Variable** (con eje `wdth`,
   el prototipo usa `font-stretch: 125%` en títulos) y declarar los colores del prototipo como tokens:
   Arena `#F5F0E6`, Noche `#13203A`, Azul `#2E5FE0`, Ámbar `#F6A623`, Papel `#FFFDF8`,
   Borde `#E2D8C4`, Tinta suave `#4A5468`, Borde de campo `#8F8571`, Nota `#EDE5D3`,
   Texto del panel `#D9D2C3`. Foco visible azul de 3 px como en el prototipo.
2. **Logos.** `tatu-logo-claro.svg` sobre arena, `tatu-logo-oscuro.svg` en el panel noche,
   `tatu-icono-pequeno.svg` como favicon. (El prototipo trae PNG incrustados; se usan los SVG de
   `brand`, que son los mismos dibujos.)
3. **Rutas.** `react-router` con las 4 rutas de arriba. "Cambiar de rol" vuelve a `/`.
4. **Componentes** (`web/src/vistas/inicio/`): `ElegirRol`, `EntrarEntidad`, `EntrarBeneficiario`,
   `EntrarPunto`, más piezas compartidas (`MarcaTatu`, `EtiquetaPrueba`, `VolverARol`,
   `PanelMarca` para la mitad azul). Medidas, radios y textos copiados del prototipo.
5. **Validación mínima en el cliente.** NIT: 8–10 dígitos + guion + DV (se aceptan espacios al
   escribir). Cédula: solo números. Punto: uno seleccionado. **Sin datos del prototipo**: campos
   vacíos, sin "Dinero de prueba", sin Ana, Tienda Marta ni Jorge, y sin la frase de la portada.
6. **Después de Entrar.** Se guarda el rol con el `ProveedorRol` que ya existe y se navega a
   `/entidad`, `/beneficiario` o `/punto`, que siguen mostrando los marcadores actuales
   (`VistaEntidad`, etc.). No se construye nada más.

## Backend

Nada nuevo. La lista de puntos sale de `GET /api/puntos` (ya existe en el servidor), con estados de
carga, error con reintento y lista vacía; el id del punto elegido queda en `sessionStorage`
(`tatu.punto`). Validar la cédula contra `/api/beneficiarios/demo` y el NIT contra la entidad queda
para cuando se construyan las vistas internas.

## Hallazgos (para revisar en la documentación)

- **Contradicción:** la Especificación § 9.5 pide NIT **+ PIN de 6 dígitos** para la entidad; el
  prototipo solo pide NIT. Se sigue el prototipo.
- **Contradicción:** la especificación dice "Beneficiario"; el prototipo dice "Beneficiaria" (Ana).
  Se sigue el prototipo en los textos; la ruta queda `/entrar/beneficiario`.
- **Fuente:** el andamiaje usa Geist; la especificación y el prototipo usan Archivo. Se cambia.
- **Rama:** `main` tiene la base de datos pero no `web/`; el front vive solo en
  `feature/project-initialization`.

## Verificación

`pnpm install`, `pnpm --filter web typecheck` y `build`; abrir en el navegador a 375 px y 1280 px y
comparar cada pantalla con el prototipo; probar los cuatro "Entrar" y "Cambiar de rol".

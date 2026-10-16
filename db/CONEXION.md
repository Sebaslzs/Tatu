# Conectarse a la base de Tatú

La base está en **Supabase**, proyecto `ihbhwslbudtczcxrpefr`, con el esquema de
[`esquema.sql`](./esquema.sql).

> **La contraseña nunca va en el repo, en el chat del equipo ni en capturas.** Se pide por mensaje
> privado y vive solo en tu `.env` (que git ignora) o en tu gestor de contraseñas.

## Datos de conexión

Usa el **pooler** de Supabase: funciona en cualquier red, también en las que no tienen IPv6.

| Parámetro | Valor |
|---|---|
| Host | `aws-0-us-east-1.pooler.supabase.com` |
| Puerto | `5432` (modo sesión) o `6543` (modo transacción) |
| Base | `postgres` |
| Usuario | `postgres.ihbhwslbudtczcxrpefr` (usuario + id del proyecto) |
| Contraseña | Pídela por privado al responsable de la base |
| SSL | Obligatorio (`require`) |

Cadena de conexión (reemplaza `<CONTRASEÑA>`):

```
postgresql://postgres.ihbhwslbudtczcxrpefr:<CONTRASEÑA>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

| Puerto | Modo | Cuándo usarlo |
|---|---|---|
| `5432` | Sesión | **Por defecto**: el backend en tu PC o en un servidor, pgAdmin, `psql` |
| `6543` | Transacción | Funciones *serverless* (Vercel) con muchas conexiones cortas. No admite sentencias preparadas con nombre |

Si la contraseña tiene símbolos, codifícalos en la cadena: `@` → `%40`, `#` → `%23`, `/` → `%2F`,
`:` → `%3A`, `%` → `%25`, `?` → `%3F`, `&` → `%26`.

### Conexión directa (solo IPv6)

`db.ihbhwslbudtczcxrpefr.supabase.co:5432`, usuario `postgres`. En el plan gratuito esta dirección
solo tiene IPv6: en redes sin IPv6 no conecta. Úsala solo si tu red tiene IPv6.

## Guardarla en `.env`

En la carpeta del backend, un archivo `.env`:

```bash
DATABASE_URL=postgresql://postgres.ihbhwslbudtczcxrpefr:<CONTRASEÑA>@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

El `.gitignore` del repo ya excluye `.env`. Antes de cada commit, revisa con `git status` que no
aparezca.

## Probar la conexión

**psql:**

```bash
psql "$DATABASE_URL" -c "select count(*) as tablas from information_schema.tables where table_schema = 'public';"
```

Debe responder `13`.

**Node (`pg`):**

```js
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },   // Supabase exige TLS
  max: 5,                               // el plan gratuito permite pocas conexiones
});
```

**pgAdmin:** *Add New Server* → pestaña **Connection** con los datos de la tabla; en
**Parameters**, *SSL mode* = `require`.

## Variables del frontend (Next.js)

Para el cliente de Supabase en el frontend, en `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ihbhwslbudtczcxrpefr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_z0Q6Y1140wYiV1bhOyEgjA_3gD5KiAh
```

- **La publishable key es pública por diseño:** va dentro del código que descarga el navegador, por
  eso puede estar aquí. Supabase la protege con RLS.
- **La secret key (`sb_secret_…`, antes `service_role`) nunca va al frontend ni al repo:** salta
  todo el RLS. Solo en el `.env` del backend, si alguna vez se necesita.
- **Con esta llave el navegador no ve ninguna tabla de Tatú:** todas tienen RLS sin políticas.
  Sirve para servicios de Supabase como Storage o Realtime, no para leer o escribir programas,
  cobros ni beneficiarios. Esos datos se piden siempre a nuestro backend.

## Skills de Supabase para asistentes de IA

Si programas con un asistente de IA (Claude Code, Cursor u otro compatible con *agent skills*),
instala las skills oficiales de Supabase en la carpeta del proyecto:

```bash
npx skills add supabase/agent-skills
```

Le dan al asistente buenas prácticas de Supabase y PostgreSQL. Necesita Node.js con `npx`.

Ojo: esas skills asumen el uso típico de Supabase, con `supabase-js` y políticas de RLS por
usuario. **En esta base mandan las reglas de abajo**: la Data API está apagada y todo pasa por
nuestro backend. Si el asistente propone consultar las tablas desde el navegador o crear
políticas de RLS, no aplica para Tatú.

## Reglas de esta base

- **Todas las tablas tienen RLS** sin políticas: la API pública de Supabase (`supabase-js` con la
  llave `anon`) no ve nada, a propósito. Todo pasa por nuestro backend con esta cadena de conexión.
- **Solo la publishable key es pública.** La secret key (`service_role`) nunca se comparte: salta
  toda la seguridad.
- **Los cambios de esquema van en un script nuevo** en `db/`, nunca editando a mano en Supabase:
  así la base y el repo no se desalinean.
- **El usuario `postgres` tiene todos los permisos.** Antes de producción, el backend debe usar un
  rol propio con permisos mínimos.

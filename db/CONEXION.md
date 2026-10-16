# Conectarse a la base de Tatú

La base está en **Supabase**, proyecto `ihbhwslbudtczcxrpefr`, con el esquema de
[`esquema.sql`](./esquema.sql).

> **La contraseña nunca va en el repo, en el chat del equipo ni en capturas.** Se pide por mensaje
> privado y vive solo en tu `.env` (que git ignora) o en tu gestor de contraseñas.

## Datos de conexión

| Parámetro | Valor |
|---|---|
| Host | `db.ihbhwslbudtczcxrpefr.supabase.co` |
| Puerto | `5432` |
| Base | `postgres` |
| Usuario | `postgres` |
| Contraseña | Pídela por privado al responsable de la base |
| SSL | Obligatorio (`require`) |

Cadena de conexión (reemplaza `<CONTRASEÑA>`):

```
postgresql://postgres:<CONTRASEÑA>@db.ihbhwslbudtczcxrpefr.supabase.co:5432/postgres
```

Si la contraseña tiene símbolos, codifícalos en la cadena: `@` → `%40`, `#` → `%23`, `/` → `%2F`,
`:` → `%3A`, `%` → `%25`, `?` → `%3F`, `&` → `%26`.

### Si no conecta: usa el pooler

Esta es la **conexión directa**. En el plan gratuito de Supabase solo funciona en redes con
**IPv6**; en muchas redes de casa u oficina (IPv4) falla con un error de host o de tiempo de espera.
En ese caso usa la cadena del **Session pooler**: en Supabase, botón **Connect** → *Connection
string* → **Session pooler**. Su usuario es `postgres.ihbhwslbudtczcxrpefr` y su host termina en
`pooler.supabase.com`.

## Guardarla en `.env`

En la carpeta del backend, un archivo `.env`:

```bash
DATABASE_URL=postgresql://postgres:<CONTRASEÑA>@db.ihbhwslbudtczcxrpefr.supabase.co:5432/postgres
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
- **No compartas las llaves `anon` ni `service_role`** del proyecto: no se usan, y la `service_role`
  salta toda la seguridad.
- **Los cambios de esquema van en un script nuevo** en `db/`, nunca editando a mano en Supabase:
  así la base y el repo no se desalinean.
- **El usuario `postgres` tiene todos los permisos.** Antes de producción, el backend debe usar un
  rol propio con permisos mínimos.

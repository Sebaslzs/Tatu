# Prompts · Rol 1

## 2026-10-16 · Inicialización del proyecto

**Herramienta:** Claude Code (Claude Opus 5.5)

```text
Incializar el proyecto (sin especificar versiones, es decir, utiliza las ultimas lts) de acuerdo a lo que necesita en archivos como estructura y arquitectura (ambos son de md). Y cuando termines y esté correcto, agregalo al archivo AI USAGE necesario.
```

**Resultado:** monorepo pnpm con `server/` y `web/` según `docs/Estructura del proyecto.md` y el
Documento de Arquitectura. Ver la primera fila de [AI_USAGE.md](../AI_USAGE.md).

## 2026-10-16 · Épica 1: Conexión del subsidio (solo backend)

**Herramienta:** Claude Code

```text
Necesito que apliques a partir de ahora para todo lo del codigo SOLID, DRY y buenas prácticas de código para el back y el front, necesito que implementes los test de acuerdo a los criterios de aceptación de la épica 1. También deja esta info en el ai usage.

No crees el sql, necesito que sea de acuerdo a lo de esta conexión a Supabase (la cadena de conexión se entregó por el chat y vive solo en el .env, que no se sube al repositorio).

Necesito que sea únicamente de backend lo que estabas haciendo, nada de web.
```

**Resultado:** HU-01, HU-02 y HU-03 en `server/` con pruebas por criterio de aceptación. Ver la
segunda fila de [AI_USAGE.md](../AI_USAGE.md).

## 2026-10-16 · Swagger de la épica 1

**Herramienta:** Claude Code

```text
Agrega swagger bien documentado de eso
```

**Resultado:** documento OpenAPI 3.1 y Swagger UI en `/api/docs`, con pruebas de contrato. Ver la
tercera fila de [AI_USAGE.md](../AI_USAGE.md).

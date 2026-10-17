# Prompts · Rol 1 (Juan Pablo Méndez)

Prompts enviados a Claude Code en las tareas de programación más importantes, en el orden en que se
hicieron. Se corrigieron la ortografía y la redacción conservando lo que se pidió. Las tareas se
basaron en la documentación que el equipo escribió antes de programar (carpeta `docs/`): estructura
del proyecto, documento de arquitectura con la definición de tecnologías, especificación de
implementación, historias de usuario con sus criterios de aceptación y contrato de endpoints.

## 1. Inicialización del proyecto

```text
Revisa en WSL el directorio ~/tatu e inicializa el proyecto sin especificar versiones, es decir, con
las últimas LTS, de acuerdo con lo que piden nuestros documentos de estructura del proyecto y de
arquitectura, incluida la definición de tecnologías.
```

## 2. Estándares de código y épica 1

```text
A partir de ahora aplica SOLID, DRY y buenas prácticas de código en todo, tanto en el backend como en
el frontend. Implementa las pruebas de acuerdo con las historias de usuario y los criterios de
aceptación de la épica 1.
```

```text
Lo que estabas haciendo debe ser únicamente del backend, nada de la web.
```

```text
Agrega Swagger bien documentado de los endpoints implementados.
```

## 3. Backend por módulos

```text
Implementa el backend según nuestras historias de usuario, la arquitectura y la especificación de
implementación, aplicando Swagger, SOLID y DRY
```

## 4. Contrato de la API

```text
Verifica que los endpoints implementados estén de acuerdo con nuestro archivo Endpoints.md.
```

```text
Deja la API como especifica Endpoints.md en todo lo que se pueda, pero en lo que el frontend ya está
conectado correctamente a la API, ajusta las respuestas del backend para que coincidan con lo que el
frontend espera y no haya problemas.
```

## 5. Integración con develop

```text
GitHub dice que no puede hacer el merge automático entre mi rama y develop. Corrige ese merge para
poder enviarla a develop.
```

## 6. Biometría simulada en el punto

```text
Implementa la verificación biométrica de acuerdo con el plan de biometría simulada en el punto que
escribió el equipo. Intégrala bien, evitando problemas o comportamientos raros.
```

```text
Lo probé en /punto/cobros: la cámara sí abre, pero el cobro se queda en PorConfirmar, y con la huella
pasa lo mismo.
```

## 7. Permisos que se vencen solos

```text
Haz un monitor que rastree cuánto tiempo dura activo un permiso sobre una wallet para retirar, cuánto
tarda en vencer y por qué. El programa que vamos a usar para estas pruebas es «v3 subsidio d17».
```

```text
Lo creé y aprobé desde el despliegue en Vercel. Dime qué variables revisar allá y corrige la
clasificación del error 401 de firma.
```

```text
Tengo entendido que la wallet que usamos ya implementa Rafiki y maneja los tokens, pero nuestra API
está haciendo de nuevo el proceso con ese token, y creo que entran en conflicto; por eso se vencen
los permisos de los subsidios. Revisa si en nuestro código hay alguna parte donde pongamos a rotar
ese token.
```

```text
Realiza ese arreglo.
```

## 8. Pagos duplicados

```text
Revisa por qué en las transacciones de la Interledger Test Wallet aparecen, para un mismo cobro, una
transacción COMPLETED y dos PENDING.
```

## 9. Mapa de endpoints

```text
Realiza un mapeo completo de los endpoints que tenemos implementados actualmente en el proyecto y
genera el reporte.
```

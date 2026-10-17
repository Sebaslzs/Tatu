# Prompts · Rol backend-payments (modelo de base de datos)

Registro de los prompts usados con un asistente de IA para diseñar, documentar y desplegar la base de
datos de Tatú. Se presentan en el orden en que se escribieron, agrupados por fase, con el resultado de
cada uno y el entregable que produjo.

| Dato | Valor |
|---|---|
| Proyecto | Tatú · Hackathon Open Payments (Interledger) |
| Rol | Modelo de base de datos (backend-payments) |
| Asistente | Claude Code (Anthropic), modelo Claude Opus |
| Período | 7 al 16 de octubre de 2026 |
| Entregables | [`db/esquema.sql`](../db/esquema.sql), [`db/README.md`](../db/README.md), [`db/CONEXION.md`](../db/CONEXION.md), [`db/modelo-datos.svg`](../db/modelo-datos.svg) |

**Criterios de este registro**

- El texto de cada prompt es el original, con correcciones de ortografía, tildes y puntuación que
  no cambian lo que se pidió.
- **Las credenciales se omitieron:** contraseñas, cadenas de conexión con contraseña y correos
  personales aparecen como `[omitida]`. Nunca se subieron al repositorio.
- Las capturas de pantalla que acompañaron algunos prompts se describen entre corchetes.
- "Resultado" resume lo que respondió o hizo el asistente.

## Índice

1. [Contexto del proyecto y diagrama inicial](#fase-1--contexto-del-proyecto-y-diagrama-inicial)
2. [Módulo de entidades y usuarios](#fase-2--módulo-de-entidades-y-usuarios)
3. [Contraste con las historias de usuario](#fase-3--contraste-con-las-historias-de-usuario)
4. [Guía de conexión y verificación](#fase-4--guía-de-conexión-y-verificación)
5. [Cobros parciales de subsidios](#fase-5--cobros-parciales-de-subsidios)
6. [Verificación de las historias](#fase-6--verificación-de-las-historias)
7. [Carpeta db en todas las ramas](#fase-7--carpeta-db-en-todas-las-ramas)
8. [Decisiones que salieron de los prompts](#decisiones-que-salieron-de-los-prompts)

---

## Fase 1 · Contexto del proyecto y diagrama inicial

### Prompt 1.1 · Prompt maestro

[Adjunto: documento «Historias de Usuario — Justo a Tiempo» (.docx), versión del 30 de septiembre.]

```text
PROMPT MAESTRO — CONTEXTO COMPLETO DEL PROYECTO COLSUBSIDIO, OPEN PAYMENTS, INTERLEDGER Y MODELADO DE BASE DE DATOS

1. INSTRUCCIONES PARA LA INTELIGENCIA ARTIFICIAL
Quiero que actúes como un arquitecto de software senior, especialista en diseño de bases de datos
financieras, sistemas transaccionales, PostgreSQL, Open Payments, Interledger Protocol (ILP), Rafiki,
integraciones bancarias y sistemas de pagos interoperables.
Tu función principal será ayudarme a diseñar, analizar, documentar, validar y eventualmente
implementar el modelo de base de datos de un proyecto relacionado con Colsubsidio y la integración
de Open Payments e Interledger.
Mi responsabilidad principal dentro del equipo es diseñar el modelo de base de datos.
Por lo tanto, quiero que priorices: levantamiento de requisitos de información, identificación de
entidades, atributos y tipos, relaciones, cardinalidades y opcionalidad, claves primarias y
foráneas, normalización, modelo conceptual, lógico y físico, esquemas en PostgreSQL, integridad
referencial, restricciones de negocio, historial de operaciones, auditoría financiera, idempotencia
y prevención de pagos duplicados, transacciones concurrentes, persistencia de integraciones
externas, seguridad y protección de datos personales, índices, escalabilidad, diagramas
entidad-relación, scripts SQL, migraciones y pruebas de integridad.
No quiero que te limites a generar tablas. Necesito que me ayudes a comprender por qué existe cada
entidad, cómo se relaciona con las demás, qué información debe almacenar y qué reglas de negocio
debe garantizar la base de datos. Cuando falte información, debes identificarla explícitamente en
lugar de inventar requisitos.

2. CONTEXTO GENERAL DEL PROYECTO
Estamos trabajando en una iniciativa tecnológica relacionada con Colsubsidio, entidades financieras
afiliadas o participantes, Open Payments e Interledger. La idea planteada inicialmente es
desarrollar una solución para gestionar cobros de Colsubsidio directamente con bancos afiliados.
Existen al menos tres posibilidades: Escenario A, recaudos bancarios; Escenario B, desembolsos;
Escenario C, plataforma mixta. Estas son posibilidades de análisis, no requisitos confirmados.
También debemos distinguir entre los bancos integrados, los usuarios afiliados, los beneficiarios
de subsidios, los titulares de cuentas bancarias y los operadores de servicios financieros.

3. TECNOLOGÍAS PRINCIPALES
3.1 Open Payments: Wallet Address, Authorization Server, Resource Server, Grant, Access Token,
Incoming Payment, Outgoing Payment, Quote, Interactive Grant y Client. Es importante distinguir los
identificadores de Open Payments de los identificadores internos de nuestra base de datos.
3.2 Interledger Protocol: interoperabilidad, rutas de pago, cuentas de origen y destino, activos y
monedas, identificadores de transacción, estados, errores, confirmaciones, conciliación y
liquidación entre participantes. No debemos asumir que Interledger elimina automáticamente los
mecanismos de compensación y liquidación bancaria.
3.3 Rafiki: implementación open source; su presencia es una posibilidad técnica, no una decisión.
Debemos distinguir nuestra base de negocio, las bases internas de Rafiki, los recursos de
proveedores externos y los registros de conciliación y auditoría.

4. ARQUITECTURA CONCEPTUAL PROPUESTA
Colsubsidio → plataforma de orquestación → reglas de negocio → autorización y permisos → Open
Payments → Interledger / Rafiki o adaptadores → bancos → cuentas de origen y destino. El dinero no
necesariamente pasaría por la plataforma: nuestra aplicación orquestaría y las entidades
financieras ejecutarían.

5. DOCUMENTO DE REFERENCIA COMPARTIDO
«Historias de Usuario — Justo a Tiempo» (30 de septiembre de 2026): una capa de distribución que
convierte liquidaciones aprobadas en pagos ejecutados bajo demanda. El dinero sale solo cuando se
produce un evento válido de cobro (subsidio, compra con bono, hito certificado). No debemos asumir
que todas sus historias serán implementadas en el proyecto real.

6. ALCANCE DEL PROTOTIPO
Subsidio de $230.000, tres beneficiarios de prueba (dos con cuenta, uno sin celular que cobra en un
punto), total autorizado $690.000, cuentas simuladas. Excluye dinero real, custodia de fondos,
biometría real, efectivo físico, cajas de establecimientos, app nativa, SMS y decisiones de
elegibilidad.

7. ACTORES: entidad financiadora, beneficiario con cuenta, beneficiario sin cuenta o sin celular,
punto de retiro, comercio autorizado, supervisor de contrato y sistemas externos.

8. HISTORIAS DE USUARIO: 25 historias en siete épicas (E1 a E7), del flujo de subsidio (HU-01 a
HU-20) a los extras (HU-21 a HU-25). No quiero que descartes una historia sin revisar primero sus
implicaciones sobre el modelo de datos.

9. MODELO DE DATOS ORIGINAL: seis tablas (programa, punto, programa_punto, cuenta_beneficiario,
cobro, evento) con sus atributos y estados.

10. RELACIONES DEL MODELO ORIGINAL: programa–cobro, programa–punto, punto–cobro,
cuenta_beneficiario–cobro (por documento) y evento con campos genéricos.

11. REGLAS DE NEGOCIO RN-01 a RN-13: disponibilidad, prevención del doble cobro, destino, cuenta
verificada, cálculo del monto, vigencia, confirmación con PIN, tope, control del límite,
confirmación de pago, manejo de cantidades, expiración y contratos por hitos.

12. MANEJO DE MONTOS: enteros en unidades mínimas con assetCode y assetScale; BIGINT; nunca coma
flotante.

13. CICLO DE VIDA: Solicitado → (PorConfirmar) → Pagando → Pagado, con Rechazado y Fallido. La base
debe identificar una operación pendiente de confirmación y no asumir que falló por agotarse el
tiempo de respuesta.

14. IDEMPOTENCIA, CONCURRENCIA Y DOBLE COBRO: dos solicitudes concurrentes no deben generar dos
cobros válidos; un reintento no debe generar un segundo desembolso; la plataforma debe diferenciar
error definitivo de resultado desconocido. La base de datos debe colaborar activamente en la
garantía de integridad.

15. AUTORIZACIONES OPEN PAYMENTS · 16. REGISTROS DE PAGOS · 17. AUDITORÍA Y TRAZABILIDAD ·
18. INFORMACIÓN PERSONAL Y SEGURIDAD · 19. POSIBLE ADAPTACIÓN A COLSUBSIDIO · 20. DIFERENCIA ENTRE
COBRO, PAGO Y MOVIMIENTO FINANCIERO · 21. POSTGRESQL COMO TECNOLOGÍA DE REFERENCIA.

22. ENTREGABLES: análisis de requisitos, inventario de entidades, diccionario de datos, modelo
conceptual, modelo lógico, normalización, modelo físico, script SQL, datos de prueba, pruebas de
integridad, documentación técnica y matriz de trazabilidad.

23. ASPECTOS CRÍTICOS: separación entre negocio e integración, independencia del proveedor,
estados consistentes, idempotencia, concurrencia, trazabilidad, seguridad, normalización,
extensibilidad, simplicidad, conciliación y consistencia financiera.

24. RIESGOS · 25. CRITERIOS DE CALIDAD · 26. LIMITACIONES ACTUALES DE LA INFORMACIÓN (no inventar
respuestas; ayudar a formular preguntas).

27. FORMA DE TRABAJO: comprensión del negocio, entidades, relaciones, atributos, reglas de
integridad, normalización, diagramación, modelo físico, pruebas y documentación. No avances
automáticamente a crear el esquema definitivo sin revisar primero el modelo lógico conmigo.

28. FORMATO DE LAS RESPUESTAS: requisito, entidades, datos, relaciones y cardinalidades,
restricciones, impacto en Open Payments o Interledger, riesgos, propuesta, justificación y
preguntas pendientes.

29. REGLAS ESPECIALES: no asumir arquitectura aprobada ni que todos los bancos ofrecen Open
Payments; no confundir wallet address con cuenta bancaria, autorización con transferencia ni cobro
con desembolso; no marcar pagos como completados sin confirmación; no confiar en el frontend para
validar montos; no almacenar contraseñas, PIN ni secretos de manera insegura; no usar identificadores
personales como claves primarias sin evaluar las consecuencias; no generar estructuras que permitan
un doble pago por condiciones de carrera; distinguir siempre entre documentación original,
hipótesis y recomendaciones técnicas.

30. OBJETIVO FINAL: un modelo de base de datos robusto y profesional, que pueda justificar tabla por
tabla ante desarrolladores, arquitectos y líderes técnicos.

31. PRIMERA TAREA: analizar las seis tablas del documento original: función de cada tabla,
relaciones, problemas, riesgos en un escenario bancario real, información faltante para
Colsubsidio, qué tablas mantener, cuáles modificar, qué entidades nuevas podrían hacer falta,
seguridad y concurrencia, y preguntas para el equipo. No generes todavía el modelo físico completo.
```

*Nota: el prompt original tenía 31 secciones con más detalle; aquí se conservan sus instrucciones y
restricciones completas y se resumen las secciones descriptivas que repetían el documento de
historias.*

**Resultado:** análisis de las seis tablas con 13 hallazgos (el más grave: un cobro `Fallido` libera
la cédula y puede causar doble pago tras un timeout), riesgos de llevarlo a un banco real, tablas a
mantener o modificar, entidades candidatas y 15 preguntas para el equipo.

### Prompt 1.2 · Diagrama inicial

```text
Muéstrame una imagen de la base de datos con sus ítems.
```

**Resultado:** diagrama entidad-relación de las seis tablas del modelo original, con columnas,
tipos, llaves y relaciones. Fue el punto de partida del modelo que se ajustó en las fases
siguientes.

---

## Fase 2 · Módulo de entidades y usuarios

### Prompt 2.1

[Imagen del diagrama con un módulo nuevo: `entidad`, `usuario` y `sesion`.]

```text
Hice un ligero cambio en la base de datos; te lo voy a mostrar. El cambio es básicamente lo que
manejarán las entidades y los diferentes usuarios que las representan. Analízalo.
```

**Resultado:** análisis del módulo: guardar el token de sesión como hash, correo único sin distinguir
mayúsculas, protección contra fuerza bruta, retención de IP y aislamiento entre entidades.

### Prompts 2.2 y 2.3

```text
Ajústalo; pásame el MD y una imagen de cómo quedaría la base de datos.

Adicional: en entidad, retira el NIT y cámbialo por documento; según leí, en Colombia las
entidades públicas no poseen NIT.
```

```text
Pero cámbialo por documento.

1. ¿Este cambio ya lo aplicaste en Supabase, o por ahora es solo el diagrama?
Solo en el diagrama.

2. ¿El cajero del punto será un usuario con login? (punto 6)
Explícame esto del cajero del punto: ¿a qué te refieres?
```

**Resultado:** `entidad` identificada con `tipo_documento` + `documento`, documento del módulo e
imagen del modelo completo.

---

## Fase 3 · Contraste con las historias de usuario

### Prompts 3.1 y 3.2

```text
El MD debe explicar todo de la base de datos, no solo lo nuevo.

Te adjunto el repo donde subiremos toda la información de la base de datos:
https://github.com/Sebaslzs/Tatu.git
Todo con mi usuario theoclas.
La idea es subir el script cuando ya definamos cómo va a quedar la base de datos.
```

```text
Valida en el repo las historias de usuario (el archivo se llama criterios de aceptación),
contrástalas con la base de datos y analízalo detenidamente.
```

**Resultado:** comparación de las 25 historias de `HU-Criterios.md` con la base real (incluidas las
migraciones que había agregado el backend del equipo): 16 cubiertas, 8 con observaciones y 1 sin
cubrir (contrato por hitos, que es un extra).

### Prompts 3.3 y 3.4 · Decisiones

```text
1. Documenta las correcciones, mas no incluyas procesos.
2. No es a futuro: ya está aplicado, y necesito que lo hagas junto con el script para montar ya
   la base de datos.
3. Antes de comenzar, explícame lo del cajero: ¿de dónde lo estás trayendo? Nosotros no vamos a
   manejar cajero; es más una vinculación con puntos donde las personas con Open Payments puedan
   hacer retiros, y así. Para que te hagas una idea: como un corresponsal bancario.
```

```text
Ya hablé con el compadre. Te explico: lo del cajero es lo que te dije, un punto semejante a un
corresponsal bancario, a donde el cliente o el usuario se dirige a retirar su bono o subsidio,
entre otros. Guárdalo, por favor, en la explicación, y ahora sí comencemos con el desarrollo del
script y del MD para subirlos a git y comenzar.
```

**Resultado:** el "cajero" de las historias queda definido como el **punto** (corresponsal
bancario), no como un usuario. Los usuarios solo tienen roles `admin`, `operador` y `consulta`.

---

## Fase 4 · Guía de conexión y verificación

### Prompts 4.1 a 4.7

```text
[cadena de conexión directa con contraseña: omitida]

host=db.ihbhwslbudtczcxrpefr.supabase.co
port=5432
database=postgres
user=postgres

Documenta esto y súbelo a git.
```

```text
Agrega esto a la documentación de la conexión:
npx skills add supabase/agent-skills
```

```text
¿Puedes conectarte y verificar que todo se subió bien?
```

```text
Me refiero a esto:
[consulta de verificación del esquema]
```

```text
Agrega esto a la documentación de la conexión:
[variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; ver db/CONEXION.md]
```

```text
[datos del pooler: host, puerto, base y usuario; contraseña omitida]
```

```text
Súbelo a git.
```

**Resultado:** `db/CONEXION.md` sin contraseñas. Se detectó que la conexión directa de Supabase solo
tiene IPv6 y no conecta desde redes IPv4, así que la guía pasó a usar el pooler. La verificación se
abrió en la terminal del usuario para que él escribiera la contraseña.

---

## Fase 5 · Cobros parciales de subsidios

### Prompt 5.1

```text
¿Qué tan viable sería implementar un sistema que permita a los beneficiarios realizar **cobros parciales de sus subsidios**, teniendo en cuenta que utilizaremos las tecnologías **Open Payments e Interledger**?

Además, ¿qué ventajas, limitaciones y desafíos técnicos podríamos encontrar al implementar esta funcionalidad?
```

**Resultado:** viable. El permiso de Open Payments ya es un límite acumulado sin receptor fijo; el
trabajo está en la base (saldo por persona, cambio de la regla anti doble cobro). Ventajas, límites,
desafíos y una recomendación por etapa.

### Prompt 5.2

```text
¿Qué cambios se tendrían que hacer en la base de datos?
```

**Resultado:** nueve cambios: tabla `asignacion`, índice de cobro en vuelo, trigger que mueve el
saldo, monto inmutable, columnas nuevas y auditoría.

### Prompt 5.3

```text
Debemos incorporar esta nueva funcionalidad al archivo Markdown (.md), actualizando tanto la documentación como el script de la base de datos.
Es importante tener en cuenta lo siguiente:

* El script original de la base de datos ya fue ejecutado en el servidor, por lo tanto, debe permanecer completamente intacto, sin modificar ni eliminar ninguna de sus instrucciones.
* Cualquier cambio necesario, como la creación de nuevas tablas, incorporación de columnas, relaciones, restricciones o ajustes a estructuras existentes, deberá agregarse justo debajo del script original, en una nueva sección.
* Si es necesario eliminar o modificar algún elemento existente, se deben incluir las instrucciones SQL correspondientes (`ALTER`, `DROP`, etc.), sin alterar el código original.
* Los nuevos scripts deben estar diseñados para ejecutarse sobre una base de datos que ya contiene la estructura inicial, evitando conflictos por objetos existentes.
* Siempre que sea posible, los cambios deben ser seguros y reutilizables, permitiendo ejecutarlos sin generar duplicaciones ni pérdida accidental de información.
* El archivo Markdown debe documentar detalladamente cada modificación, explicando su propósito y cómo se relaciona con la funcionalidad de cobros parciales de subsidios mediante Open Payments e Interledger.

Objetivo: Mantener la compatibilidad con la base de datos actualmente desplegada y permitir su evolución mediante scripts incrementales, sin necesidad de reconstruirla desde cero ni comprometer los datos existentes.
```

**Resultado:** sección *Actualización 01* al final de `esquema.sql`, sin cambiar ninguna línea del
script original. Es incremental e idempotente. Se documentó en la sección 11 del README y se probó
con 34 pruebas sobre una base con datos.

---

## Fase 6 · Verificación de las historias

### Prompt 6.1

```text
¿Cambiaste algo en las historias de usuario originales de la Épica 1?
Quiero confirmar si se modificó, agregó o eliminó algún requisito respecto a la versión inicial y, de ser así, cuáles fueron los cambios y por qué se realizaron.
```

**Resultado:** verificado en el historial de git. El asistente no modificó `HU-Criterios.md` y la
Épica 1 está igual a la versión inicial. El único cambio al archivo lo hizo otro integrante: reemplazó
"cajero" por "el punto donde se reclama" en HU-10, HU-21 y HU-22, sin cambiar requisitos.

### Prompt 6.2

```text
Tengo una duda con respecto a HU-14, «Impedir el doble cobro», dentro del documento
HU-Criterios.md: sabiendo que implementamos el cobro parcial, ¿esta historia no afecta esa lógica
de negocio?
```

**Resultado:** la protección se mantiene: en programas no parciales el comportamiento es idéntico y
en los parciales el saldo impide cobrar más de lo asignado. Pero el texto de HU-14 quedó
desactualizado (CA-14.01 nombra el índice anterior y "cobrar dos veces" ya no aplica a programas
parciales). En el backend del equipo, una prueba espera el nombre del índice anterior y el esquema
de Drizzle todavía lo declara. Se propuso una nueva redacción de HU-14 sin editar `HU-Criterios.md`.

### Prompt 6.3

```text
Sí, agrega la nota al README de db.
```

**Resultado:** sección 11.7 del README de `db/`, «Impacto en HU-14 y en el backend»: estado de cada
criterio de HU-14, redacción propuesta, otras historias que nombran la regla anterior (CA-10.03,
CA-10.07 y HU-13) y los tres archivos del backend que hay que ajustar al adoptar la actualización.

### Prompts 6.4 y 6.5

```text
Implementa HU-14.
```

```text
No, mejor no lo hagas; dialogaré con el equipo.
```

**Resultado:** el asistente preguntó qué parte implementar (pruebas automatizadas de CA-14.05,
nuevo texto de la historia o ajustes del backend). Se decidió no hacer cambios y llevar la
propuesta de la sección 11.7 del README al equipo.

---

## Fase 7 · Carpeta db en todas las ramas

### Prompt 7.1

```text
Tengo un problemita: necesito que la carpeta db, la que tú y yo hicimos, esté en todas las ramas
creadas actualmente. El detalle es que vi que en la rama develop hay una carpeta db: elimínala y
coloca la nuestra, que está en la rama main.
```

**Resultado:** se verificó que ningún código del equipo lee los archivos de la carpeta raíz `db/`
(el backend usa `server/src/db`). En `develop` y en las tres ramas `feature/*` se reemplazó la
versión anterior (`001_esquema`, `002_datos_prueba`, `003_ajustes`) por la de `main`, y en
`produccion`, que no tenía `db/`, se agregó. Un commit por rama, sin tocar archivos fuera de
`db/`; verificado en GitHub que las seis ramas tienen la misma `db/` que `main`.

### Prompt 7.2

```text
¿Subiste a git?
```

**Resultado:** confirmación de los cinco commits subidos (uno por rama) y de que el registro de
prompts no se sube porque `prompts/` está en el `.gitignore`.

### Prompt 7.3

```text
Haré pull de los cambios de mis compañeros.
```

**Resultado:** revisión previa: `main` local ya estaba al día con GitHub y sin cambios pendientes;
el trabajo del equipo está en `develop` y en las ramas `feature/*`. Se indicó cómo cambiar de rama
y traer los cambios sin riesgo para el registro de prompts.

## Fase 8 · Frontend responsive

### Prompt 8.1

```text
Mejora el comportamiento responsive del frontend de Tatú (carpeta web/, rama develop). En el
celular debe sentirse como una aplicación móvil; en el computador, como una plataforma web
profesional, y en la tablet debe verse bien en los tamaños intermedios.

Reutiliza lo que ya existe: useEnComputador (960 px), InicioCelular / InicioEscritorio,
PantallaCelular, MarcoEntidad y PantallaPuntoEscritorio. No estires todo ni centres una columna
de celular en el computador: los formularios (PIN, enlazar la cuenta, confirmar) se quedan
compactos y centrados, y los tableros, historiales y pantallas de administración aprovechan el
espacio. Conserva la identidad visual (colores, tipografía, logos y animaciones del tatú) y no
pierdas el estado de los formularios al cambiar el tamaño o girar el dispositivo.

No modifiques el backend, la base de datos, los endpoints, los contratos de la API, los procesos
de Open Payments / Interledger, la autorización, los subsidios ni los cobros, ni las historias de
usuario. No agregues funciones que no tengan que ver con el responsive.

Primero dame un análisis breve y luego implementa. Cuando termines, revisa la aplicación en 320,
375, 430, 768, 960, 1024, 1366 y 1920 px: sin textos cortados, botones cómodos, tablas legibles,
sin scroll horizontal y con los estados de carga, error y de varios pasos. Ejecuta el typecheck,
el lint, el build y las pruebas, revisa visualmente en un navegador si es posible y déjame un
resumen de los ajustes, los archivos modificados, los componentes reutilizados y los pendientes.
```

**Resultado:** ajustes solo en `web/src`, sin tocar backend, API ni base de datos.

- Punto de corte `pc:` (960 px) en Tailwind, igual a `useEnComputador`; `md` (768 px) para tablet.
- `BarraSuperior` compartida por entidad, punto y beneficiario (en el computador).
- `PantallaAdaptable` y `PantallaBeneficiario`: un mismo árbol que solo cambia por CSS, así el
  estado no se pierde al cambiar de tamaño. Formularios a 600 px; tableros a 1200 px.
- Tablas «apiladas»: en el celular cada fila es una tarjeta con sus etiquetas.
- Punto: la cédula digitada se comparte entre la vista de celular y la de computador (contexto);
  teclado del PIN visible en pantallas táctiles grandes.
- Arreglos encontrados al verificar: lista de programas desbordada entre 768 y 960 px, tablas que
  ensanchaban la página y subtítulos que cortaban la cédula en 320 px.
- Verificado en los 8 anchos con datos simulados en el navegador (solo lectura); typecheck y build
  sin errores; lint con las mismas 6 advertencias previas; el frontend no tiene pruebas.

### Prompt 8.2

```text
Por favor no subas a git; pásame los comandos y yo los subo directamente.
```

**Resultado:** los cambios quedaron locales en `develop`; se entregaron los comandos de `git add`,
`commit` y `push` sin incluir `prompts/`.

---

## Fase 9 · Retiro parcial y venta con el retiro

### Prompt 9.1

```text
Ayúdame a implementar dos funcionalidades nuevas y relacionadas en Tatú: los retiros parciales de
subsidios y el registro de una venta durante el retiro. Trabajamos sobre la rama develop. Primero
revisa lo que ya existe: el módulo del punto de retiro, los cobros, los saldos y la integración con
Open Payments e Interledger.

Retiro parcial: si una persona tiene un subsidio de $150.000 y en el punto solo necesita $90.000, los
otros $60.000 deben quedar disponibles para después. Un mismo subsidio puede tener varios retiros
hasta agotar el saldo o hasta que venza. Solo aplica al retiro presencial en un punto autorizado; el
pago directo a la cuenta o billetera debe seguir igual.

Venta: durante un retiro, completo o parcial, el trabajador del punto puede registrar, de forma
voluntaria, que la persona compró algo en la tienda. La compra hace parte del retiro, no es un
descuento adicional. Ejemplo: subsidio $150.000, retiro $90.000, compra $50.000, efectivo que se
entrega $40.000 y saldo restante $60.000. La interfaz debe dejar muy claro ese desglose; la compra
siempre debe ser menor que el retiro. Sin venta, todo el retiro se entrega en efectivo.

Facturación: Tatú no será un software de facturación. Debe registrar los datos básicos de la venta y
enviarlos a un endpoint para que otro sistema genere la factura. Revisa qué datos tenemos y cuáles
faltarían (productos, impuestos, comprador) y propón cómo manejarlos sin complicar el retiro. El
retiro y la facturación van separados: si el retiro se completa y facturación falla, no se debe
descontar otra vez el subsidio ni repetir el pago; la venta queda guardada para reintentar sin
duplicar facturas.

Saldos: el backend y la base deben controlar cuánto se ha retirado, cuánto queda y qué operaciones se
confirmaron, sin depender del frontend, evitando retiros mayores al saldo y problemas con solicitudes
simultáneas. Un pago fallido no debe descontar saldo, y un reintento o una doble confirmación no deben
generar dos retiros. Revisa los estados de los cobros y las limitaciones de Open Payments e
Interledger: un retiro parcial no es solo cambiar el monto si eso afecta permisos, límites, estados o
conciliación.

Bonos: algunos beneficios solo sirven para compras en comercios autorizados. No habilites efectivo en
programas que no lo permiten.

Interfaz: intégralo al flujo actual del punto (consultar a la persona, ver sus subsidios, elegir el
monto y, si aplica, registrar la compra), con un resumen antes de confirmar que muestre el retiro, la
compra, el efectivo a entregar y el saldo que queda. Debe ser responsive, rápido y conservar la
identidad visual.

Base de datos: el script SQL ya se ejecutó en el servidor. No modifiques nada de lo existente; agrega
los cambios al final, de forma que corran sobre la base actual sin recrearla. Mantén sincronizados el
esquema, los modelos del backend y la documentación. Documenta las reglas en los Markdown de
arquitectura, módulos, historias de usuario y reglas de negocio, sin borrar lo que sigue siendo válido.

Primero analiza la arquitectura y luego implementa con los patrones de Tatú. Prueba el retiro completo
y el parcial, con y sin venta, el saldo insuficiente, una compra inválida, solicitudes duplicadas y
facturación caída. Al final, dame un resumen de lo implementado, los archivos modificados, los cambios
en la base, los endpoints y las pruebas.
```

**Resultado:** implementado en la rama `feature/retiro-parcial`.

- **Base:** ACTUALIZACIÓN 02 al final de `db/esquema.sql` (lo anterior intacto): todo subsidio maneja
  saldo, RN-21 (retiro en pesos enteros), RN-22 (la cuenta paga todo el saldo), RN-23 (venta menor que
  el retiro), tabla `venta` con sus estados y la venta que sigue al cobro. Probada en PostgreSQL 16
  sobre datos anteriores, ejecutada dos veces: 31 comprobaciones.
- **Backend:** saldo calculado desde los cobros y bloqueo de la asignación en la transacción; `monto`
  y `venta` en `POST /cobros`; módulo `facturacion` (contrato, cliente, simulador y servicio) con
  `Idempotency-Key`; `POST /ventas/{id}/reenviar`; saldo restante y efectivo en cada cobro; ventas
  separadas en la caja. 509 pruebas (19 nuevas).
- **Frontend:** paso «Retiro» (todo o una parte, compra opcional y desglose), desglose en la pantalla
  del PIN, «Entrega en efectivo» en la de Pagado y estado de la factura con reenvío.
- **Bonos:** sin cambios; siguen siendo de un solo uso y solo en compras.
- **Documentación:** `db/README.md` § 12, HU-26 y HU-27 en `HU-Criterios.md`, § 17 de la
  Especificación y AD-24 en la Arquitectura.

---

## Decisiones que salieron de los prompts

| Decisión | Prompt | Efecto en la base |
|---|---|---|
| Módulo de entidades y usuarios | 2.1, 3.3 | Tablas `entidad`, `usuario` y `sesion`; `programa.entidad_id` |
| `documento` en lugar de `nit` | 2.2 | `entidad.tipo_documento` + `entidad.documento` |
| El "cajero" es el punto | 3.4 | Sin rol de cajero; el punto queda en el cobro y en la auditoría |
| Correcciones documentadas, no aplicadas | 3.3 | Sección 10 del README |
| Conexión por el pooler | 4.x | `CONEXION.md` sin contraseñas, con el pooler como conexión principal |
| Cambios incrementales | 5.3 | Las mejoras van como `ACTUALIZACIÓN NN` debajo del script original |
| Cobros parciales | 5.1 a 5.3 | Tabla `asignacion` y reglas RN-19 y RN-20 |
| Una sola carpeta `db/` en todas las ramas | 7.1 | La versión de `main` reemplaza a la anterior en `develop`, `feature/*` y `produccion` |
| Responsive solo en el frontend | 8.1 | Ninguno: la base, la API y los procesos de pago no cambian |
| Retiro parcial solo en el punto y venta dentro del retiro | 9.1 | ACTUALIZACIÓN 02: saldo en todo subsidio, RN-21 a RN-23, tabla `venta`; facturación aparte con llave de idempotencia |

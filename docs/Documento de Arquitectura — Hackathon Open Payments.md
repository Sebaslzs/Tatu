# Documento de Arquitectura — Hackathon Open Payments

Oct 1, 2026 · @ITMuser

Este documento consolida la arquitectura del MVP del hackathon a partir de lo que el equipo ya decidió por escrito; lo que ninguna fuente define queda marcado como **Pendiente por definir** y se lista en la sección 5.

> **Actualizado el 14 de octubre de 2026 con el código de `piloto-v2`.** La base es PostgreSQL en Supabase (antes, SQLite en la rama `piloto`), la carpeta de la API se llama `server/` (antes `api/`) y la web y la API están desplegadas juntas en Vercel, en un solo dominio: <https://test-openpayment.vercel.app>. Lo nuevo está en la § 3.6; las decisiones que eso cerró (AD-05, AD-06, AD-13, AD-17, AD-22 y AD-23) están en la § 3.5, y los pendientes cerrados (P-02, P-03, P-14 y P-20), en la § 5.

## Cómo leer este documento

| Fuente | Versión revisada | Qué aporta a la arquitectura |
| --- | --- | --- |
| [Documento Guía — Hackathon Open Payments](https://claude.ai/code/artifact/51700d7c-2f22-4497-af66-8b3d67fba504) | Revisión 72 | Producto, alcance del MVP, arquitectura recomendada, API REST, stack, seguridad y revisión del diseño «Hexagonal + Saga» |
| [Historias de Usuario — Entrega Justo a Tiempo](https://claude.ai/code/artifact/b62529b1-12d5-489a-a239-43d2dc12bdf7) | Revisión 50 (alineada con la revisión 66 de la Guía) | 25 historias, reglas RN-01 a RN-18 (RN-14 a RN-18, llave Bre-B, del 13 de octubre), diccionario de datos, variables, RNF-01 a RNF-12 y diagramas de secuencia, estados y entidad-relación |
| Carpeta `D:\PRE-Hackathon` | 1 de octubre de 2026 | Arquitectura v2 en PDF (origen del diseño revisado en la Guía), reglas y entrega del evento, ideas iniciales; `guion.md` está vacío |
| Código de la rama `piloto-v2` | Commit `c682441` (14 de octubre de 2026), el mismo que despliega la rama `produccion` | Base de datos, acceso a datos, despliegue en Vercel y dónde vive cada módulo |

Convenciones:

- Cada afirmación cita su fuente entre paréntesis: «Guía, § sección», «HU-09», «RN-05» o «RNF-04».
- **Decidido**: lo dice la Guía o las Historias sin marcarlo como propuesto.
- **Decidido en el piloto**: lo resolvió el código de `piloto-v2`; se cita como «piloto-v2, `archivo`».
- **Propuesto**: las Historias lo marcan como «propuesto»; falta que el equipo lo confirme.
- **Pendiente por definir**: ninguna fuente lo define. No se rellena con supuestos.
- Donde la Guía y las Historias se contradicen, este documento no elige: muestra las dos versiones y lleva la diferencia a la sección 5.

# 1. Contexto del sistema

## 1.1 Nombre y propósito del sistema

El sistema es una plataforma de pagos justo a tiempo: la entidad aprueba una vez un permiso con tope sobre la cuenta del programa y la plata sale de esa cuenta solo cuando un beneficiario cobra (Guía, § Producto).

| Aspecto | Definición | Estado | Fuente |
| --- | --- | --- | --- |
| Nombre de trabajo | «Justo a Tiempo»; la Guía lo llama «programas de entrega justo a tiempo» | Decidido como nombre interno | Título de las Historias; Guía, § Producto |
| Nombre comercial y logo | Pendiente por definir. La Guía anota que un nombre y un logo recordables suman votos para el premio Comunidad | Pendiente | Guía, § Demo y pitch |
| Propósito | Ser «la capa de distribución que convierte una liquidación ya aprobada en pagos bajo demanda» | Decidido | Guía, § Resumen ejecutivo |
| Tesis | La plata pública no debería salir porque llegó la fecha, sino cuando ocurre un evento válido | Decidido | Guía, § La tesis que une todo |
| Alcance del hackathon | Un subsidio simulado de $230.000 con 3 beneficiarios de prueba, cobrado a la cuenta propia o en un punto | Decidido | Guía, § Programa de la demo |
| Extras | Bono con destino, QR con cámara, PDF417, contrato por hitos y despliegue público, en ese orden y apagables | Decidido | Guía, § Extras; HU-21 a HU-25 |

Qué no es el sistema, y por qué eso define la arquitectura:

- **No custodia dinero.** El dinero va de wallet a wallet en la Test Wallet; custodiarlo nos volvería un intermediario regulado (Guía, § Qué no usar).
- **No guarda la base de beneficiarios.** Consulta la liquidación de la entidad por cédula; en la demo, un servicio simulado (HU-02, RN-01).
- **No decide quién recibe ni cuánto.** Eso sigue siendo de la entidad (Guía, § Qué no tocamos).
- **No valida huellas ni maneja efectivo.** El MVP usa PIN; en producción la huella la valida un operador autorizado (Guía, § Alcance del MVP).

## 1.2 Problema principal que intenta resolver

Hoy la plata de un subsidio sale por fecha y no por cobro: se gira por adelantado a operadores y puntos, y lo que nadie cobra hay que conciliarlo y reintegrarlo después (Guía, § Entrega de subsidios hoy).

| Evidencia | Cifra | Fuente |
| --- | --- | --- |
| Colombia Mayor, ciclo 7 de 2026: personas programadas | 2.788.074 personas, $639.643 millones | [Infobae](https://www.infobae.com/colombia/2026/09/15/prosperidad-social-amplio-el-plazo-para-cobrar-los-pagos-del-septimo-ciclo-de-colombia-mayor-esta-es-la-nueva-fecha/) |
| Pendientes al cierre ordinario (13 de septiembre) | 241.830 personas | [Infobae](https://www.infobae.com/colombia/2026/09/15/prosperidad-social-amplio-el-plazo-para-cobrar-los-pagos-del-septimo-ciclo-de-colombia-mayor-esta-es-la-nueva-fecha/) |
| Recibieron en cuenta propia | 24.598, menos del 1 % | [Infobae](https://www.infobae.com/colombia/2026/09/15/prosperidad-social-amplio-el-plazo-para-cobrar-los-pagos-del-septimo-ciclo-de-colombia-mayor-esta-es-la-nueva-fecha/) |
| Renta Joven, ciclo 5 de 2025: abonos reversados | 10.000 de 160.000 | [Prosperidad Social](https://prosperidadsocial.gov.co/Noticias/prosperidad-social-responde-a-inquietudes-sobre-renta-joven/) |
| Giros no cobrados en la ventana de pago | Vuelven a Prosperidad Social | [El Tiempo](https://www.eltiempo.com/economia/finanzas-personales/ojo-lo-que-pasa-si-no-cobra-a-tiempo-el-giro-de-renta-ciudadana-y-devolucion-del-iva-por-hasta-500-banco-agrario-explica-3367437) |

El contrato de 2026 del operador de giros confirma el mecanismo: Prosperidad Social abona el ciclo completo en la cuenta del operador 3 días antes, la ventana de cobro es de 17 días en Colombia Mayor y 10 en los demás, lo no cobrado se reintegra en 3 días hábiles y el operador cobra hasta $4.275 por giro entregado (Guía, § El modelo actual según el contrato de 2026).

Los cuatro dolores que la arquitectura ataca, cada uno con el mecanismo que lo resuelve:

1. **Fondeo previo.** La plata se gira antes de que alguien cobre. Mecanismo: un permiso con tope sobre la cuenta del programa; no se dispersa nada al aprobar (Guía, § El ciclo actual, etapa 4).
2. **Reintegro de lo no cobrado.** Mecanismo: lo no cobrado nunca salió de la cuenta y el cierre revoca el permiso (HU-17).
3. **Espera del punto.** El punto fondea su caja y recibe el reembolso al cierre. Mecanismo: un pago a la wallet del punto en cada cobro (HU-12).
4. **Rechazos por cuenta inválida.** Mecanismo: la cuenta del beneficiario se verifica al enlazarla, antes de pagarle (HU-07).

Reglas de lenguaje que la interfaz y el pitch deben respetar: decir «pendientes al cierre ordinario», nunca «devueltos»; decir que la conciliación «se reduce mucho», nunca que «desaparece» (Guía, § Datos verificados). La cifra oficial de lo reintegrado al Tesoro está pedida por derecho de petición y sigue pendiente.

## 1.3 Actores principales

El flujo principal tiene cuatro roles humanos y tres sistemas; los humanos comparten una sola web con selector de rol y sin login (HU-19). El beneficiario sin celular no usa ninguna vista: le basta su cédula en un punto.

### Roles humanos del flujo principal

| Rol | Quién es (persona de referencia) | Qué puede hacer en el sistema | Vista y dispositivo | Cómo se identifica en el MVP | Fuente |
| --- | --- | --- | --- | --- | --- |
| Entidad financiadora | Laura, coordinadora de un subsidio en una institución con cuenta propia | Conectar el programa, registrar puntos, aprobar el permiso en su banco, ver el tablero, pausar y cerrar | Vista Entidad en computador; aprueba en la Test Wallet | Selector de rol; su sesión de la Test Wallet en un perfil de navegador propio | HU-01 a HU-05, HU-15 a HU-18 |
| Beneficiaria con cuenta | Ana, 67 años, tiene billetera | Enlazar y verificar su cuenta, ver «Tienes $230.000», cobrar a su cuenta y ver su historial | Vista Beneficiario en celular | Selector con una cédula de prueba; PIN al enlazar; aprobación en su wallet | HU-07 a HU-09 |
| Beneficiario sin celular ni cuenta | Jorge, 72 años | Cobrar en efectivo con su cédula y confirmar con PIN en el dispositivo del punto | Ninguna vista propia | Cédula digitada por el punto de pago y PIN; en producción, huella | HU-10, HU-11 |
| Punto de retiro | Marta, tendera con un corresponsal tipo Puntored | Digitar la cédula, ver el monto disponible, pedir el PIN, ver «Pagado» y entregar el efectivo | Vista Punto en el celular de la caja | Selector con un punto de prueba | HU-10 a HU-13 |

Las personas son ficticias; sus dolores salen de los datos verificados de la sección 1.2 (Historias, § Actores y personas).

El rol «punto» es cualquier red de puntos, no una empresa. En 2026 el efectivo de Prosperidad Social lo paga la Unión Temporal de SuperGIROS y SuRed; en la demo usamos un punto tipo Puntored (Guía, § El ángulo de Puntored).

### Sistemas que participan

| Sistema | Responsabilidad | Lo que nunca hace | Fuente |
| --- | --- | --- | --- |
| Plataforma (nuestra API) | Aplica las reglas, guarda programas, cuentas enlazadas y cobros, y firma las peticiones Open Payments | Custodiar dinero o guardar la base de beneficiarios | Historias, § Sistemas |
| Liquidación de la entidad (simulada) | Responde si una cédula tiene un pago disponible y por cuánto; en la demo también valida el PIN (propuesto) | Ser copiada a nuestra base | HU-02, HU-11 |
| Banco puente (simulado) | Hace el papel de un banco o SEDPE que participa en Bre-B y opera Rafiki: dice si una llave Bre-B existe, a qué wallet llega y si su titular es una cédula dada (AD-21) | Custodiar dinero en la demo: la plata va de la Test Wallet a la Test Wallet | HU-07, HU-09; RN-15 a RN-18 |
| ASE: Interledger Test Wallet | Custodia las cuentas, muestra las pantallas de consentimiento, ejecuta los pagos y hace cumplir el tope con InsufficientGrant | Recibir instrucciones sin firma | Historias, § Sistemas; RN-09 |

### Roles que solo aparecen en los extras o fuera del producto

| Rol | Dónde aparece | Qué hace | Fuente |
| --- | --- | --- | --- |
| Comercio autorizado y no autorizado | Extra HU-21, bono con destino | Digita el total y la cédula; el autorizado recibe el pago, el no autorizado ve el rechazo | HU-21 |
| Supervisor de contrato | Extra HU-24, contrato por hitos | Certifica un hito y así libera su pago | HU-24 |
| Ciudadano en el tablero público | Extra HU-24 | Ve hitos certificados y lo pagado, sin cuentas ni datos personales | HU-24 |
| Jurado o integrante del equipo | Toda la demo | Recorre los tres roles en un solo dispositivo con el selector | HU-19 |

Por qué no hay login: un login propio con contraseñas no suma puntos y está en la lista de «qué no usar»; la identidad que importa la prueban la wallet (aprobación en el banco, verificación de cuenta) y el PIN (Guía, § Qué no usar; HU-19).

## 1.4 Funcionalidades clave

Nueve funcionalidades obligatorias cubren el flujo del subsidio de punta a punta; suman 18 historias Must y 66 puntos, y solo dos de ellas mueven dinero: el cobro a la cuenta y el cobro en el punto (Historias, § Épicas y backlog).

| # | Funcionalidad | Historias | Qué hace Open Payments | Paso del video |
| --- | --- | --- | --- | --- |
| F1 | Conectar un subsidio con su liquidación y sus puntos | HU-01, HU-02, HU-03 | walletAddress.get de la cuenta del programa y de cada punto | 2 |
| F2 | Aprobar una vez el permiso con tope | HU-04, HU-05 | grant.request interactivo de pago saliente con tope y sin receptor fijo; callback con hash y grant.continue | 2 |
| F3 | Enlazar y verificar la cuenta del beneficiario | HU-07 | Verificación de propiedad de la wallet address (grant interactivo) | 3 |
| F4 | Ver lo disponible y cobrar a la cuenta | HU-08, HU-09 | incomingPayment.create en la wallet del beneficiario y outgoingPayment.create desde el programa | 3 |
| F5 | Cobrar en el punto con cédula y PIN | HU-10, HU-11, HU-12 | Los mismos pagos, hacia la wallet del punto | 4 |
| F6 | Rechazos claros y sin doble cobro | HU-13, HU-14 | El banco rechaza el cobro que supera el tope (InsufficientGrant) | 5 y 6 |
| F7 | Tablero: autorizado, cobrado y lo que nunca salió | HU-15 | outgoingPayment.getGrantSpentAmounts | 7 |
| F8 | Registro y línea de tiempo de cada cambio de estado | HU-16 | Ninguno: tabla evento | Detalle del cobro |
| F9 | Cerrar el programa revocando el permiso | HU-17 | grant.cancel o token.revoke | 7 |

De soporte, también obligatorias: selector de rol sin login (HU-19) y entregables del hackathon (HU-20). Should, si sobra tiempo: rotar el token del permiso (HU-06) y pausar el programa (HU-18).

Extras, en orden y cada uno detrás de su variable `EXTRA_*`: bono con destino (HU-21), QR y cámara (HU-22), PDF417 de la cédula (HU-23), contrato por hitos (HU-24) y despliegue público (HU-25). Solo se empiezan si el flujo principal pasa la puerta del viernes a las 17:15.

## 1.5 Diseño de interfaz y experiencia de usuario (UI/UX)

La interfaz es una sola web móvil con tres grupos de vistas, unas 8 en total, y el jurado debe recordar el movimiento de la plata, no las pantallas (Guía, § Las vistas y § Alcance del MVP). Los requisitos de UX ya son medibles; lo que falta es el diseño visual.

### Inventario de vistas

| Grupo | Vista | Qué muestra o pide | Historias |
| --- | --- | --- | --- |
| Común | Selector de rol | Entidad, Beneficiario o Punto, con cédula o punto de prueba; se recuerda al recargar | HU-19 |
| Entidad | Conectar programa | Nombre, vigencia, wallet del programa, liquidación de prueba y puntos de retiro | HU-01, HU-02, HU-03 |
| Entidad | Aprobar en mi banco | Botón que lleva a la Test Wallet; resultado aprobado, rechazado o vencido | HU-04, HU-05 |
| Entidad | Tablero | Tres cifras grandes (autorizado, cobrado, lo que no ha salido), cobros por canal, pausar y cerrar con doble confirmación | HU-15, HU-17, HU-18 |
| Entidad | Detalle del cobro | Eventos en orden y referencia del pago | HU-16 |
| Beneficiario | Enlazar mi cuenta | Wallet address, PIN y aprobación en su wallet | HU-07 |
| Beneficiario | Mi subsidio | «Tienes $230.000», vigencia, «A mi cuenta» o «En un punto» con la lista de puntos | HU-08, HU-09 |
| Beneficiario | Historial | Cuándo, dónde y referencia de lo cobrado | HU-08 |
| Punto | Validador | Cédula y monto, PIN oculto, resultado «Pagado · entrega $230.000 · Ref. SUB-0002» o el rechazo | HU-10 a HU-13 |

La división exacta en pantallas sale de los bocetos, programados para el 11 de octubre (Guía, § Checklist).

### Requisitos de UX que ya están definidos

| Requisito | Meta medible | Cómo se verifica | Fuente |
| --- | --- | --- | --- |
| Pocos pasos | Punto en 3 pasos (cédula, PIN, resultado); cuenta en 1 toque | 2 personas externas completan cada flujo sin ayuda en menos de 60 s | RNF-03 |
| Ancho móvil | Cada vista funciona a 360 px | Prueba en celular | RNF-03, HU-08 |
| Legibilidad | Texto base de 16 px o más, montos de 24 px | Lighthouse Accesibilidad de 90 o más | RNF-04 |
| Contraste y toque | Contraste AA de WCAG 2.1 (4,5:1 texto, 3:1 controles); botones de 44 × 44 px o más | Lighthouse | RNF-04 |
| Lenguaje | Español sencillo; 0 palabras técnicas (grant, token, wallet address) en punto y beneficiario | Revisión de textos | RNF-04 |
| Rapidez percibida | Del PIN o del «Cobrar» a «Pagado» en 10 s o menos | Marcas de tiempo de 10 cobros de ensayo | RNF-02 |
| Navegadores | Chrome Android y Safari iOS (punto y beneficiario); Chrome escritorio (entidad) | 1 Android y 1 iPhone reales | RNF-08 |
| Mensajes de error | Un texto fijo por causa de rechazo, por ejemplo «Este subsidio ya fue cobrado» | Tabla de causas | HU-13 |

Reglas de interacción tomadas de las historias: el PIN se oculta con asteriscos (HU-11); el punto entrega el efectivo solo cuando ve «Pagado» (HU-12); cerrar el programa pide una segunda confirmación porque es irreversible (HU-17); si la cámara no abre, digitar la cédula siempre funciona (HU-22, HU-23).

### Pendiente por definir

- Identidad visual: paleta, tipografía y estilo. La Guía solo fija Tailwind CSS y shadcn/ui y asigna el estilo al Rol 4.
- Bocetos de las vistas: previstos para el 11 de octubre; no hay mockups en la carpeta.
- Qué ve el usuario mientras el cobro está en Pagando (indicador de espera) y qué pasa si supera los 10 s de RNF-02.
- Textos en inglés: la Guía pide subtítulos si hay jurados que no hablan español, pero no dice si la interfaz se traduce.

# 2. Patrones de diseño

## 2.1 Patrones de diseño en el Frontend

El frontend es un cliente delgado: muestra estados y nunca habla con Open Payments ni guarda secretos. Ocho patrones salen de las fuentes; el enrutamiento y el manejo de estado del servidor siguen pendientes.

| Patrón | Cómo se aplica | Por qué | Fuente | Estado |
| --- | --- | --- | --- | --- |
| Aplicación de una sola página con vistas por rol | React + Vite; un selector elige Entidad, Beneficiario o Punto y monta su grupo de vistas | Recorrer la demo completa en un solo dispositivo y sin login | Guía, § Arquitectura recomendada; HU-19 | Decidido |
| Cliente delgado sin secretos | El navegador solo llama a nuestra API; tokens, llaves y URL de gestión del permiso nunca le llegan | El SDK en el navegador expondría la llave privada | Guía, § Qué no usar; HU-15; RNF-01 | Decidido |
| Redirección de consentimiento | La vista lleva a la persona a `interact.redirect` de la Test Wallet y la recibe de vuelta en `APP_BASE_URL` | Open Payments exige que el titular apruebe en su propia wallet | HU-04, HU-07; Variables de entorno | Decidido |
| Consulta periódica del estado | El punto y la app consultan `GET /cobros/:id` cada `POLL_INTERVALO_MS` (1000 ms, propuesto); el tablero refleja un cobro en 5 s o menos | No hay worker ni canal de eventos: el estado avanza cuando alguien lo consulta | Guía, § Revisión de la arquitectura; HU-15 | Propuesto |
| Clave de idempotencia por envío | Cada solicitud de cobro viaja con una `idempotency_key`; un doble clic devuelve el mismo cobro | Evita cobros duplicados por doble clic o reintento | HU-10, HU-14; Arquitectura v2, § 15 | Decidido |
| Catálogo de mensajes por causa | Un texto fijo y sencillo por cada causa de rechazo | Que el punto y el beneficiario entiendan qué pasó sin llamar a nadie | HU-13; RNF-04 | Decidido |
| Sistema de componentes, móvil primero | Tailwind CSS + shadcn/ui; diseño desde 360 px | Tres vistas decentes en poco tiempo, pensadas para móvil | Guía, § Stack; RNF-03, RNF-04 | Decidido |
| Degradación con alternativa manual | Si la cámara no abre, el campo de cédula digitada sigue disponible | El extra nunca puede bloquear el flujo principal | HU-22, HU-23 | Decidido (solo extras) |

### Pendiente por definir en el Frontend

| Decisión | Opciones que mencionan las fuentes | Criterio para decidir |
| --- | --- | --- |
| Enrutamiento entre vistas | Ninguna fuente lo menciona | «Nada que el equipo no haya usado antes del 16 de octubre» (Guía, § Stack) |
| Manejo de estado y llamadas a la API | Ninguna fuente lo menciona | El mismo criterio; debe soportar la consulta periódica |
| Cómo se recuerda el rol al recargar | HU-19 lo exige, pero no dice dónde se guarda | Que no guarde datos sensibles |
| Cómo lee el frontend las banderas `EXTRA_*` | RNF-10 las define para el sistema, sin detallar el frontend | Que apagar un extra no deje botones muertos |
| Dónde viven los textos de rechazo | En la API o en el frontend; HU-13 solo fija los textos | Un solo lugar, para no desalinear el video |
| Quién genera la `idempotency_key` | La Arquitectura v2 dice que la envía el cliente; las Historias no lo precisan | Confirmar con el Rol 2 |

## 2.2 Patrones de diseño en el Backend

El backend es un monolito modular con dos fronteras: un único adaptador hacia Open Payments y un núcleo de reglas puras. Es la versión recortada del diseño «Hexagonal + Saga» de la Arquitectura v2, ajustada a unas 8,75 horas de trabajo en sitio (Guía, § Revisión de la arquitectura propuesta).

| Patrón | Cómo se aplica | Por qué | Fuente | Estado |
| --- | --- | --- | --- | --- |
| Monolito modular | Una app Node + Express con módulos `programas/`, `cobros/`, `liquidacion/`, `puente/` y `db/`. En local corre como un proceso; en Vercel, la misma app corre dentro de una función que puede tener varias instancias (§ 3.6) | Una sola app basta; microservicios y colas son sobreingeniería | Guía, § Arquitectura recomendada y § Qué no usar; piloto-v2, `server/src/vercel.ts` | Decidido |
| Adaptador único (frontera hexagonal simplificada) | Solo `openPaymentsService.ts` importa el SDK y firma peticiones | Un puerto de 10 métodos y una fábrica para un segundo método que no existe cuestan horas; los mentores revisan este archivo | Guía, § Revisión y § Estructura del repositorio | Decidido |
| Núcleo de reglas puras | RN-01 a RN-18 y las transiciones viven en funciones sin red ni base de datos | Se prueban con una tabla de casos en Vitest | `cobros/estados.ts`; RNF-07 | Decidido |
| Máquina de estados explícita | Cobro con 6 estados, programa con 5 y cuenta con 3; cualquier otra transición se rechaza | Estados visibles en la demo y manejo de rechazo y vencimiento | Guía, § Estados de un cobro; Historias, § Diagramas | Decidido |
| Saga orquestada con punto de no retorno | El cobro se guarda en Pagando antes de crear el pago saliente; antes de Pagando no se ha movido dinero y después no hay rollback, solo consulta | Los pagos ocurren en servidores distintos sin una transacción común | Guía, § Revisión; HU-12; Arquitectura v2, § 9 | Decidido |
| Avance por eventos, sin worker | El estado avanza al crear, en el callback y al consultar; los vencimientos (120 s del PIN) se evalúan al consultar | El worker es lo más caro de depurar. En Vercel sí hay competencia entre instancias: la cubren la idempotencia en tres niveles (fila siguiente) y un candado de PostgreSQL para renovar tokens (§ 3.6) | Guía, § Revisión; RN-12; piloto-v2 | Decidido |
| Idempotencia en tres niveles | Petición: `idempotency_key` UNIQUE. Negocio: índice único parcial sobre programa y cédula en estados activos. Paso: columna `version` con `UPDATE … WHERE version` | Ningún doble clic, doble callback ni carrera entre dos puntos produce dos pagos | HU-14; RN-02; Guía, § Revisión | Decidido |
| Repositorio con SQL en `db/` | `server/src/db/` concentra el acceso a datos con Drizzle sobre `postgres` (Supabase) o PGlite; el esquema lo dictan las migraciones SQL y `schema.ts` se genera de ellas con `db:pull` | Menos magia y menos tiempo de configuración; las migraciones son SQL que se puede leer | Guía, § Stack; piloto-v2, `server/src/db/` | Decidido (AD-06) |
| Registro de auditoría de solo inserción | Cada transición escribe una fila en `evento`, sin tokens, PIN ni llaves | Alimenta la línea de tiempo de la demo y reduce la conciliación | HU-16; RNF-09 | Decidido |
| Validación en la frontera | Zod revisa montos, cédulas y wallet addresses antes de llamar a Open Payments; el monto lo calcula el backend | Nunca confiar en el monto que manda el navegador | Guía, § Stack; RN-05, RN-11 | Decidido |
| Callback verificado con nonce y hash | Nonce aleatorio por grant; el callback recalcula el hash y es idempotente | Evita activar un programa con un `interact_ref` falso | HU-04; Guía, § Seguridad mínima | Decidido |
| Doble de servicio externo | La liquidación se consume por `LIQUIDACION_URL` como si fuera de la entidad; en la demo es un simulador | La plataforma no guarda la base de beneficiarios | HU-02; RNF-06 | Decidido |
| Banderas de funcionalidad | Cada extra detrás de su variable `EXTRA_*`; con todas en false pasan los pasos 1 a 7 del guion | Un extra nunca rompe el flujo principal | RNF-10 | Decidido |
| Configuración por entorno | Secretos y URLs en variables; `.env.example` sin secretos; `.gitignore` desde el primer commit | El repo será público el sábado a las 11:00 | Historias, § Variables; RNF-01 | Decidido |

### Patrones descartados y por qué

| Patrón | Qué proponía la Arquitectura v2 | Por qué se descarta | Fuente |
| --- | --- | --- | --- |
| Hexagonal completo | 3 capas, 3 puertos y `FabricaDePasarelas` | No se ve en la demo y cuesta horas | Guía, § Revisión |
| Worker con lease | `FOR UPDATE SKIP LOCKED` y reintentos programados | Con un solo proceso no había competencia. En Vercel tampoco hace falta: no hay proceso prendido para un worker, y lo de fondo se dispara con los pedidos (§ 3.6) | Guía, § Revisión; piloto-v2 |
| Búsqueda del pago por `metadata.sagaId` | Listar pagos salientes antes de crear | Pide la acción `list`; se pide solo `create` y `read` por mínimo privilegio | Guía, § Revisión |
| Switches globales, por método y por wallet | ACTIVO, PAUSADO y CORTADO en 3 alcances | Un interruptor interno no suma puntos; se reemplaza por Pausar y Cerrar del programa | Guía, § Revisión; HU-17, HU-18 |
| Estrategia por canal o por tipo de programa | No lo proponía; se descarta para que nadie lo agregue | El bono es «un campo (destino) y una validación más, no otro sistema» | HU-21 |

# 3. Estructura de arquitectura y diagramas

## 3.1 Diagrama de Frontend

&#91;embedded content: frontend · 3 grupos de vistas, 1 API\]

El selector monta uno de tres grupos de vistas; todas llaman a la API por la misma capa, y solo aprobar el permiso y enlazar la cuenta salen del sitio hacia la Test Wallet (Guía, § Las vistas; HU-04, HU-07, HU-19).

## 3.2 Diagrama de Backend

&#91;embedded content: backend · 6 módulos, 3 sistemas externos\]

Las rutas reciben y validan; `programas/` y `cobros/` deciden; tres adaptadores salen al exterior y cada uno habla con un solo sistema. La orquestación del cobro (consultar la liquidación, aplicar la transición, pagar y guardar) vive en `server/src/cobros/orquestacion.ts` (P-20, cerrado en piloto-v2).

## 3.3 Arquitectura en capas

&#91;embedded content: capas · 4 propias y los sistemas externos\]

La aplicación usa el dominio para decidir y la integración para actuar; el dominio no conoce a nadie. Es la regla «las dependencias apuntan hacia dentro» de la Arquitectura v2, conservada aunque se quitaron sus puertos y su fábrica (Guía, § Revisión). Los dueños de cada capa salen de la tabla de roles de la Guía.

## 3.4 Recorrido de operaciones

Ocho operaciones cubren el flujo principal y solo dos mueven dinero: el cobro a la cuenta y el cobro en el punto, que comparten el mismo adaptador de pago (HU-09, HU-12). La secuencia completa, con sus 29 mensajes, está dibujada en las [Historias, § Secuencia de punta a punta](https://claude.ai/code/artifact/b62529b1-12d5-489a-a239-43d2dc12bdf7).

| # | Operación | Ruta | Reglas y transición | Open Payments | Qué se escribe |
| --- | --- | --- | --- | --- | --- |
| O1 | Conectar programa | `POST /programas` | Payment pointer con $ pasa a https://; moneda tomada de la wallet · → Borrador | walletAddress.get | `programa`, `evento` |
| O2 | Aprobar el permiso | `POST /programas/:id/autorizar` y `GET /callback/:id` | Tope = suma de la liquidación (RN-08); hash verificado · Borrador → EsperandoAprobacion → Activo, o vuelve a Borrador si se rechaza o vence | grant.request interactivo (create, read, `limits.debitAmount`, sin receptor) y grant.continue | Tokens y nonces en `programa` (solo backend), `evento` |
| O3 | Enlazar cuenta | `POST /cuentas` y su callback | Con llave Bre-B: tipo elegido (RN-14); la tipo cédula queda Verificada sola (RN-15) y las demás con PIN y titular confirmado por el puente (RN-16). Con wallet Open Payments: PIN antes de enlazar · SinEnlazar → PorVerificar → Verificada | Llave: ninguna (puente simulado). Wallet: verificación de propiedad de la wallet address | `cuenta_beneficiario` (con `tipo_llave` y `llave`), `evento` |
| O4 | Cobrar a la cuenta | `POST /cobros` (canal cuenta) | RN-01, RN-02, RN-04, RN-06, RN-17 (sin cuenta, prueba la llave cédula) y RN-18 (vuelve a resolver la llave antes de pagar) · Solicitado → Pagando → Pagado o Fallido, sin PIN | grant de pago entrante, incomingPayment.create, outgoingPayment.create, outgoingPayment.get | `cobro` con URLs y referencia, `evento` |
| O5 | Cobrar en el punto | `POST /cobros` (canal retiro) y `POST /cobros/:id/confirmar` | RN-01, RN-02, RN-05, RN-06, RN-07 · Solicitado → PorConfirmar → Pagando → Pagado o Fallido | Las mismas llamadas, hacia la wallet del punto | `cobro` (incluye `intentos_pin`), `evento` |
| O6 | Consultar un cobro | `GET /cobros/:id` | RN-10: solo queda Pagado si el pago se completó; RN-12: PorConfirmar vencido → Rechazado | outgoingPayment.get | Transición y `evento`, si cambia |
| O7 | Ver el tablero | `GET /programas/:id/tablero` | nunca salió = autorizado − cobrado | outgoingPayment.getGrantSpentAmounts | Nada |
| O8 | Cerrar el programa | `POST /programas/:id/cerrar` | Doble confirmación · Activo o Pausado → Cerrado; después todo cobro se rechaza (RN-06) | grant.cancel o token.revoke | `programa`, `evento` |

### El camino del dinero en un cobro en el punto

Es la operación que define el hito crítico del viernes a las 14:00 (HU-12) y la que más cuidado pide, porque cruza el punto de no retorno.

1. El punto de pago digita la cédula; el navegador envía `POST /cobros` con canal retiro, punto e `idempotency_key`.
2. La API valida con Zod, revisa que el programa esté Activo y en vigencia (RN-06) y consulta la liquidación por cédula (RN-01).
3. Inserta el cobro; el índice único parcial deja pasar uno solo por cédula y programa (RN-02). Estado PorConfirmar con el monto que calcula el backend (RN-05).
4. El beneficiario digita su PIN; `POST /cobros/:id/confirmar` lo valida contra el servicio simulado (propuesto, RN-07).
5. **Punto de no retorno.** La API guarda Pagando y su evento antes de llamar a Open Payments (HU-12).
6. `openPaymentsService.ts` pide el grant de pago entrante y crea el pago entrante en la wallet del punto, con la referencia en metadata.
7. Crea el pago saliente desde la cuenta del programa con el token del permiso (pago entrante + `debitAmount`) y guarda ambas URLs.
8. Si el banco responde InsufficientGrant, el cobro pasa a Fallido sin mover dinero (RN-09).
9. El navegador consulta `GET /cobros/:id`; la API llama outgoingPayment.get y, cuando el pago se completa, marca Pagado (RN-10).
10. La caja muestra «Pagado · entrega $230.000 · Ref. SUB-0002» y solo entonces el punto entrega el efectivo.

### El camino del dinero en un cobro a una llave Bre-B (AD-21)

El beneficiario cobra a la llave Bre-B que ya tiene (cédula, celular, correo o @alias), sin crear una wallet. **Tatú sigue hablando solo Open Payments**: un banco puente con Rafiki publica una wallet address por llave y, cuando el pago se completa, entrega la plata por Bre-B. Tatú no se conecta a Bre-B, porque solo participan entidades vigiladas.

```mermaid
sequenceDiagram
    autonumber
    actor B as Beneficiario
    participant T as Tatú (API)
    participant P as Banco puente (Rafiki)
    participant R as Bre-B (DICE y MOL)
    participant N as Cuenta del beneficiario
    B->>T: «Cobrar»
    T->>T: Valida reglas (RN-01 a RN-06)
    T->>P: Resuelve la llave (RN-17 y RN-18)
    P->>R: ¿Existe la llave? ¿A qué cuenta va?
    R-->>P: Sí, entidad y cuenta
    P-->>T: Wallet address de la llave y titular enmascarado
    T->>P: Crea el pago entrante en esa wallet
    T->>P: Pago saliente desde la cuenta de la entidad, con el token del permiso
    P->>P: ¿Dentro del tope? Sí: debita la cuenta de la entidad (RN-09)
    P->>R: Transferencia inmediata a la llave
    R->>N: Abono en 20 s como máximo
    R-->>P: Confirmada
    P-->>T: Pago completado (RN-10)
    T-->>B: «Listo, $230.000 en tu cuenta»
```

- **No hay cotización.** El pago saliente se crea sobre el pago entrante con `debitAmount` (AD-10). Solo haría falta una cotización con cambio de moneda.
- **La llave se resuelve antes de pagar**, al enlazar y otra vez en cada cobro (RN-18). Si ya no existe, el cobro se rechaza sin crear el pago entrante.
- **Qué se simula en la demo:** el banco puente es un servicio aparte en `PUENTE_URL` (como la liquidación, AD-13) que traduce cada llave a una wallet de la Test Wallet. Los pasos 4 y 5 los responde el simulador, y los pasos 10 a 12 los hace el propio pago Open Payments entre wallets de la Test Wallet. El tope del paso 9 sí es real: lo hace cumplir la Test Wallet. En producción, el banco hace los pasos 10 a 12 con los *webhooks* de Rafiki.
- **Dónde sirve una llave y dónde no.** Una llave dice a dónde **llega** la plata: sirve para el beneficiario y para el punto. La cuenta de la entidad, de donde **sale** la plata, tiene que ser una wallet Open Payments: Tatú necesita un permiso con tope (GNAP), y Bre-B solo hace pagos que empuja quien paga. La entidad sí puede fondear su wallet recibiendo por su llave Bre-B.
- **Datos de Bre-B verificados** ([documento técnico del Banco de la República, febrero de 2026](https://d1b4gd4m8561gs.cloudfront.net/sites/default/files/publicaciones/archivos/documento-tecnico-bre-b-febrero-2026.pdf)). Las llaves pueden ser celular, número de documento, correo, código alfanumérico o código de comercio, y cada una apunta a una sola cuenta. Se necesitan para recibir, no para enviar. Una transferencia tarda como máximo 20 segundos y no puede pasar de 1.000 UVB. Al 31 de enero de 2026 había 99 millones de llaves de 33,9 millones de clientes. Los pagos masivos y los de empresa a persona todavía están en la agenda de ampliación (P-28).

Pendiente por definir en este recorrido:

- **Qué dispara el pago en el canal cuenta.** HU-09 dice que pasa de Solicitado a Pagando sin PIN, pero la API de la Guía solo paga en `POST /cobros/:id/confirmar`. Falta decidir si `POST /cobros` paga directo en ese canal o si el navegador llama a confirmar sin PIN.
- **Cómo se recupera un cobro en Pagando sin la URL del pago saliente.** Si la respuesta de outgoingPayment.create se pierde, outgoingPayment.get no tiene URL que consultar, y la búsqueda por `metadata` se descartó junto con la acción `list`. Hay que probar el 8 de octubre si consultar el pago entrante (monto recibido) basta para saber si se pagó; RNF-05 depende de esto.
- **Ruta del callback de verificación de cuentas.** Las Historias la mencionan («y de cuentas») pero no la nombran.

## 3.5 Tabla de decisiones de arquitectura

De 23 decisiones, 19 están tomadas, 2 propuestas y 2 pendientes; las pendientes se resuelven con las pruebas del 8 de octubre o con una decisión del Rol 1 (técnica) o del Rol 5 (alcance), como fija la Guía (§ Reglas de trabajo). El 14 de octubre se cerraron AD-06, AD-13 y AD-17 con lo que ya corre en `piloto-v2`, y se agregaron AD-22 y AD-23 (despliegue). El equipo actualiza la columna Estado.

| ID | Decisión | Alternativas consideradas | Justificación | Fuente | Estado |
| --- | --- | --- | --- | --- | --- |
| AD-01 | Monolito modular en un solo proceso Node | Microservicios, colas (Kafka, RabbitMQ, Redis), Kubernetes | Un solo proceso basta para la demo; lo demás es sobreingeniería | Guía, § Qué no usar | Decidida |
| AD-02 | TypeScript, Node.js 24 LTS y `@interledger/open-payments` 7.4.0 fijado en `package.json` | JavaScript; SDK de PHP o Go | El SDK de Node es el más completo y trae tipos; Node 24 es la LTS activa | Guía, § Stack | Decidida |
| AD-03 | Express con tsx | Fastify, Hono | Más ejemplos y todos lo conocen | Guía, § Stack | Decidida |
| AD-04 | React + Vite + Tailwind CSS + shadcn/ui | Next.js, solo si el equipo ya lo domina | Tres vistas móviles decentes en poco tiempo | Guía, § Stack | Decidida |
| AD-05 | PostgreSQL gestionado: **Supabase**, por el pooler (puerto 6543, modo «Transaction», en Vercel; 5432, modo «Session», en local) | SQLite con un solo proceso (rama `piloto`); Neon | Gratis, en la nube y compartido por los 5; da UNIQUE, índices parciales y bloqueo optimista. SQLite no sirve en Vercel: el disco de una función es efímero y hay varias instancias | Guía, § Stack; piloto-v2, `server/src/db/conexion.ts` | Decidida (Supabase desde el 13 de octubre) |
| AD-06 | Acceso a datos con **Drizzle** (`drizzle-orm` 1.0.0-rc.4) sobre `postgres`, con migraciones SQL que se aplican solas | `pg` con SQL directo; Prisma | Es lo que usa la rama de Pablo; el esquema sale de las migraciones (`db:pull`) y los repositorios toman solos la transacción en curso | Guía, § Stack; piloto-v2, `server/src/db/` | Decidida (piloto-v2) |
| AD-07 | Un único adaptador `openPaymentsService.ts` | Hexagonal con 3 puertos y `FabricaDePasarelas` | Lo que no se ve en la demo y cuesta horas se recorta | Guía, § Revisión | Decidida |
| AD-08 | Saga con estados persistidos que avanza por eventos | Worker con lease y `FOR UPDATE SKIP LOCKED` | Con un solo proceso no hay competencia. En Vercel puede haber varias instancias: la idempotencia y el bloqueo optimista ya evitan los dobles pagos, y la renovación de tokens usa un candado (AD-22) | Guía, § Revisión; piloto-v2 | Decidida |
| AD-09 | Un permiso con tope y sin receptor fijo para todo el programa | Un permiso por destino (plan B) | La entidad aprueba una sola vez y no se gira nada por adelantado; se prueba el 8 de octubre | HU-04; Historias, § Riesgos | Decidida |
| AD-10 | Pago saliente con pago entrante + `debitAmount` | Pago saliente con `quoteId` | La cotización vence en 5 min y Rafiki recotiza en esta variante | Guía, § Revisión; HU-12 | Decidida |
| AD-11 | El tope lo hace cumplir el banco con InsufficientGrant | Validar el tope en la plataforma antes de pagar | Muestra en la demo que el control es del banco; plan B si la Test Wallet no lo devuelve | RN-09; Historias, § Riesgos | Decidida |
| AD-12 | Consultar la liquidación por cédula, sin copiarla | Cargar y guardar la lista de beneficiarios | La entidad sigue siendo dueña de su base; menos datos personales en nuestra base | HU-02; RNF-06 | Decidida |
| AD-13 | Liquidación simulada como **módulo de la misma API** (`server/src/liquidacion/`, en `/api/liquidacion`), consultada por HTTP en `LIQUIDACION_URL` como si fuera de la entidad. El banco puente de Bre-B sigue el mismo patrón (`/api/puente`, `PUENTE_URL`) | Un servicio aparte | Un solo despliegue; como la API la llama por HTTP y nunca por SQL, se puede separar cambiando solo la variable | Guía, § Estructura; Historias, § Modelo de datos; piloto-v2 | Decidida (piloto-v2) |
| AD-14 | El PIN lo valida el servicio simulado y la plataforma no lo guarda | Guardar el PIN con hash en nuestra base | RNF-06 exige 0 columnas de PIN; la Guía (§ Seguridad mínima) aún dice «el PIN se guarda con hash» | HU-11; RNF-06 | Propuesta |
| AD-15 | Selector de rol sin login | Login propio con contraseñas | No suma puntos; la identidad la prueban la wallet y el PIN | Guía, § Qué no usar; HU-19 | Decidida |
| AD-16 | Consulta periódica del estado cada 1000 ms | No evaluadas en las fuentes | Coherente con el avance por eventos sin worker | Historias, § Variables (`POLL_INTERVALO_MS`) | Propuesta |
| AD-17 | Despliegue de **la web y la API juntas en Vercel**, en un solo dominio con HTTPS: la web como archivos estáticos y la API como una función de Node 24 que atiende todo `/api` (Build Output API v3) | Vercel para la web y Render o Railway para la API (lo que decía la Guía); túnel con HTTPS hacia el portátil | Un solo dominio: sin CORS, los callbacks de la Test Wallet llegan a una URL pública y la cámara de los extras tiene HTTPS. Render o Railway serían un segundo servicio que mantener | Guía, § Stack y § Extras; HU-25; piloto-v2, `vercel.json` y `scripts/build-vercel.mjs` | Decidida (desplegado el 13 de octubre) |
| AD-18 | Moneda de los montos | COP o USD de prueba | Depende de las monedas que ofrezca la Test Wallet; los montos van en entero + `assetCode` + `assetScale` | Historias, § Supuestos técnicos | Pendiente |
| AD-19 | Cada extra detrás de su bandera `EXTRA_*` | Construir los extras en el flujo principal | Ningún extra puede romper la demo | RNF-10 | Decidida |
| AD-20 | Cierre con grant.cancel o con token.revoke | Las dos aparecen en las fuentes | Falta probar cuál deja el permiso inutilizable en la Test Wallet | HU-17 | Pendiente |
| AD-21 | La cuenta del beneficiario es una llave Bre-B, resuelta por un banco puente con Rafiki que publica una wallet address por llave; en la demo, un puente simulado en `PUENTE_URL`. La wallet Open Payments escrita a mano queda como opción avanzada | Exigir una wallet Open Payments a cada beneficiario; que Tatú cree wallets (custodia: no); conectarse directo a Bre-B (solo entidades vigiladas) | Casi nadie en Colombia tiene una wallet Open Payments, y 33,9 millones de clientes ya tienen una llave Bre-B. El flujo de pago no cambia: solo cambia de dónde sale la wallet de destino | HU-07, HU-09; RN-14 a RN-18; [Plan Bre-B](./piloto/Plan%20Bre-B.md) | Decidida (13 de octubre) |
| AD-22 | En Vercel, la API **se prepara en el primer pedido de cada instancia** (abre la base, migra, recupera los cobros en Pagando), la renovación de tokens se dispara con los pedidos bajo un candado de PostgreSQL, y el pago sigue después de responder con `waitUntil`; las tareas de fondo se cortan a los 45 s | Un proceso prendido con `setInterval` (lo que hace `main.ts` en local); un cron de Vercel | Una función no tiene proceso prendido ni reloj; el candado evita que dos instancias renueven a la vez | piloto-v2, `server/src/vercel.ts` | Decidida (piloto-v2) |
| AD-23 | Desarrollo y pruebas con **PGlite** (PostgreSQL dentro de Node) cuando no hay `DATABASE_URL` de Supabase | Un PostgreSQL instalado o en Docker; pruebas contra Supabase | Las pruebas corren con las migraciones de verdad, sin internet ni cuenta. No se lleva al paquete de Vercel | piloto-v2, `server/src/db/conexion.ts` | Decidida (piloto-v2) |
| AD-24 | **Retiro parcial en el punto y venta dentro del retiro.** Todo subsidio maneja saldo (asignado − pagado − en vuelo) y en el canal `retiro` el punto elige cuánto; la compra que la persona hace en la tienda se registra como `venta` del mismo retiro (efectivo = retiro − venta) y se envía a un sistema externo de facturación con su id como llave de idempotencia, aparte del pago | Dos cobros por visita, uno de `retiro` y otro de `compra` (control C-1 de la investigación DIAN); que Tatú emita la factura | Una sola operación es más rápida en la caja y la etiqueta de la compra queda igual de separada. Cada retiro parcial es otro pago bajo el mismo permiso: el `debitAmount` sigue topando la suma. Si facturación falla, el pago no se toca | HU-26, HU-27; RN-19 a RN-23; `db/README.md` § 12 | Decidida (17 de octubre) |

## 3.6 Despliegue y entornos

La web y la API viven en el mismo dominio en los dos entornos; lo que cambia es quién atiende `/api` y qué base se usa.

```mermaid
flowchart LR
    subgraph Navegador
        W[Web React<br/>entidad, beneficiario, punto]
    end
    subgraph Vercel["Vercel · test-openpayment.vercel.app"]
        S[Archivos estáticos<br/>web/dist]
        F["Función api.func (Node 24)<br/>Express de server/src/vercel.ts<br/>incluye /api/liquidacion y /api/puente"]
    end
    subgraph Supabase
        P[(PostgreSQL por el pooler 6543<br/>esquemas piloto, piloto_gobierno, piloto_puente)]
    end
    TW[Interledger Test Wallet<br/>ASE sobre Rafiki]
    W -- "/ , /entidad, …" --> S
    W -- "/api/*" --> F
    F --> P
    F -- "Open Payments firmado" --> TW
    TW -- "callback a /api/…" --> F
```

| Entorno | Cómo se arranca | Dónde atiende `/api` | Base de datos | URLs (`APP_BASE_URL`, `API_BASE_URL`, `LIQUIDACION_URL`) |
| --- | --- | --- | --- | --- |
| Producción | Vercel despliega cada push a su rama de producción (`produccion`, según el historial del repo; se confirma en el proyecto de Vercel) | La función `api.func` | Supabase, pooler 6543 | Salen solas del dominio de producción |
| Preview de Vercel | Cada push a otra rama | Una función por despliegue | La `DATABASE_URL` que tenga el entorno Preview en Vercel | Salen solas del dominio de la rama |
| Local con Supabase | `pnpm dev` (raíz): API en 3000 y web en 5173 | Vite pasa `/api` a la API (proxy): el navegador ve un solo origen, el 5173 | Supabase, pooler 5432 | Del `.env` (localhost) |
| Local sin internet y pruebas | `pnpm dev` sin `DATABASE_URL`; `pnpm test` | Igual que arriba | PGlite en `server/data/pglite` (pruebas: en memoria) | Del `.env` |

Cómo se arma el despliegue (`vercel.json` → `pnpm run build:vercel`): Vite construye `web/dist`; `scripts/build-vercel.mjs` lo copia como estático, empaqueta la API con esbuild en `functions/api.func` (Node 24, hasta 60 s por pedido), copia las migraciones, los archivos de Swagger y los specs de Open Payments, y enruta `^/api` a la función y todo lo demás a `index.html`.

Qué cambia por correr en una función (AD-22):

- **No hay proceso prendido.** Abrir la base, migrar y recuperar los cobros en Pagando (RNF-05) pasa en el primer pedido de cada instancia. Si la base no responde, la API contesta 503 `NoDisponible`.
- **El token del permiso se renueva con los pedidos** (D-35): como mucho una vez cada `TOKEN_RENOVAR_CADA_SEG` por instancia y solo en la instancia que obtiene el candado `pg_try_advisory_lock`. Si nadie usa la app por más de 10 minutos, el token vence y se rota en el siguiente uso; si el banco ya no lo acepta, el tablero ofrece «Renovar permiso».
- **El pago sigue después de responder.** El pago se dispara en segundo plano (`disparar`, en `cobros/orquestacion.ts`) y `waitUntil` mantiene viva la función hasta que termina; fuera de Vercel no hace nada.
- **Pocas conexiones por instancia:** 8 en Vercel y 5 en local. Con el pooler 6543 se apagan los *prepared statements*.
- **Secretos como variables del proyecto en Vercel:** `DATABASE_URL`, `OP_CLIENT_WALLET_ADDRESS`, `OP_KEY_ID` y `OP_PRIVATE_KEY_BASE64` (no hay disco para `OP_PRIVATE_KEY_PATH`). Las demás tienen valor por defecto.

Cuidados, porque producción y local pueden apuntar a la misma base:

- **`db:reset` contra Supabase borra los datos de producción.** Los esquemas `piloto*` son los mismos. Para probar en local sin tocar producción, usar PGlite (sin `DATABASE_URL`).
- **No correr la API local contra Supabase mientras producción está en uso.** La renovación local (`setInterval` en `main.ts`) y la rotación que se dispara en un pago no usan el candado. Si dos procesos rotan el mismo token a la vez, el que pierde recibe un error del banco y marca el permiso como vencido (`programas/servicio.ts`, `rotar`); la entidad tendría que volver a aprobar.
- **Las migraciones no tienen candado.** Si dos instancias nuevas migran a la vez una migración nueva, una falla y responde 503; el siguiente pedido ya la encuentra aplicada.
- **El preview usa la base que tenga configurada.** Si el entorno Preview comparte la `DATABASE_URL` de producción, una rama en prueba escribe en los datos de producción.

# 4. Datos e integración

## 4.1 Diseño de la base de datos

Seis tablas en PostgreSQL sostienen todas las historias, y la lista de beneficiarios vive fuera: se consulta a la liquidación de la entidad. El diseño vigente es el diccionario de las Historias, que amplía el de la Guía con `asset_code`, `asset_scale`, `grant_url`, `total_compra`, `motivo_rechazo`, `intentos_pin` e `idempotency_key` (Historias, § Modelo de datos).

&#91;embedded content: modelo de datos · 6 tablas propias y la liquidación externa\]

El diccionario campo por campo, con tipos, validaciones y ejemplos de la demo, está en las [Historias, § Diccionario por tabla](https://claude.ai/code/artifact/b62529b1-12d5-489a-a239-43d2dc12bdf7); aquí solo se resume qué protege cada tabla.

| Tabla | Para qué | Restricciones que protegen el dinero o los datos | Fuente |
| --- | --- | --- | --- |
| `programa` | El programa y su permiso | `tope_total` fijo desde la aprobación (RN-08); tokens, `manage_url` y nonces nunca salen del backend | RN-08; RNF-01 |
| `punto` | Puntos de retiro y comercios | `wallet_address` única y en la moneda del programa | HU-03 |
| `programa_punto` | Comercios autorizados de un bono | Llave compuesta; solo existe con el extra HU-21 | HU-21 |
| `cuenta_beneficiario` | Cuenta enlazada por su dueño | Estado SinEnlazar, PorVerificar o Verificada; sin tokens del beneficiario | HU-07; RN-04 |
| `cobro` | Cada cobro, por cualquier canal | Índice único parcial (programa, cédula) en Solicitado, PorConfirmar, Pagando y Pagado; `idempotency_key` UNIQUE; `referencia` única; `version` para bloqueo optimista; monto calculado en el backend | RN-02, RN-05, RN-11; HU-14 |
| `evento` | Línea de tiempo y auditoría | Solo inserción; `detalle` nunca guarda tokens, PIN ni llaves | HU-16; RNF-09 |

Datos de prueba de la liquidación simulada (propuestos en las Historias): 3 cédulas de $230.000 con tope de $690.000 (Ana y otra persona con cuenta, Jorge sin celular), y una cuarta cédula con un retroactivo de $460.000 cargado después de aprobar, para que el banco rechace ese cobro por tope. El bono del extra HU-21 usa 2 cédulas de $60.000.

Pendiente en el modelo: dónde se guarda el bloqueo de 15 minutos tras 3 PIN fallidos (P-12), si existe alguna columna de PIN (P-01) y cómo se genera la `referencia` con formato SUB-0001, que las Historias exigen única pero no dicen cómo se numera.

**Dónde viven las tablas en `piloto-v2`.** La base de Supabase es la del equipo (la de Pablo), y el piloto solo usa sus propios esquemas: `piloto` (las tablas de Tatú y el registro `piloto.migracion`), `piloto_gobierno` (el gobierno simulado: nombre, PIN y monto de cada persona, que Tatú consulta por HTTP en `/api/liquidacion`) y `piloto_puente` (el banco puente de Bre-B: cada llave apunta a una wallet). Nunca toca `public`. Las migraciones están en `server/src/db/migraciones/`: `001` y `003` son copia de `db/` de `main`, y `010`, `020`, `030` y `031` agregan lo del piloto. Se aplican solas al arrancar en local y en el primer pedido de cada instancia en Vercel.

## 4.2 Integraciones y servicios externos

La única integración que mueve dinero es Open Payments contra la Interledger Test Wallet; la liquidación de la entidad y el banco puente de Bre-B son simuladores y el resto es infraestructura de desarrollo (Guía, § Alcance del MVP).

| Servicio | Para qué | Cómo se integra | Configuración | Estado |
| --- | --- | --- | --- | --- |
| [Interledger Test Wallet](https://wallet.interledger-test.dev) (ASE sobre Rafiki) | Custodiar cuentas, mostrar el consentimiento, ejecutar pagos y hacer cumplir el tope | SDK `@interledger/open-payments` 7.4.0 con un cliente autenticado que firma cada petición con Ed25519 | `OP_CLIENT_WALLET_ADDRESS`, `OP_KEY_ID` y la llave: `OP_PRIVATE_KEY_PATH` (archivo fuera del repo, en local) u `OP_PRIVATE_KEY_BASE64` (en Vercel) | Decidido |
| Liquidación de la entidad (simulada) | Responder por cédula: programa, nombre, monto y si ya fue pagado; validar el PIN de prueba (propuesto) | HTTP en `LIQUIDACION_URL` | Datos de prueba de la sección 4.1 | Decidido; contrato pendiente |
| Banco puente de Bre-B (simulado) | Resolver una llave Bre-B a su wallet, mostrar el titular enmascarado y confirmar si su titular es una cédula | HTTP en `PUENTE_URL`; en producción, el banco publica una wallet address por llave y Tatú solo usa Open Payments | Llaves de prueba que «Equipo de prueba» registra, cada una apuntando a una wallet de la Test Wallet | Decidido (AD-21); contrato en el Plan Bre-B |
| Sistema de facturación del comercio (simulado) | Recibir las ventas registradas en un retiro para generar la factura electrónica o el documento POS | HTTP en `FACTURACION_URL`, `POST /facturas` con `Idempotency-Key` = id de la venta; reintento manual, al consultar el cobro y al arrancar | Simulador en `/api/facturacion` que se puede poner caído o rechazando | Decidido (AD-24) |
| PostgreSQL gestionado: Supabase | Guardar programas, puntos, cuentas, cobros y eventos | `DATABASE_URL` por el pooler: 6543 en Vercel, 5432 en local; sin ella, PGlite local (AD-23) | Esquemas `piloto`, `piloto_gobierno` y `piloto_puente` (§ 4.1) | Decidido (AD-05, AD-06) |
| Hosting público: Vercel | Link para el jurado, HTTPS para la cámara y callbacks de la Test Wallet a una URL pública | Web estática y API como función en el mismo dominio (§ 3.6) | `APP_BASE_URL`, `API_BASE_URL` y `LIQUIDACION_URL` salen solas del dominio; los secretos son variables del proyecto | Desplegado: <https://test-openpayment.vercel.app> (AD-17) |
| GitHub | Entrega: repo público, todo en `main`, `AI_USAGE.md` y `/prompts` | Ramas cortas y merge frecuente | `.gitignore` con `.env` y `*.key` | Decidido |

### Llamadas a Open Payments

| Llamada del SDK | Servidor del ASE | Operación | Grant o token que usa |
| --- | --- | --- | --- |
| walletAddress.get | Wallet address (público) | O1, registro de puntos, cuentas | Ninguno |
| grant.request de pago saliente, interactivo, con `limits.debitAmount` | Autorización del programa | O2 | Cliente firmado; devuelve `interact.redirect` y `continue` |
| grant.continue | Autorización del programa | O2, tras el callback | `continue_token`; devuelve el access token del permiso |
| Verificación de propiedad de la wallet address | Autorización del beneficiario | O3 | Grant interactivo; no se guardan tokens del beneficiario |
| grant.request de pago entrante + incomingPayment.create | Autorización y recursos del destino | O4, O5 | Grant no interactivo del destino |
| outgoingPayment.create | Recursos del programa | O4, O5 | Access token del permiso |
| outgoingPayment.get | Recursos del programa | O6 | Access token del permiso |
| outgoingPayment.getGrantSpentAmounts | Recursos del programa | O7 | Access token del permiso |
| token.rotate | Autorización del programa | HU-06 (Should) | `access_token.manage` |
| grant.cancel o token.revoke | Autorización del programa | O8 | `continue` o `access_token.manage` |

Cuentas de la Test Wallet que la demo necesita: la del cliente (nuestra app, con sus llaves de desarrollador), la del programa con saldo, dos de beneficiarios y una de punto de retiro; los extras suman dos comercios (Guía, § Checklist, 2 de octubre).

### Supuestos técnicos que se prueban el 8 de octubre

- [ ] Qué monedas ofrece la Test Wallet (define `asset_code` y los textos).
- [ ] Si un permiso de pago saliente sin receptor paga a varias wallets distintas; si no, plan B: un permiso por destino.
- [ ] Si la Test Wallet devuelve InsufficientGrant al superar el tope; si no, el paso 6 del video se cambia por un rechazo de la plataforma y se dice así.
- [ ] Cómo funciona y cuánto tarda la verificación de propiedad de una wallet address; si no funciona, plan B: enlazar sin verificar y mostrarlo como paso de producción.
- [ ] Cuánto dura el access token del permiso.
- [ ] Agregado en este documento: si consultar el pago entrante permite saber que un cobro en Pagando ya se pagó cuando se perdió la respuesta del pago saliente.
- [ ] Agregado en este documento: cuál de grant.cancel o token.revoke deja el permiso inutilizable.

Fuera del MVP, solo visión: operador de huella autorizado por la Registraduría, SECOP II o SIIF para contratos, sistema de caja del punto y SMS (Guía, § No hará y § Solo visión).

# 5. Vacíos y pendientes

Hay 28 pendientes: 4 contradicciones entre la Guía y las Historias, 4 pruebas técnicas para el Oct 8, 2026, 17 vacíos que ninguna fuente cubre y 3 preguntas sobre Bre-B (13 de octubre). Ninguno impide empezar el evento, pero los marcados como bloqueo deben cerrarse antes de escribir esa parte del código. Según la Guía, el Rol 1 decide lo técnico y el Rol 5 el alcance (§ Reglas de trabajo). El 14 de octubre se marcaron como cerrados los 4 que resolvió el código de `piloto-v2` (P-02, P-03, P-14 y P-20); el resto conserva el estado que le dé el equipo.

| # | Pendiente | Tipo | Qué afecta | Cómo se resuelve | Decide | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| P-01 | ¿Guardamos el PIN con hash o lo valida el servicio simulado? | Contradicción | Modelo de datos, RNF-06, HU-11 | Elegir una versión y corregir la otra fuente | Rol 1 | Abierto |
| P-02 | ¿La liquidación simulada es un servicio aparte o un módulo de la API? | Contradicción | Despliegue, estructura del repo, AD-13 | Módulo de la API en `/api/liquidacion`, consultado por HTTP (AD-13) | Rol 1 | Cerrado (piloto-v2) |
| P-03 | ¿El despliegue público es desde el viernes o es el extra 5? | Contradicción | AD-17, cámara de HU-22 y HU-23 | El despliegue en Vercel ya funciona (AD-17, § 3.6): puede estar desde el viernes | Rol 5 | Cerrado (piloto-v2) |
| P-04 | ¿El punto de pago digita el monto o el retiro es siempre el valor completo? | Contradicción | HU-10, RN-05, vista del punto | Cerrar la pregunta abierta de «retiro parcial» | Rol 5 | Abierto |
| P-05 | Permiso sin receptor que paga a varias wallets, e InsufficientGrant al superar el tope | Prueba técnica (bloqueo) | AD-09, AD-11, paso 6 del video | Script contra la Test Wallet | Rol 1 | Abierto |
| P-06 | Monedas de la Test Wallet y duración del access token | Prueba técnica | AD-18, HU-06 | Script contra la Test Wallet | Rol 1 | Abierto |
| P-07 | Verificación de propiedad de una wallet address en la Test Wallet | Prueba técnica (bloqueo) | HU-07, O3 | Script; si falla, plan B de las Historias | Rol 1 | Abierto |
| P-08 | Recuperar un cobro en Pagando cuando se perdió la URL del pago saliente | Prueba técnica (bloqueo) | RNF-05, HU-12 | Probar si el pago entrante revela que ya se pagó | Rol 1 | Abierto |
| P-09 | ¿Qué dispara el pago en el canal cuenta? | Vacío (bloqueo) | HU-09, contrato de la API | Definir si `POST /cobros` paga directo o se llama a confirmar sin PIN | Rol 1 | Abierto |
| P-10 | Contrato HTTP de la liquidación simulada: rutas, campos y errores | Vacío (bloqueo) | HU-02, HU-08, HU-10, HU-11 | Escribir el contrato antes del evento; el código se hace allá | Rol 1 | Abierto |
| P-11 | Ruta del callback de verificación de cuentas | Vacío | O3, `API_BASE_URL` | Nombrarla en la tabla de la API | Rol 1 | Abierto |
| P-12 | Dónde se guarda el bloqueo de 15 minutos de una cédula tras 3 PIN fallidos | Vacío | RN-07, modelo de datos | Un campo nuevo o derivarlo de los cobros rechazados | Rol 1 | Abierto |
| P-13 | Cuál de grant.cancel o token.revoke usa el cierre | Vacío | HU-17, AD-20 | Probarlo junto con P-05 | Rol 1 | Abierto |
| P-14 | Proveedor de base de datos (Supabase o Neon) y acceso (pg o Drizzle) | Vacío | AD-05, AD-06 | Supabase con Drizzle, como la rama de Pablo (AD-05, AD-06) | Rol 1 | Cerrado (piloto-v2) |
| P-15 | Enrutamiento, manejo de estado, persistencia del rol y lectura de `EXTRA_*` en el frontend | Vacío | Sección 2.1 | Elegir según lo que el equipo ya usó | Rol 1 | Abierto |
| P-16 | Quién genera la `idempotency_key` y dónde viven los textos de rechazo | Vacío | HU-10, HU-13 | Fijarlo en el contrato de la API | Rol 1 | Abierto |
| P-17 | Identidad visual y bocetos de las vistas | Vacío | Sección 1.5, RNF-04 | Bocetos del Oct 11, 2026 | Rol 5 | Abierto |
| P-18 | Indicador mientras el cobro está en Pagando y qué se muestra si pasa de 10 s | Vacío | RNF-02, vistas del punto y del beneficiario | Incluirlo en los bocetos | Rol 5 | Abierto |
| P-19 | Nombre comercial y logo | Vacío | Pitch, premio Comunidad | Proponer opciones con el equipo | Rol 5 | Abierto |
| P-20 | Dónde vive la orquestación del cobro (consultar la liquidación, aplicar la transición, pagar y guardar) | Vacío | Estructura del repositorio, sección 3.2 | `server/src/cobros/orquestacion.ts`; las rutas solo reciben y validan | Rol 1 | Cerrado (piloto-v2) |
| P-21 | ¿El retiro en efectivo es un retiro en corresponsal bancario o un giro postal? El giro postal exige licencia de MinTIC y el anexo técnico 2026 dice que el giro electrónico no equivale al postal | Vacío | Canal de efectivo, diapositiva de visión, preguntas del jurado | Preguntar a los mentores de Puntored e Interledger en el evento | Rol 5 | Abierto |
| P-22 | Biometría en producción: el anexo técnico 2026 exige cédula original y validación biométrica facial o dactilar en el punto; el MVP usa PIN | Vacío | HU-11, diapositiva de visión, preguntas del jurado | Decir en el pitch que el PIN es una simplificación de la demo | Rol 5 | Abierto |
| P-23 | ¿El cierre exporta la conciliación con la estructura del anexo técnico 2026 (CODHOGAR, CODPERSONA, valor pagado, fecha de cobro, código DANE)? | Vacío | HU-17, tablero de la entidad | Decidir si entra como detalle opcional del cierre | Rol 1 | Abierto |
| P-24 | Usar los términos del anexo técnico 2026: «orden de no pago» para el rechazo por programa cerrado y «archivo de liquidación» para la consulta | Vacío | Textos de rechazo, vistas, pitch | Alinear los textos de la interfaz | Rol 5 | Abierto |
| P-25 | Cuánto recibe hoy el punto por cada giro de los $4.275 de tarifa, y quién se queda con los rendimientos de la cuenta dispersora del operador | Vacío | Pitch: argumento de comisiones para los puntos | No hay fuente pública; preguntar a Puntored en el evento | Rol 5 | Abierto |
| P-26 | ¿Solo el titular puede registrar su número de documento como llave Bre-B? | Vacío | RN-15: la llave tipo cédula se verifica sola | Anexo 1 de la Circular Reglamentaria Externa DSP-465 (procesos de gestión de llaves) | Rol 1 | Abierto |
| P-27 | ¿Bre-B o un participante pueden responder «esta llave es de la cédula X: sí o no» y devolver el titular enmascarado? | Vacío | RN-16: verificar llaves que no son la cédula | El documento técnico de Bre-B no lo dice; buscar en la Circular DSP-465 o preguntar a mentores | Rol 1 | Abierto |
| P-28 | ¿Cuándo entran en las reglas de Bre-B los pagos de empresa (o entidad pública) a persona? | Vacío | Camino a producción de AD-21 | El documento técnico los pone en la agenda de ampliación; seguir la regulación de nómina y recaudos | Rol 5 | Abierto |

Correcciones menores en las fuentes, sin decisión de por medio:

- La Guía dice «7 estados» para la máquina del cobro (§ Revisión), pero su tabla y las Historias tienen 6.
- La tabla de estados del programa en la Guía no incluye Pausado, que sí está en HU-18.
- El modelo de datos de la Guía aún tiene `verificada` como booleano en `cuenta_beneficiario`; las Historias lo reemplazaron por un estado de tres valores.
- En el diccionario de las Historias, `motivo_rechazo` remite a las causas de «HU-17»; la tabla de causas está en HU-13.

# Historias de Usuario (HU) y criterios de aceptación

**Proyecto:** Tatú — la capa de distribución que convierte una liquidación ya aprobada en pagos bajo
demanda con Open Payments (Interledger).

## Cómo leerlo

- Formato de historia: **Como** «actor», **quiero** «acción», **para** «beneficio».
- Criterios: `CA-XX.YY`, en **Dado / Cuando / Entonces**.
- Prioridad (MoSCoW): **Must** = flujo principal · **Should** = baja un riesgo del flujo principal ·
  **Could** = extra (se enciende con su variable `EXTRA_*`).
- Montos: entero en unidades mínimas + `assetCode` + `assetScale` ($230.000,00 = `"23000000"`, COP
  escala 2). Datos de prueba sugeridos para el subsidio: 3 cédulas de $230.000 y tope $690.000.
- Los valores entre `backticks` son estados, campos o códigos de error del dominio; los textos entre
  «» son los mensajes que ve la persona.

## Backlog — 25 HU

| ID | Historia | Épica | Prioridad | Puntos |
| --- | --- | --- | --- | --- |
| HU-01 | Conectar un subsidio | E1 | Must | 3 |
| HU-02 | Consultar la liquidación de la entidad | E1 | Must | 3 |
| HU-03 | Registrar puntos de retiro | E1 | Must | 1 |
| HU-04 | Aprobar el permiso con tope en el banco | E2 | Must | 8 |
| HU-05 | Manejar una aprobación rechazada o vencida | E2 | Must | 2 |
| HU-06 | Rotar el token del permiso | E2 | Should | 2 |
| HU-07 | Enlazar y verificar mi cuenta (llave Bre-B o wallet) | E3 | Must | 8 |
| HU-08 | Ver «tengo $230.000» | E3 | Must | 2 |
| HU-09 | Cobrar a mi cuenta | E3 | Must | 5 |
| HU-10 | Solicitar un cobro con la cédula digitada | E4 | Must | 5 |
| HU-11 | Confirmar con PIN | E4 | Must | 3 |
| HU-12 | Recibir el reembolso en segundos | E4 | Must | 8 |
| HU-13 | Ver los rechazos con claridad | E5 | Must | 3 |
| HU-14 | Impedir el doble cobro | E5 | Must | 3 |
| HU-15 | Ver autorizado, cobrado y lo que nunca salió | E5 | Must | 5 |
| HU-16 | Registro y línea de tiempo | E5 | Must | 2 |
| HU-17 | Cerrar el programa y revocar el permiso | E5 | Must | 3 |
| HU-18 | Pausar el programa | E5 | Should | 1 |
| HU-19 | Elegir mi rol sin login | E6 | Must | 1 |
| HU-20 | Entregables del hackathon | E6 | Must | 1 |
| HU-21 | Extra 1 · Bono con destino | E7 | Could | 5 |
| HU-22 | Extra 2 · QR del beneficiario y cámara | E7 | Could | 5 |
| HU-23 | Extra 3 · Leer el PDF417 de la cédula | E7 | Could | 5 |
| HU-24 | Extra 4 · Contrato público por hitos | E7 | Could | 8 |
| HU-25 | Extra 5 · Despliegue público | E7 | Could | 2 |

---

# E1 · Conexión del subsidio

## HU-01 · Conectar un subsidio

**Como** entidad financiadora, **quiero** conectar un programa de subsidio con su vigencia y la
cuenta desde la que se paga, **para** que la plataforma pague cada cobro con mis reglas.

`E1` · **Must · 3 pts** · Roles 4 (vista) y 2 (API) · Depende de HU-19

- **CA-01.01 (creación):** Dado un programa nuevo, cuando lo guardo con `entidad`, `nombre`,
  `billetera`, `vigenciaInicio` y `vigenciaFin` (y `tipo`, por defecto `subsidio`), entonces queda en
  `Borrador`, con `destino=libre` y los canales a la cuenta y al retiro. No se mueve dinero.
- **CA-01.02 (normalización de la billetera):** Dado un payment pointer con `$`, cuando guardo,
  entonces se convierte a `https://` (sin `$` ni barra final). Si la billetera no resuelve
  (`walletAddress.get`), entonces responde 404 `BilleteraNoEncontrada` con «No encontramos esa
  cuenta» y **no se guarda**.
- **CA-01.03 (moneda copiada):** Dado una billetera válida, cuando guardo, entonces `assetCode` y
  `assetScale` se copian de la billetera resuelta y **no** vienen del formulario; la pantalla muestra
  la moneda real.
- **CA-01.04 (vigencia):** Dado `vigenciaFin <= vigenciaInicio`, cuando guardo, entonces responde 400
  `EntradaInvalida` (validación en la frontera).
- **CA-01.05 (bono, extra HU-21):** Dado `tipo=bono`, cuando lo creo, entonces `destino=restringido` y
  puedo asociar categorías y comercios (máx. 10 categorías). Un bono sin categorías no se puede
  autorizar (409 `BonoSinCategorias`).
- **CA-01.06 (edición):** Dado un programa en `Borrador`, cuando lo edito, entonces puedo cambiar
  todos los campos, incluidos `montoPorPersona` y `categorias`; fuera de `Borrador` responde 409
  `EstadoNoPermite`.
- **CA-01.07 (evento):** Al crear con éxito queda un evento `programa` con `hacia='Borrador'`, el
  detalle (billetera, código de moneda) y actor `entidad`. **Nunca** se guardan tokens, PIN ni
  llaves.
- **CA-01.08 (listado):** Dado el listado de programas, cuando lo consulto, entonces devuelve
  `estado`, `permisoActivo`, `permisoVencido`, tope y monto por persona, aplicando el vencimiento de
  la aprobación (10 min).

## HU-02 · Consultar la liquidación de la entidad

**Como** entidad, **quiero** que la plataforma consulte mi liquidación en lugar de guardar mi base de
beneficiarios, **para** seguir decidiendo quién recibe y cuánto sin entregar datos que no hacen
falta.

`E1` · **Must · 3 pts** · Rol 2 · Depende de HU-01 · Servicio simulado de la liquidación

- **CA-02.01:** Dado un programa en `Borrador`, cuando conecto la liquidación de prueba, entonces veo
  cuántas cédulas tiene y el total (datos de prueba: 3 cédulas y $690.000). Ese total será
  `tope_total` al autorizar (RN-08).
- **CA-02.02:** Dado una cédula con pago, cuando la plataforma pregunta, entonces la liquidación
  responde `disponible` y el `monto`.
- **CA-02.03:** Dado una cédula ya pagada, cuando se consulta, entonces responde `disponible=false` y
  `monto=null`.
- **CA-02.04:** Dado una cédula inexistente, entonces responde **404** «Esta cédula no está en la
  liquidación»; el punto ve el rechazo único de HU-13 sin saber si la cédula existía.
- **CA-02.05:** La plataforma **no** copia la lista: solo guarda cuentas enlazadas (HU-07) y cada
  cobro.
- **CA-02.06:** Dado que la liquidación no responde (503 o red), cuando alguien intenta cobrar,
  entonces el cobro se rechaza con «No pudimos consultar tu pago; intenta en un momento»
  (`LiquidacionNoResponde`) y queda un evento.
- **CA-02.07 (novedad retroactiva):** Dado una novedad cargada **después** de aprobar el permiso,
  cuando se cobra, entonces la plataforma **no** frena por el tope (RN-09): lo rechaza el banco con
  `InsufficientGrant` y el cobro queda `Fallido` sin mover dinero.

## HU-03 · Registrar puntos de retiro

**Como** entidad, **quiero** registrar los puntos de retiro con su billetera, **para** que el
beneficiario sin celular tenga dónde cobrar.

`E1` · **Must · 1 pt** · Rol 4 · Depende de HU-01

- **CA-03.01:** Dado que registro un punto con `nombre`, `direccion` (opcional; si no, «Sin
  dirección»), `billetera` y `tipo` (`retiro` por defecto), entonces se crea el punto. Si le indico un
  programa, la moneda del punto debe ser la del programa (409 `MonedaDistinta`).
- **CA-03.02:** Dado una billetera válida, se resuelve con `walletAddress.get`; si no resuelve,
  entonces responde **404 `BilleteraNoEncontrada`** («No encontramos esa billetera del punto»).
- **CA-03.03:** La billetera se normaliza a `https://` (sin barra final). Duplicado de billetera →
  409 `PuntoExiste`.
- **CA-03.04 (canal del punto):** Dado un punto de tipo `retiro`, cuando se le pide una compra,
  entonces responde 400 `PuntoNoAtiendeCanal`; una sede de comercio (`compra`) tampoco hace retiros.

---

# E2 · Autorización con Open Payments

## HU-04 · Aprobar el permiso con tope en el banco

**Como** entidad, **quiero** aprobar una sola vez en mi banco un permiso con tope sobre la cuenta del
programa, **para** que cada cobro se pague sin girar nada por adelantado.

`E2` · **Must · 8 pts** · Rol 1 · Depende de HU-01 y HU-02

Open Payments: `grant.request` de tipo `outgoing-payment` con acciones `create` y `read`,
`limits.debitAmount` = tope total, **sin receptor fijo**, `interact.finish` con un `nonce` propio;
luego `grant.continue`.

- **CA-04.01 (solicitud):** Dado un programa `Borrador` con su liquidación conectada (y con
  categorías si es un bono), cuando pulso «Aprobar en mi banco», entonces se genera el permiso con
  tope `tope_total` (COP escala 2) y el programa pasa a `EsperandoAprobacion`, devolviendo el enlace
  de consentimiento (`redirect`).
- **CA-04.02 (temporales solo backend):** La plataforma guarda `uri_continuacion`,
  `token_continuacion`, `nonce_cliente`, `nonce_cierre`, `url_permiso` y `aprobacion_solicitada_en`;
  **no** guarda `interact.redirect`, solo lo devuelve como `redirect`.
- **CA-04.03 (callback OK):** Dado que apruebo en la Test Wallet, cuando el callback llega con
  `interact_ref` y `hash`, entonces se verifica
  `base64(SHA-256(nonce_cliente + "\n" + nonce_cierre + "\n" + interact_ref + "\n" + grant_url))`
  (acepta 3 variantes: raw, sin padding y url-safe), se llama `grant.continue`, se guarda el
  `access_token` y `manage_url` **solo en el backend**, y el programa pasa a `Activo`.
- **CA-04.04 (hash inválido):** Dado un callback con hash inválido, cuando llega, entonces se
  registra un evento, el programa **no** cambia y el resultado es `invalido`.
- **CA-04.05 (idempotencia):** Dado el mismo callback dos veces, cuando llega el segundo, entonces no
  cambia nada (si ya está `Activo`, el resultado es `aprobado`).
- **CA-04.06 (sin receptor fijo):** El mismo permiso paga a cuentas de beneficiarios y a puntos. Es un
  límite de desembolso: **no** reserva ni separa la plata.

## HU-05 · Manejar una aprobación rechazada o vencida

**Como** entidad, **quiero** saber con claridad si rechacé o dejé vencer la aprobación, **para**
volver a intentarlo sin perder la configuración.

`E2` · **Must · 2 pts** · Rol 1 · Depende de HU-04

- **CA-05.01 (rechazada):** Dado `result=grant_rejected` en el callback, cuando llega, entonces el
  programa vuelve a `Borrador` con resultado `rechazado` («No aprobaste el permiso; puedes intentarlo
  de nuevo»).
- **CA-05.02 (inválida o vencida):** Dado `result=grant_invalid` o más de `APROBACION_TTL_MIN` (10)
  minutos sin aprobar, cuando vuelvo a la app, entonces el programa vuelve a `Borrador` con un
  mensaje claro.
- **CA-05.03 (cancelar manual):** Dado un programa en `EsperandoAprobacion`, cuando pulso «Cancelar
  aprobación», entonces se llama `grant.cancel` (best-effort) y el programa vuelve a `Borrador`.
- **CA-05.04 (configuración preservada):** En todos los casos se conserva la configuración y queda un
  evento `programa` con el resultado.

## HU-06 · Rotar el token del permiso

**Como** entidad, **quiero** que el permiso siga funcionando durante toda la vigencia, **para** que
ningún cobro falle por un token vencido.

`E2` · **Should · 2 pts** · Rol 1 · Depende de HU-04

- **CA-06.01 (rotación automática):** Dado un access token vencido (401, o 403 «Inactive Token» al
  crear un pago), cuando se detecta, entonces se rota el token con `token.rotate`, se guarda el nuevo
  y se **reintenta una sola vez** (con un mutex por programa para la concurrencia).
- **CA-06.02 (falla):** Dado que la rotación falla, cuando ocurre, entonces el cobro pasa a `Fallido`
  y la entidad ve «El permiso venció: apruébalo de nuevo».
- **CA-06.03 (renovación manual):** Dado un programa `Activo`/`Pausado` con el permiso vencido (la
  plataforma estuvo apagada), cuando pido renovar el permiso, entonces se pide un permiso nuevo **solo
  por el monto restante** (`tope − comprometido`); si no queda nada, 409 `TopeAgotado`. Lo ya cobrado
  se conserva y el tablero lo suma con `gastado_permisos_anteriores`.

---

# E3 · Cobro a la cuenta

## HU-07 · Enlazar y verificar mi cuenta (llave Bre-B o wallet)

**Como** beneficiaria con cuenta, **quiero** enlazar a mi cédula la llave Bre-B que ya uso (cédula,
celular, correo o @alias) y que se verifique que es mía, **para** recibir mi subsidio en la cuenta
que ya tengo.

`E3` · **Must · 8 pts** · Roles 1 (verificación) y 3 (vista) · Depende de HU-19

- **CA-07.01 (tipo elegido, RN-14):** Dado que elijo el tipo de llave (cédula, celular, correo o
  alfanumérica) y la escribo, cuando pulso «Enlazar», entonces se busca en el banco puente y se me
  muestra el titular enmascarado («¿Eres Ana M\*\*\* R\*\*\*?»). El tipo **nunca** se adivina por el
  formato. Un valor con formato inválido → 400 `LlaveInvalida`.
- **CA-07.02 (llave tipo cédula, RN-15):** Dado una llave tipo cédula que coincide con mi cédula,
  cuando confirmo, entonces la cuenta queda `Verificada`, sin PIN ni aprobación en el banco. Si la
  llave cédula es de otra persona → 422 `LlaveDeOtraPersona` («Esa llave no está a tu nombre»).
- **CA-07.03 (otra llave, RN-16):** Dado una llave de otro tipo, cuando confirmo con mi PIN, entonces
  queda `Verificada` solo si el banco puente confirma que su titular es mi cédula; si no, 422
  `LlaveDeOtraPersona` y no se enlaza. Si tengo PIN registrado y no coincide (o falta), 422
  `PinIncorrecto`.
- **CA-07.04 (llave inexistente):** Dado una llave que no existe en Bre-B, cuando la busco, entonces
  veo «No encontramos esa llave en Bre-B» (404 `LlaveNoExiste`) y puedo probar otra o cobrar en un
  punto.
- **CA-07.05 (wallet Open Payments):** Dado que elijo la opción avanzada e ingreso una billetera,
  cuando confirmo con mi PIN, entonces con `VERIFICACION_CUENTA=subject` la cuenta queda
  `PorVerificar` y voy a mi wallet a aprobar; con `VERIFICACION_CUENTA=simulada` queda `Verificada`
  directo. Con el callback de hash válido queda `Verificada`; si rechazo o pasan 10 minutos, vuelve a
  `SinEnlazar`.
- **CA-07.06 (una cuenta vigente):** Dado que ya tenía una cuenta vigente, cuando enlazo otra,
  entonces la anterior se desenlaza con su evento (una sola cuenta vigente por persona).
- **CA-07.07 (mínimo guardado):** La plataforma guarda solo el tipo de llave, la llave y el estado (o
  la `billetera`). **Nunca** guarda el nombre del titular ni tokens de la cuenta del beneficiario.

## HU-08 · Ver «tengo $230.000»

**Como** beneficiaria, **quiero** ver en una frase cuánto tengo disponible y cómo cobrarlo, **para**
decidir sin leer nada complicado.

`E3` · **Must · 2 pts** · Rol 3 · Depende de HU-02

- **CA-08.01:** Dado mi cédula con un pago disponible, cuando abro la vista Beneficiario, entonces veo
  todos mis subsidios/bonos pendientes (`pagos[]`), su moneda, y las opciones «A mi cuenta» (si la
  cuenta está `Verificada`) y «En un punto», con la lista de puntos.
- **CA-08.02 (ya cobrado):** Dado un subsidio ya cobrado, cuando abro la vista, entonces veo cuándo,
  dónde y la referencia (`ultimoCobro`/`historial`).
- **CA-08.03 (móvil):** La pantalla se lee completa a 360 px de ancho.
- **CA-08.04 (varios programas):** Una persona puede tener varios subsidios pendientes a la vez.

## HU-09 · Cobrar a mi cuenta

**Como** beneficiaria con cuenta verificada, **quiero** cobrar mi subsidio con un toque, **para**
tener la plata en segundos, sin filas ni ventanas de pago.

`E3` · **Must · 5 pts** · Rol 1 · Depende de HU-04, HU-07 y HU-12 (mismo adaptador de pago)

- **CA-09.01:** Dado un subsidio disponible y mi cuenta `Verificada`, cuando pulso «Cobrar», entonces
  el cobro pasa de `Solicitado` a `Pagando` **sin PIN** (la cuenta ya probó ser mía) y se llama al
  adaptador de pago (entrante en destino + saliente del programa con `debitAmount`).
- **CA-09.02:** Dado que el pago se completa, cuando la app consulta, entonces veo `Pagado` y la
  wallet a la que llega mi llave muestra el ingreso con la referencia.
- **CA-09.03 (cuenta no verificada):** Dado una cuenta `SinEnlazar`/`PorVerificar`, cuando intento
  cobrar, entonces responde 409 `CuentaNoVerificada` («Primero enlaza y verifica tu cuenta», RN-04).
- **CA-09.04 (autoenlace, RN-17):** Dado que no tengo cuenta enlazada y mi cédula es una llave Bre-B,
  cuando pulso «Cobrar», entonces se enlaza esa llave sola y el cobro sigue como cualquier cobro a la
  cuenta. Si no tengo cuenta ni llave cédula, 409 con «No tienes una cuenta enlazada ni tu cédula
  registrada como llave Bre-B. Enlaza una llave o cobra en un punto».
- **CA-09.05 (llave re-resuelta, RN-18):** Dado que mi llave cambió de banco o se borró después de
  enlazarla, cuando cobro, entonces se vuelve a resolver antes de pagar: el pago llega a la cuenta
  nueva, o el cobro queda `Rechazado` con «Tu llave Bre-B ya no existe: enlaza otra o cobra en un
  punto» sin mover dinero. Si el banco puente no responde, `PuenteNoResponde`.
- **CA-09.06 (idempotencia):** Dado que repito la misma llave de idempotencia, cuando envío, entonces
  se devuelve el mismo cobro (no duplica el pago).

---

# E4 · Cobro en el punto

## HU-10 · Solicitar un cobro con la cédula digitada

**Como** punto de retiro, **quiero** digitar la cédula del beneficiario y ver al instante si tiene un
pago disponible, **para** entregar el efectivo sin trámites ni fotos de documentos.

`E4` · **Must · 5 pts** · Roles 3 (vista) y 2 (API) · Depende de HU-02 y HU-03

- **CA-10.01 (el punto consulta):** Dado una cédula con subsidio disponible, cuando el punto donde se reclama la
  digita, entonces ve «Pago disponible: $230.000» con la persona y sus pagos; si la cédula no tiene
  pagos, recibe 404 `SinPagoDisponible` (no se filtra si la cédula existía).
- **CA-10.02 (solicitud):** Dado que el punto envía una solicitud de cobro con `canal='retiro'`, la
  cédula, el punto y una llave de idempotencia (y opcionalmente el programa), entonces el cobro queda
  `PorConfirmar` (espera PIN) y se aplican las reglas RN-01 a RN-06 (liquidación, programa, cuenta,
  destino, vigencia, moneda).
- **CA-10.03 (monto no mutable, RN-11):** Dado que el punto donde se reclama cambia el monto, cuando envía, entonces
  la plataforma solo acepta el valor disponible: el monto no viene del navegador; el backend calcula
  `monto = valor_disponible` para subsidios (RN-05).
- **CA-10.04 (el punto no elige programa):** Dado que la cédula puede estar en varios subsidios,
  cuando el punto digita la cédula, entonces se toma el programa activo que tenga un pago disponible
  para esa cédula.
- **CA-10.05 (sin PIN no hay retiro):** Dado una persona sin PIN registrado, cuando un punto intenta
  un retiro, entonces responde 422 `SinPin` («Esta persona no registró un PIN: solo puede cobrar a su
  cuenta»).
- **CA-10.06 (rechazos al solicitar):** Dado cédula sin pago disponible / programa pausado o cerrado
  / cuenta no verificada / destino no permitido / comercio no autorizado, cuando solicita, entonces
  responde 404/409 según corresponde y **no se crea ningún pago** con dinero movido (ver HU-13).
- **CA-10.07 (idempotencia y carrera):** Dado un doble clic, cuando llegan dos envíos con la misma
  llave de idempotencia, entonces se devuelve el mismo cobro. Dos intentos concurrentes de la misma
  cédula no duplican pagos (índice único parcial programa+cédula en estados activos, RN-02).

## HU-11 · Confirmar con PIN

**Como** beneficiario sin celular, **quiero** confirmar el cobro con mi PIN en el dispositivo del
punto, **para** que nadie cobre mi subsidio solo con saber mi cédula.

`E4` · **Must · 3 pts** · Rol 3 · Depende de HU-10

- **CA-11.01:** Dado un cobro `PorConfirmar`, cuando digito el PIN correcto (oculto con asteriscos),
  entonces el servicio simulado lo valida y el cobro pasa a `Pagando` (202) con el adaptador de pago.
- **CA-11.02:** Dado un PIN incorrecto, cuando lo digito, entonces responde 422 `PinIncorrecto` con
  `intentosRestantes` («PIN incorrecto, te quedan N intentos»).
- **CA-11.03:** Dado el tercer PIN incorrecto, cuando lo digito, entonces el cobro pasa a `Rechazado`
  («No pudimos confirmar tu identidad») y la cédula queda bloqueada `PIN_BLOQUEO_MIN` (15) minutos en
  ese programa (RN-07).
- **CA-11.04 (tiempo agotado, RN-12):** Dado que nadie confirma en `CONFIRMACION_TTL_SEG` (120 s),
  cuando vence el plazo (se evalúa al consultar, sin worker), entonces el cobro pasa a `Rechazado` por
  tiempo agotado y no se mueve dinero.
- **CA-11.05 (cancelar):** Dado un cobro `PorConfirmar`, cuando pulso «Cancelar», entonces pasa a
  `Rechazado` con «El cobro se canceló. No se movió dinero».
- **CA-11.06 (privacidad):** La plataforma **no** guarda PIN ni huellas; el PIN lo valida el
  simulador. En producción este paso es la biometría de un operador autorizado.

## HU-12 · Recibir el reembolso en segundos

**Como** punto de retiro, **quiero** recibir en mi wallet el valor que entregué apenas el beneficiario
confirma, **para** no fondear mi caja por adelantado ni esperar al cierre del ciclo.

`E4` · **Must · 8 pts** · Rol 1 · Depende de HU-04 y HU-11

Open Payments: `incoming-payment` (grant + create, monto + `metadata` con la referencia) en la wallet
de destino; `outgoing-payment` (create desde la cuenta del programa con el token del permiso,
`incomingPayment` + `debitAmount`); `outgoingPayment.get` hasta verlo completado;
`getGrantSpentAmounts` para el tablero. Este adaptador también paga el cobro a la cuenta (HU-09).

- **CA-12.01 (guarda antes de llamar):** Dado un cobro confirmado, cuando la plataforma va a pagar,
  entonces guarda `Pagando` **antes** de llamar a Open Payments y guarda las URLs del pago entrante y
  del saliente en el cobro.
- **CA-12.02:** Dado que el pago se completa, cuando el punto consulta, entonces el cobro pasa a
  `Pagado` (RN-10) y la caja muestra «Pagado · entrega $X · Ref. SUB-XXXX». La Test Wallet del
  destino muestra el ingreso real con la referencia.
- **CA-12.03 (reintento sin duplicar):** Dado un error de red después de crear el pago saliente,
  cuando se reintenta, entonces se consulta `outgoingPayment.get` y **no** se crea un segundo pago.
  Si el banco no responde (timeout), el cobro **no** se marca Fallido: queda `Pagando` y se reconcilia
  al consultar.
- **CA-12.04:** El punto entrega el efectivo **solo** cuando ve `Pagado`.
- **CA-12.05 (desempeño):** Del PIN correcto (o del «Cobrar») a `Pagado` en 10 s o menos en la Test
  Wallet (9 de 10 cobros).

---

# E5 · Control del cobro y cierre

## HU-13 · Ver los rechazos con claridad

**Como** punto o beneficiario, **quiero** ver en palabras sencillas por qué no se puede pagar,
**para** entender qué pasó sin llamar a nadie.

`E5` · **Must · 3 pts** · Rol 2 · Depende de HU-10 y HU-12

- **CA-13.01:** Dado cualquiera de las causas de la tabla, cuando ocurre, entonces la pantalla
  muestra el mensaje, **no se mueve dinero** y queda un evento.

| Causa | Se detecta | Mensaje | Estado del cobro |
| --- | --- | --- | --- |
| Subsidio ya cobrado | al solicitar | «Este subsidio ya fue cobrado» | `Rechazado` |
| Subsidio en proceso o cobrado | al solicitar | «Este subsidio ya está en proceso o fue cobrado» | `Rechazado` |
| Tope del programa superado | al pagar (`InsufficientGrant`) | «El banco rechazó el pago: el programa llegó a su tope» | `Fallido` |
| Programa cerrado | al solicitar | «El programa está cerrado y ya no recibe cobros» | `Rechazado` |
| Sin pago disponible en la liquidación | al solicitar | «Esta cédula no tiene pagos disponibles en este programa» | `Rechazado` |
| Cuenta no verificada | al solicitar | «Primero enlaza y verifica tu cuenta» | `Rechazado` |
| PIN errado 3 veces o tiempo agotado | al confirmar / consultar | «No pudimos confirmar tu identidad» | `Rechazado` |
| Programa pausado o fuera de vigencia | al solicitar | «El programa no está recibiendo cobros» | `Rechazado` |
| Fondos insuficientes en el programa | al pagar | «El programa no tiene fondos en este momento» | `Fallido` |
| Liquidación no responde | al solicitar | «No pudimos consultar tu pago; intenta en un momento» | `Rechazado` |
| Permiso vencido | al pagar | «El permiso venció: apruébalo de nuevo» | `Fallido` |
| Comercio no autorizado (bono) | al solicitar | «Este comercio no acepta este bono» | `Rechazado` |
| Bono fuera de comercios | al solicitar | «Este bono solo se usa en comercios autorizados» | `Rechazado` |
| Llave Bre-B ya no existe | al pagar | «Tu llave Bre-B ya no existe: enlaza otra o cobra en un punto» | `Rechazado` |
| Banco puente de Bre-B no responde | al solicitar | «No pudimos consultar Bre-B; intenta en un momento» | `Rechazado` |
| Error del banco sin causa confirmada | al pagar | «El banco no pudo procesar el pago. No se movió dinero» | `Fallido` |
| Cobro cancelado | al cancelar | «El cobro se canceló. No se movió dinero» | `Rechazado` |

- **CA-13.02 (los tres visibles):** Los tres rechazos que se muestran en la demostración son subsidio
  ya cobrado, tope superado y programa cerrado.
- **CA-13.03 (quién frena):** Un `Rechazado` nunca movió dinero; un `Fallido` por tope o por fondos
  lo decidió el banco después de que la plataforma **no** lo filtró (RN-09).

## HU-14 · Impedir el doble cobro

**Como** entidad, **quiero** que una cédula no cobre dos veces el mismo subsidio, ni en dos puntos a
la vez ni en un punto y en su cuenta al mismo tiempo, **para** que cada peso que sale corresponda a un
cobro real.

`E5` · **Must · 3 pts** · Rol 2 · Depende de HU-10

- **CA-14.01:** Dado dos puntos que envían la misma cédula a la vez, cuando ambos intentan, entonces
  un **índice único parcial** sobre programa y cédula (solo en estados `Solicitado`, `PorConfirmar`,
  `Pagando` y `Pagado`) deja ganar a uno; el otro ve «Este subsidio ya está en proceso o fue cobrado»
  (`CobroEnCurso` / `YaCobrado`).
- **CA-14.02:** Dado un cobro a la cuenta y un retiro al mismo tiempo, cuando llegan, entonces solo uno
  avanza (RN-02).
- **CA-14.03:** Dado una confirmación duplicada, cuando llega, entonces la llave de idempotencia y la
  `version` evitan un segundo pago (bloqueo optimista al actualizar el cobro).
- **CA-14.04:** Un cobro `Rechazado` libera la cédula para intentarlo de nuevo.
- **CA-14.05 (test):** Un test automatizado reproduce la carrera de dos solicitudes simultáneas y pasa
  en cada commit.

## HU-15 · Ver autorizado, cobrado y lo que nunca salió

**Como** entidad, **quiero** ver en tiempo real cuánto autoricé, cuánto se ha cobrado y cuánto nunca
salió de mi cuenta, **para** dejar de esperar reportes del operador.

`E5` · **Must · 5 pts** · Roles 4 (vista) y 1 (datos) · Depende de HU-04 y HU-12

- **CA-15.01:** Dado un programa `Activo`, cuando abro el tablero, entonces veo `autorizado` (el
  tope), `cobrado` (leído del permiso con `getGrantSpentAmounts`; fuente `banco`, o `plataforma` si
  falla), `noHaSalido = autorizado − cobrado` y el desglose `porCanal` (cuenta, retiro, compra:
  cobros y monto).
- **CA-15.02:** Dado un cobro que acaba de pasar a `Pagado`, cuando el tablero se actualiza, entonces
  las cifras lo reflejan en 5 s o menos (`POLL_INTERVALO_MS=1000`).
- **CA-15.03:** Debajo, en pequeño, aparecen los segundos entre el cobro y el reembolso al punto
  (`reembolsoSegundos`) y «plata girada por adelantado: $0».
- **CA-15.04:** Ningún token ni URL de gestión del permiso llega al navegador (viven solo en el
  backend).

## HU-16 · Registro y línea de tiempo

**Como** entidad, **quiero** que cada cobro quede registrado con quién, dónde, cuándo, cuánto y su
referencia, **para** que la conciliación posterior se reduzca mucho.

`E5` · **Must · 2 pts** · Rol 2 · Depende de HU-01

- **CA-16.01:** Cada cambio de estado de un programa, una cuenta o un cobro crea un evento con
  `desde`, `hacia`, `texto`/`detalle` y `creado` (hora del servidor).
- **CA-16.02:** Dado un cobro, cuando abro su detalle, entonces veo sus eventos en orden y la
  referencia del pago (`referencia`, que viaja en el `metadata` del pago entrante).
- **CA-16.03:** Los eventos **nunca** guardan tokens, PIN ni llaves.

## HU-17 · Cerrar el programa y revocar el permiso

**Como** entidad, **quiero** cerrar el programa revocando el permiso, **para** que nadie pueda volver
a cobrar y ver cuánto dinero nunca salió de mi cuenta.

`E5` · **Must · 3 pts** · Rol 1 · Depende de HU-15

- **CA-17.01:** Dado un programa `Activo` o `Pausado`, cuando confirmo escribiendo «CERRAR», entonces
  se revoca el permiso (`grant.cancel`/`token.revoke`) y el programa pasa a `Cerrado`. Sin «CERRAR»:
  400 `ConfirmacionRequerida`.
- **CA-17.02:** Dado un programa `Cerrado`, cuando un punto intenta un cobro, entonces se rechaza con
  409 «El programa está cerrado y ya no recibe cobros» (`ProgramaCerrado`).
- **CA-17.03:** El tablero muestra el cierre (`autorizado`, `cobrado`, `nuncaSalio`, `cerradoEn`) y
  «plata girada por adelantado: $0».
- **CA-17.04:** Es irreversible: la app pide una segunda confirmación y la plataforma valida la
  cadena.
- **CA-17.05:** Dado que hay cobros enviándose (`Pagando`), cuando intento cerrar, entonces responde
  409 `CobrosEnCurso` («Hay cobros enviándose; espera a que terminen para cerrar»).

## HU-18 · Pausar el programa

**Como** entidad, **quiero** pausar el programa, **para** dejar de aceptar cobros nuevos sin revocar
el permiso.

`E5` · **Should · 1 pt** · Rol 2 · Depende de HU-04

- **CA-18.01:** Dado un programa `Activo`, cuando pulso «Pausar», entonces pasa a `Pausado` y todo
  cobro nuevo se rechaza con «El programa no está recibiendo cobros».
- **CA-18.02:** Los cobros que ya están en `Pagando` terminan normalmente; «Reanudar» devuelve el
  programa a `Activo`.

---

# E6 · Plataforma y entregables

## HU-19 · Elegir mi rol sin login

**Como** jurado o integrante del equipo, **quiero** cambiar entre Entidad, Beneficiario y Punto con un
selector, **para** recorrer la demostración completa en un solo dispositivo.

`E6` · **Must · 1 pt** · Rol 4

- **CA-19.01:** Dado la web, cuando elijo un rol (`entidad`/`beneficiario`/`punto`), entonces elijo
  también una cédula de prueba (beneficiario) o un punto de prueba y veo su vista **sin contraseña**.
- **CA-19.02:** El rol elegido se recuerda al recargar la página (`sessionStorage`).

## HU-20 · Entregables del hackathon

**Como** equipo, **quiero** un repositorio público con todo en `main`, `AI_USAGE.md`, `/prompts` y un
README con el video, **para** cumplir la entrega y no ser descalificados.

`E6` · **Must · 1 pt** · Rol 5

- **CA-20.01:** A las 11:00 del sábado: repo público, todo en `main`, `AI_USAGE.md` en la raíz y
  `/prompts/<rol>.md` con el texto real de los prompts.
- **CA-20.02:** `.gitignore` con `.env` y `*.key` desde el primer commit; ningún secreto en el
  historial (`gitleaks`/grep: 0 hallazgos).
- **CA-20.03:** El chequeo de salud confirma que la base responde y que la llave coincide con el JWKS
  publicado (`llave.coincide === true`); sin base o con llave incorrecta, 503.
- **CA-20.04:** El estado del sistema dice si son «pagos reales» o «simulados» y qué falta
  (`faltan[]`), incluida la base de datos (`tipo`: postgres/pglite, `donde`).
- **CA-20.05:** README con cómo correrlo y enlace al video; video y slides a las 12:00.

---

# E7 · Extras (solo si sobra tiempo, Could, con su `EXTRA_*`)

## HU-21 · Extra 1 · Bono con destino

**Como** entidad que entrega bonos, **quiero** un segundo programa restringido a ciertos comercios,
**para** mostrar que el mismo motor paga contra otro evento: una compra válida.

`E7` · **Could · 5 pts** · Rol 2 · Depende de HU-01, HU-11 y HU-12 · `EXTRA_BONO`

- **CA-21.01:** Dado un programa `bono`, cuando lo creo, entonces `destino=restringido` y marco qué
  categorías y comercios lo aceptan.
- **CA-21.02:** Dado un comercio autorizado, un total de $80.000 y un bono de $60.000, cuando el
  punto donde se reclama digita la cédula y el cliente confirma con PIN, entonces se pagan **$60.000** al comercio y
  el cliente paga **$20.000** aparte (RN-05: `monto = min(valor_disponible, total_compra)`).
- **CA-21.03:** Dado un comercio no autorizado, cuando digita la cédula, entonces responde 409 «Este
  comercio no acepta este bono» y no se mueve dinero.
- **CA-21.04:** Dado un bono, cuando alguien intenta cobrarlo a su cuenta o en retiro, entonces se
  rechaza con «Este bono solo se usa en comercios autorizados» (RN-03).
- **CA-21.05 (verificación del comercio):** Un comercio se registra con NIT (5-15 dígitos), razón
  social, CIIU (4 dígitos) y sede inicial; la categoría se infiere del CIIU. La entidad lo verifica y
  solo los comercios verificados aceptan bonos.

## HU-22 · Extra 2 · QR del beneficiario y cámara

**Como** beneficiario con celular, **quiero** mostrar un QR temporal y que el punto lo lea con su
cámara, **para** que el punto donde se reclama no tenga que digitar mi cédula.

`E7` · **Could · 5 pts** · Rol 3 · Depende de HU-08, HU-10 y HU-25 · `EXTRA_QR` · `QR_TTL_SEG=60`

- **CA-22.01:** Dado un pago disponible, cuando pulso «Mostrar QR», entonces veo un QR que vence en 60
  segundos y **solo** lleva un token, sin datos personales.
- **CA-22.02:** Dado el punto servido por HTTPS, cuando el punto donde se reclama escanea el QR, entonces el flujo
  sigue igual que con la cédula, incluido el PIN.
- **CA-22.03 (alternativa):** Si la cámara no abre, digitar la cédula siempre funciona.

## HU-23 · Extra 3 · Leer el PDF417 de la cédula

**Como** punto, **quiero** leer el código PDF417 de la cédula amarilla con la cámara o un lector 2D,
**para** no digitar el número y evitar errores.

`E7` · **Could · 5 pts** · Rol 3 · Depende de HU-10 y HU-25 · `EXTRA_PDF417`

- **CA-23.01:** Dado una cédula amarilla con holograma, cuando la paso por la cámara, entonces el
  campo cédula se llena solo.
- **CA-23.02:** Dado un lector 2D que escribe como teclado, cuando lee el código, entonces el campo se
  llena y se envía.
- **CA-23.03 (alternativa):** Si la lectura falla, digitar el número siempre funciona.

## HU-24 · Extra 4 · Contrato público por hitos

**Como** entidad contratante, **quiero** que el pago de cada hito de un contrato se libere cuando el
supervisor lo certifique, **para** pagar contra un evento y no contra una fecha, con trazabilidad
pública del desembolso.

`E7` · **Could · 8 pts** · Roles 1 (pagos) y 4 (tablero público) · Depende de HU-04 y HU-12 ·
`EXTRA_CONTRATO`

- **CA-24.01:** Dado un contrato con tres hitos y su valor, cuando la entidad lo conecta, entonces
  aprueba un permiso con tope igual al valor del contrato. El permiso es un límite de desembolso: no
  reserva ni separa la plata (RN-09).
- **CA-24.02:** Dado un hito pendiente, cuando el supervisor lo certifica, entonces se paga ese hito a
  la wallet del contratista con su referencia (mismo adaptador de HU-12).
- **CA-24.03:** Dado un hito sin certificar, cuando alguien intenta pagarlo, entonces se rechaza; y
  ningún hito se paga dos veces (RN-13 + idempotencia).
- **CA-24.04:** Dado el tablero público del contrato, cuando cualquiera lo abre, entonces ve los hitos
  certificados y lo pagado, nunca cuentas, tokens ni datos personales.

## HU-25 · Extra 5 · Despliegue público

**Como** jurado, **quiero** un enlace público a la app, **para** probarla por mi cuenta después de la
presentación.

`E7` · **Could · 2 pts** · Rol 2 · `EXTRA_DEPLOY`

- **CA-25.01:** La web y la API corren juntas en Vercel, en un solo dominio con HTTPS; el enlace va en
  el README y en las slides.
- **CA-25.02:** Los callbacks del permiso y de la verificación de cuentas usan `API_BASE_URL` (no
  `localhost`).
- **CA-25.03:** La cámara (HU-22/HU-23) solo funciona con HTTPS: sin este extra, esos dos necesitan un
  túnel.

---

## Ampliación del 17 de octubre · Retiro parcial y venta con el retiro

Estas dos historias se agregan sin cambiar las anteriores. Donde amplían un criterio existente, lo
dicen. Reglas en la Especificación (§ 17) y en `db/README.md` (§ 12).

## HU-26 · Retirar solo una parte del subsidio en un punto

**Como** beneficiario, **quiero** decidir en el punto cuánto retiro de mi subsidio, **para** dejar el
resto disponible y retirarlo después.

`E3` · **Should** · Punto · Amplía HU-10 (CA-10.03) y HU-14

- **CA-26.01 (todo o una parte):** Dado un subsidio con $150.000 disponibles, cuando el punto elige
  «Una parte» y digita $90.000, entonces el cobro es de $90.000 y a la persona le quedan $60.000. Sin
  elegir, se retira todo (como antes).
- **CA-26.02 (solo en el punto):** Dado el canal `cuenta`, cuando la persona cobra, entonces se paga
  todo lo que queda, sin elegir monto (RN-22). Un `monto` en otro canal responde `400`.
- **CA-26.03 (validación en el backend, amplía CA-10.03):** Dado un monto mayor que el saldo, con
  centavos o en cero, cuando el punto lo envía, entonces responde `422` (`SaldoInsuficiente` o
  `MontoInvalido`) y no se crea cobro. El punto puede pedir menos que el saldo, nunca más; el backend
  sigue decidiendo (RN-19 a RN-21).
- **CA-26.04 (varios retiros):** Dado que ya retiró $90.000, cuando vuelve por $30.000, entonces el
  sistema sabe que le quedan $30.000. Al agotar el saldo deja de aparecer como pago disponible y un
  nuevo intento se rechaza con «Este subsidio ya fue cobrado».
- **CA-26.05 (un pago que falla no descuenta):** Dado un retiro que termina `Fallido` o se cancela,
  entonces el saldo vuelve a estar disponible completo.
- **CA-26.06 (sin doble retiro, amplía HU-14):** Dado un retiro esperando el PIN o pagándose, cuando
  llega otro de la misma persona, entonces se rechaza. Dos solicitudes simultáneas no reservan más que
  el saldo, y la misma llave de idempotencia devuelve el mismo cobro.
- **CA-26.07 (bonos sin cambios):** Dado un bono, entonces sigue siendo de un solo uso y solo en
  comercios autorizados: nunca se retira en efectivo.

## HU-27 · Registrar la compra hecha durante el retiro y enviarla a facturar

**Como** encargado del punto, **quiero** registrar que la persona compró algo en la tienda con parte de
su retiro, **para** entregar solo el efectivo que corresponde y no tener que digitar la venta otra vez
en mi sistema de facturación.

`E3` · **Should** · Punto

- **CA-27.01 (opcional):** Dado un retiro, cuando el punto no registra compra, entonces todo el retiro
  se entrega en efectivo.
- **CA-27.02 (parte del retiro):** Dado un retiro de $90.000 con una compra de $50.000, entonces antes
  del PIN el punto ve el desglose: retiro $90.000, compra $50.000, **efectivo $40.000** y le quedan
  $60.000. El mismo desglose aparece en la pantalla del PIN, y al quedar `Pagado` la pantalla dice
  «Entrega en efectivo $40.000».
- **CA-27.03 (menor que el retiro):** Dada una compra igual o mayor que el retiro, en cero o con
  centavos, entonces responde `422 VentaInvalida` y no se crea cobro (RN-23).
- **CA-27.04 (sigue al retiro):** Dado que el retiro termina `Rechazado` o `Fallido`, entonces la venta
  queda `Anulada` y no se factura.
- **CA-27.05 (facturación aparte):** Dado que el retiro queda `Pagado`, entonces la venta se envía al
  sistema de facturación con su id como `Idempotency-Key`. Si el sistema no responde, el retiro sigue
  `Pagado`, el saldo no se toca y la venta queda pendiente para reenviar; reenviar nunca crea una
  segunda factura.
- **CA-27.06 (caja):** Dado un día con retiros con compra, entonces «Mi caja» separa el efectivo
  entregado de lo vendido con retiros.

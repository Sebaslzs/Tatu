# Investigación — Cobro por partes y DIAN

> Fecha: 2026-10-16 · Estado: investigación, **sin código** · No es asesoría tributaria: las conclusiones
> deben validarse con un contador. Complementa el «Plan saldo y cobro por partes»
> (`D:\PREPARACION\docs\piloto`, aprobado el 15 de octubre).

## 1. El problema en una frase

En una misma visita, la persona hace **dos operaciones de naturaleza distinta**, y el punto podría
contabilizarlas como si fueran una sola:

| Parte | Ejemplo | Qué es para el punto | Qué le toca declarar |
|---|---|---|---|
| Efectivo | $100.000 | **Plata de un tercero.** Entrega dinero por cuenta de la entidad o del operador y luego se le devuelve | Solo su **comisión** es ingreso propio |
| Almuerzo | $50.000 | **Venta propia.** El subsidio es solo el **medio de pago** | Ingreso gravado + factura electrónica + IVA o impuesto al consumo |
| Saldo | $50.000 | Nada: no ha salido de la cuenta de la entidad | — |

**El fraude:** el punto reporta los $150.000 como «subsidio pagado por cuenta de terceros» y esconde los
$50.000 de la venta. Así deja de pagar renta, IVA o impuesto al consumo, e ICA.

**El fraude inverso, más común en programas de alimentos:** registrar una «compra» que no existió y
entregarle efectivo a la persona con un descuento. En Estados Unidos lo llaman *trafficking*. Con eso, un
bono restringido se vuelve efectivo y el comercio se queda con la diferencia.

## 2. Cómo lo controlan hoy

### 2.1 Separar el dinero de terceros del ingreso propio

- La DIAN reconoce **ingresos para terceros** cuando hay intermediación: quien recibe «obra por cuenta
  ajena» y transfiere lo recibido a quien le corresponde (doctrina reiterada en los oficios 907500 de 2021 y
  559 de 2022). Las comisiones, en cambio, son ingreso propio gravado.
- Por eso, quien entrega efectivo no es «una tienda» cualquiera. Es un **corresponsal bancario** (opera
  «a nombre y por cuenta» de un banco) o un **agente de un operador postal de pago** (SuperGIROS, Efecty,
  SuRed). Su dinero de retiros se concilia contra un **cupo** con el banco u operador, separado de sus
  ventas, y su ingreso es la comisión. Esto ya está abierto en nuestro plan (P-21): el punto que entrega
  efectivo tiene que ser corresponsal o agente postal.

### 2.2 Facturar al momento de redimir

- Con bonos (regalo, alimentación), la DIAN dice que **la venta ocurre cuando se redime el bono**. En ese
  momento se expide la factura y se causa el IVA. El bono es solo un medio de pago (Oficio 016302 de 2019;
  criterio desde el Concepto 115061 de 2000).
- El almuerzo pagado con subsidio es exactamente eso: el comercio debe expedir **factura electrónica o
  documento equivalente POS electrónico** por $50.000 a la persona (consumidor final) e indicar el medio de pago.

### 2.3 Cruces de información de la DIAN

- **Factura electrónica con validación previa:** la DIAN recibe en línea cada venta facturada.
- **Información exógena:** los terceros que pagan reportan a quién le pagaron y cuánto. La DIAN cruza lo
  que otros dicen haberle pagado a un NIT con lo que ese NIT declaró. Para el año gravable 2026 rige la
  Resolución Única 000227 de 2025 con sus modificaciones (000233 de 2025 y 000012 de 2026). Además, se
  creó un formato específico de **ingresos recibidos para terceros** del exterior (2854), dirigido a
  pasarelas y giros. Es la señal de que la DIAN está cerrando justo este hueco.
- **Por qué el fraude se detecta:** si la entidad o el operador reporta «le pagué $50.000 por ventas al
  NIT X» y X no tiene facturas ni ingresos por ese valor, el cruce lo evidencia. **Lo que hace posible el
  fraude es que nadie reporte el desglose.**

### 2.4 Programas de subsidios en especie

| Programa | Control |
|---|---|
| **SNAP (EE. UU.)** | Solo comercios **autorizados**. El sistema ALERT analiza todas las transacciones EBT y busca patrones: varias compras del mismo hogar en minutos, montos altos en tiendas de tickets bajos, montos redondos. Luego investiga y **descalifica** de por vida a quien trafica. La auditoría de 2023 de la OIG revisó 1.560 millones de transacciones. |
| **Bonos de Integración Social (Bogotá)** | El canje se hace en **comercios asignados por localidad** (Colsubsidio, Jumbo, Metro), con la cédula precargada. Un bono no se puede usar en otro comercio. |
| **Cajas de compensación** | Pagan la cuota monetaria por convenio en sus propias droguerías o en aliados (Tiendas Ara, Efecty). El canal y el aliado los define el contrato. |

**Patrón común:** pocos comercios autorizados, registro de cada transacción con su tipo, analítica sobre
esos datos y sanción por exclusión. **Nadie confía en la declaración del comercio:** el control está en
quien procesa el pago.

## 3. Cómo lo adaptamos en Tatú

> **Decisión del equipo (16 de octubre):** cualquier tienda de barrio con RUT activo que cumpla los
> requisitos del ministerio puede ser punto, y **el mismo punto entrega efectivo y vende**. La persona
> decide en el momento cuánto retira y cuánto gasta. No se separan puntos por canal, porque eso reduciría la
> red, y la red amplia es el factor social del proyecto.

**Ventaja de Tatú:** somos los únicos que vemos el desglose en el momento en que ocurre. El banco ve un
pago saliente, el punto ve su caja y la DIAN ve lo que alguien le reporte. Si Tatú registra y entrega el
desglose, el fraude del § 1 deja de ser invisible.

**Lo que cambia con un punto mixto:** ya no basta con la estructura (el punto que vende no tiene canal de
efectivo). El riesgo se concentra en **la etiqueta de cada cobro**: el tendero digita «retiro $150.000»
cuando en realidad entregó $100.000 y un almuerzo. Si la etiqueta es falsa desde el origen, el reporte a
la DIAN coincide con lo que el tendero declara, y **el cruce de la DIAN no lo detecta**. Por eso los
controles se apoyan en tres cosas: el testigo (la persona), los incentivos y la analítica.

### 3.1 Habilitación: compatible con la red amplia

- Entregar efectivo por cuenta de otro está regulado: lo hace un **corresponsal** (Decreto 2555 de 2010,
  título 2.36.9, uniformado por el Decreto 2672 de 2012) o un agente postal. **No es una barrera alta:**
  miles de tiendas de barrio ya son corresponsales por medio de redes, y la Circular Externa 002 de 2021
  de la Superfinanciera admite corresponsales móviles y digitales (Decreto 222 de 2020).
- **Propuesta:** el requisito del ministerio es *RUT activo + facturación electrónica habilitada + contrato
  de corresponsalía*. El corresponsal puede ser del **banco puente** (AD-21) o de una red existente. Tatú
  hace el enrolamiento y la tienda firma una sola vez. Así se mantiene «casi cualquier comercio que lo
  desee y cumpla». **Sigue abierto como P-21.**

### 3.2 Controles

| # | Control | Estado |
|---|---|---|
| C-1 | **Nunca un cobro mixto.** Una visita genera un cobro por canal: `retiro` de $100.000 y `compra` de $50.000, cada uno con su referencia `SUB-…`. El mismo punto puede generar los dos | Ya existe la separación por canal. **Cambia** que un punto solo atendiera uno (ver § 3.4) |
| C-2 | **Un punto, dos etiquetas.** Cada pago a la billetera del punto lleva canal y referencia en la descripción del pago. Opcionalmente, el punto usa **dos direcciones de billetera** sobre la misma cuenta (`…/retiros` y `…/ventas`), para que su contabilidad lo separe sola | Nuevo |
| C-3 | **Confirmación ciega del efectivo.** En un retiro, el tendero digita el monto y **la persona digita por su cuenta cuánto efectivo recibió**, con su PIN. Si no coinciden, no hay pago. Para disfrazar el almuerzo como retiro, el tendero tiene que pedirle explícitamente a la persona que mienta, y ella puede denunciarlo | Nuevo. Es el control principal para el punto mixto |
| C-4 | **Comprobante desglosado** (pantalla + SMS): «Efectivo $100.000 · Compra $50.000 en Tienda X · Te quedan $50.000» | Nuevo |
| C-5 | **CUFE obligatorio en compras.** Para liquidar una `compra`, el comercio adjunta el CUFE (96 caracteres) o el CUDE del POS electrónico. Tatú revisa el formato, la unicidad y que el total de la factura sea ≥ el monto cobrado. La validación contra la DIAN es asíncrona (hasta 48 h) | Nuevo. En la demo: campo + formato + unicidad |
| C-6 | **Incentivos neutrales.** Si el retiro paga comisión y la compra no, el tendero tiene **doble motivo** para etiquetar todo como retiro: gana la comisión y no factura. La remuneración tiene que ser igual por canal, o mejor para la compra (por ejemplo, la compra se liquida al instante y el retiro al cierre del día) | Nuevo; decisión de negocio |
| C-7 | **Reporte por NIT y canal** (mensual) para la entidad y el comercio: retiros, comisiones y compras con sus CUFE. Sirve para la exógena de la entidad y la contabilidad de la tienda. Detecta a quien declara **distinto** de lo que se etiquetó, pero no una etiqueta falsa (para eso están C-3 y C-8) | Nuevo (extiende `porCanal`, HU-15) |
| C-8 | **Verificación aleatoria posterior.** A una muestra de personas le llega un SMS o WhatsApp: «¿Recibiste $150.000 en efectivo en Tienda X? Sí / No». Un «No» abre revisión del punto. Es la versión barata de las visitas encubiertas de SNAP | Nuevo; para producción |
| C-9 | **Alertas tipo ALERT** (§ 3.3) | Nuevo; para producción |

### 3.3 Alertas sugeridas (producción)

- **Punto mixto con casi 0 % de compras** cuando sus pares de la zona venden un 20 % o 30 %. Es la firma
  del fraude del § 1.
- **Retiros que no son múltiplos de $10.000** (el efectivo se entrega en billetes; un monto «de almuerzo»
  etiquetado como retiro es sospechoso) y compras que siempre agotan el saldo exacto (*trafficking*).
- Mismo beneficiario con varios cobros en el mismo punto en pocos minutos.
- Retiros diarios de un punto por encima de lo que plausiblemente tiene en caja una tienda de su tamaño.
- Compras sin CUFE validado a las 48 h, o un CUFE presentado dos veces.
- Respuestas «No» en C-8, o diferencias en C-3, concentradas en un mismo punto.

### 3.4 Impacto en las HU y la especificación (pendiente de aprobar; no editado)

| Dónde | Hoy | Propuesta |
|---|---|---|
| Especificación, tabla `punto` | `tipo` `retiro`/`compra` exclusivo; `comercio_id` solo si es compra | `canales` ⊆ {retiro, compra}; **todo punto pertenece a un comercio** (NIT/RUT) |
| HU-03, CA-03.04 | `PuntoNoAtiendeCanal` si el tipo no coincide | Solo se rechaza si el canal no está **habilitado** en ese punto (por ejemplo, no tiene corresponsalía) |
| HU-11 / RN-07 | La persona confirma con su PIN | En `retiro`, la persona además digita el monto recibido (C-3) |
| `cobro` | `totalCompra` en compras | Además `cufe` en compras (C-5), único |

### 3.5 Lo que Tatú **no** hace

- No declara ni paga impuestos por el punto.
- No emite facturas por el comercio.
- No decide sanciones: Tatú entrega datos y alertas, y la **entidad** suspende o excluye al comercio, como
  hace FNS con SNAP.

## 4. Para la demo del 17 de octubre

Lo que más vende con poco código es **C-3 + C-4**: en la caja, la persona digita cuánto efectivo recibió y
ve su comprobante desglosado. C-5 a C-9 pueden presentarse como diseño. Frase sugerida para el jurado:

> «Cualquier tienda de barrio puede ser punto: entrega efectivo y vende en la misma caja. Cada peso queda
> etiquetado, y la etiqueta la confirma la persona, no el tendero: ella digita cuánto efectivo recibió.
> Cada venta exige su factura electrónica.»

## 5. Preguntas abiertas (propuestas)

| ID | Pregunta | A quién |
|---|---|---|
| P-31 | ¿Tatú, como pasarela que ordena pagos por cuenta de la entidad, tiene obligación de reportar exógena? ¿O la tiene solo la entidad? | Contador / DIAN |
| P-32 | ¿La entidad pública debe practicar retención en la fuente sobre lo que paga al comercio por la compra de un beneficiario, o el comprador es la persona (consumidor final) y no aplica? | Contador |
| P-33 | ¿Existe un servicio para que terceros validen el estado de un CUFE de forma automática, por medio de un proveedor tecnológico? La consulta pública de la DIAN es manual y puede pedir CAPTCHA | Proveedor de facturación |
| P-21 | (ya abierta, se amplía) ¿Basta con RUT activo + facturación electrónica + corresponsalía (del banco puente o de una red) para que una tienda entregue efectivo y venda? ¿Puede el ministerio crear una habilitación propia sin corresponsalía? | Prosperidad Social / SFC |

## Fuentes

- Ingresos para terceros: [Oficio DIAN 907500 de 2021](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_907500_2021.htm), [Oficio 559 (903530) de 2022](https://ambitojuridico.com/sites/default/files/2022-06/Cpto-559%28903530%29-22.PDF), [CIJUF](https://www.cijuf.org.co/node/23539)
- Bonos y momento de facturar: [Oficio DIAN 016302 de 2019](https://normograma.dian.gov.co/dian/compilacion/docs/oficio_dian_16302_2019.htm), [Actualícese](https://actualicese.com/facturacion-electronica-para-bonos-regalos-expedidos-en-almacenes/)
- Exógena 2026: [Actualícese](https://actualicese.com/exogena-del-ano-gravable-2026-cambios-que-deben-quedar-listos-antes-del-cierre-contable/), [Siigo](https://www.siigo.com/blog/obligaciones-fiscales/informacion-exogena/), [INCP](https://incp.org.co/publicaciones/infoincp-publicaciones/impuestos/2026/05/dian-modifica-formatos-de-informacion-exogena-y-ajusta-plazos-para-grandes-contribuyentes/), [Siempre al día — Res. 000012 de 2026](https://siemprealdia.co/colombia/impuestos/resolucion-000012-de-2026-cambios-en-exogena/)
- CUFE: [DIAN — verificar factura](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/como-verifico-si-una-factura-fue-validada-por-la-dian/), [Siempre al día](https://siemprealdia.co/colombia/impuestos/que-es-el-cufe/), [Siigo](https://www.siigo.com/blog/obligaciones-fiscales/validar-una-factura-electronica/)
- SNAP / ALERT: [USDA PIA de ALERT](https://Usda.Gov/sites/default/files/documents/fncs-alert-pia.pdf), [FNS — trafficking](https://fns-prod.azureedge.us/sites/default/files/SNAP_Trafficking.pdf), [OIG 2023](https://usdaoig.oversight.gov/sites/default/files/reports/2023-12/27901-0002-13.pdf), [WCPO](https://wcpo.com/news/local-news/i-team/i-team-whos-minding-the-store-when-it-comes-to-retail-food-stamp-fraud)
- Bonos de Bogotá: [bogota.gov.co](https://bogota.gov.co/mi-ciudad/integracion-social/personas-con-discapacidad-redimir-bonos-de-alimentos-bogota-junio-2024)
- Corresponsalía: [Decreto 2672 de 2012](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=51010), [Decreto 34 de 2015](https://normograma.supersalud.gov.co/compilacion/docs/decreto_0034_2015.htm), [Circular Externa 002 de 2021 de la SFC](https://www.cijuf.org.co/sites/cijuf.org.co/files/normatividad/2021/Circular%20Fleteo.pdf)
- Corresponsales y comisiones (analogía): [Concepto DIAN 33253 de 2017](https://cdn.actualicese.com/normatividad/2017/Conceptos/C033253-17.pdf)

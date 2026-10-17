# Investigación — Reconocimiento facial en caja

> Fecha: 2026-10-16 · Estado: investigación, **sin código** · Relacionado: HU-11 (CA-11.06), README §«Fuera del
> alcance» («fotos de identidad»).

## 1. Resumen

- En producción, un punto de pago **no "reconoce" a nadie**: hace una **verificación 1:1**. El beneficiario dice
  quién es (cédula), la caja toma una foto y un **verificador** responde «sí/no es la cédula X» comparando contra
  **una foto de referencia confiable** de esa cédula. La búsqueda 1:N (¿quién es esta cara entre millones?) es
  otro problema, más caro y con más riesgo legal.
- La parte difícil no es comparar caras (eso es barato y maduro) sino **probar que hay una persona viva frente a
  la cámara** (detección de vida / *liveness*) y que la imagen **no fue inyectada** (cámara virtual, deepfake).
- En Colombia la referencia confiable es el **ANI de la Registraduría** (foto y huellas de la cédula). Se accede
  por convenio o mediante **operadores biométricos aliados**; los bancos ya lo usan, y en las elecciones de
  mayo de 2026 la Registraduría hizo un piloto facial **como complemento de la huella**, que sigue siendo el
  canal maduro.
- Encaja con lo que ya diseñamos: CA-11.06 dice «la plataforma no guarda PIN ni huellas… en producción este
  paso es la biometría de un operador autorizado». La cara entra en **ese mismo espacio**: Tatú pregunta y
  recibe un resultado firmado; **nunca guarda fotos ni plantillas**.
- La biometría es **dato sensible** (Ley 1581 de 2012). La SIC exige una **alternativa** que no use biometría. El
  PIN/huella no desaparece: queda como camino alterno obligatorio.

## 2. Cómo funciona en producción

```
 Caja (tablet / PC del punto)                Verificador (operador biométrico / Registraduría)
 ┌──────────────────────────────┐            ┌──────────────────────────────────────────────┐
 │ 1. Captura guiada (SDK)      │            │ 4. Detección de inyección + vida (servidor)  │
 │    calidad: luz, pose, foco  │──imagen──▶ │ 5. Extrae plantilla (vector de ~512 números) │
 │ 2. Vida en dispositivo       │  cifrada   │ 6. Compara 1:1 con la referencia de cédula X │
 │ 3. Firma la captura (nonce)  │  + nonce   │ 7. Decide por umbral → {match, puntaje, id}  │
 └──────────────────────────────┘            └──────────────────────────────────────────────┘
```

### 2.1 Captura y calidad

El SDK guía al usuario (acércate, quita gafas oscuras, más luz) y descarta fotos malas antes de enviarlas. Una
parte grande de los rechazos en campo viene de la mala calidad, no de un fraude.

### 2.2 Detección de vida (PAD)

Existen dos familias de ataque, y cada una tiene su norma:

| Ataque | Ejemplo | Norma / certificación |
|---|---|---|
| **De presentación** (algo frente al sensor) | foto impresa, video en otro celular, máscara | ISO/IEC 30107-3; laboratorios como iBeta (niveles 1/2) |
| **De inyección** (la imagen nunca pasó por la cámara) | cámara virtual, deepfake, emulador | CEN/TS 18099 (2024); iBeta empezó a certificarlo en junio de 2026 |

Un certificado ISO 30107-3 **no cubre la inyección**. Al elegir proveedor hay que pedir las dos cosas.

- **Pasiva:** con una sola foto o una ráfaga, el modelo detecta textura, reflejos, bordes de pantalla o
  profundidad. Es la mejor experiencia y la que usa la mayoría hoy.
- **Activa:** se le pide a la persona que parpadee, gire la cabeza o siga una luz. Es más robusta frente a
  ataques simples, pero más lenta y confunde a usuarios mayores.

**Ventaja de la caja:** el dispositivo es del punto, la captura es **asistida** y el cajero ve a la persona.
Eso baja mucho el riesgo de inyección comparado con un *onboarding* desde el celular del usuario. Por eso el
dispositivo debe estar registrado (atestación, sin cámaras virtuales) y cada captura debe ir atada a un
**nonce del cobro**, para que no se pueda reusar.

### 2.3 Comparación y umbral

- La cara se convierte en una **plantilla** (*embedding*). Comparar dos plantillas toma microsegundos, así que
  el costo de cómputo es irrelevante.
- El umbral fija el balance entre **FMR** (aceptar a un impostor) y **FNMR** (rechazar al titular). En pagos se
  opera con un FMR muy bajo (del orden de 1 en 10.000 a 1 en 1.000.000). En las evaluaciones de NIST (FRTE 1:1),
  los mejores algoritmos rechazan menos del ~1 % de titulares a esos niveles **con fotos de buena calidad**.
- **El riesgo real para Tatú:** la referencia del ANI puede ser la foto de la cédula de hace 10 a 20 años, y
  nuestra población incluye muchos adultos mayores. El envejecimiento y la mala calidad de la referencia suben
  el falso rechazo, y NIST documentó diferencias por edad, sexo y origen (NISTIR 8280). **Sin un camino
  alterno, se le niega el subsidio a alguien legítimo.**

### 2.4 Decisión, auditoría y alterno

El resultado vuelve **firmado** con un id de transacción. Se guarda **solo eso** (no la imagen). Si sale «no
coincide» o hay error de calidad, se reintenta (máximo N veces, reutilizando `PIN_BLOQUEO_MIN`). Después se
pasa al alterno: huella o PIN, o revisión asistida.

## 3. ¿Contra qué base se compara?

| Opción | Referencia | Pros | Contras |
|---|---|---|---|
| **A. Registraduría (ANI)** vía convenio u operador biométrico aliado | Foto (y huellas) de la cédula | Fuente oficial; ya la usa la banca; el ciudadano no tiene que enrolarse | Convenio y tarifas (Resolución 1500 de 2026, cifras no verificadas); fotos viejas; dependencia de disponibilidad |
| **B. Enrolamiento por el programa** (la entidad toma una selfie + documento al inscribir) | Selfie reciente | Referencia fresca → menos falsos rechazos | La entidad pasa a custodiar biometría (consentimiento, RNBD, seguridad); hay que validar el documento en el enrolamiento |
| **C. Proveedor KYC** (enrolamiento + reautenticación) | Selfie del onboarding | Liveness certificado incluido; integración rápida | Costo por transacción; el dato queda en un tercero, a veces fuera del país (transferencia internacional) |

**Recomendación:** **A** como fuente de verdad, **B o C** solo si las pruebas muestran demasiados falsos
rechazos con la foto de la cédula. En todos los casos el que custodia es el **gobierno o el operador**, nunca
Tatú. Esto coincide con la decisión de datos mínimos: el gobierno es dueño de beneficiarios y huellas, y Tatú
solo lee.

**1:N** (deduplicar que una misma cara no cobre con dos cédulas) solo tiene sentido en el **enrolamiento** y es
responsabilidad de la entidad. Con millones de personas exige umbrales muy estrictos e índices vectoriales.
No lo recomendamos para la caja.

## 4. Arquitectura propuesta para Tatú (producción)

```
Punto ──(1) cédula──▶ Tatú API ──(2) crea sesión de verificación {cobroId, nonce, TTL 2 min}
  │                                         │
  │◀──────────── (3) token de sesión ───────┘
  │
  └─(4) SDK del verificador captura + vida ──▶ Verificador (gobierno / operador)
                                                 │ compara 1:1 con la referencia de la cédula
Tatú API ◀── (5) webhook firmado {nonce, match, puntaje, vida, txId} ──┘
  │
  └─(6) si match → autoriza el cobro (flujo actual de HU-11). Guarda solo {txId, resultado, fecha}.
```

- **La imagen no pasa por Tatú.** El SDK la envía directo al verificador. Así Tatú no trata dato sensible y no
  queda en su alcance de seguridad.
- Encaja con la interfaz actual del simulador de gobierno: hoy «valida PIN», mañana «valida PIN **o** cara».
  Para el resto del flujo es la misma respuesta (sí/no + bloqueo).
- **No funcionales:** latencia objetivo < 5 s de extremo a extremo; reintentos idempotentes por `nonce`; modo
  degradado (si el verificador cae, se usa el alterno, nunca «aprobar por defecto»); métricas de FNMR por punto
  para detectar cámaras o luz malas.
- **Conectividad rural:** si un punto no tiene buena red, la verificación en el servidor falla. La salida es
  una plantilla cifrada en el dispositivo con *match-on-device*. Es más compleja y queda para fase 2.

## 5. Marco legal en Colombia (resumen, no es asesoría jurídica)

- **Ley 1581 de 2012:** los datos biométricos son **sensibles**. Exigen autorización **previa, expresa e
  informada**, decir para qué se usan y que **no es obligatorio** entregarlos.
- **SIC, Resolución 52185 de 2025:** ordenó a un conjunto residencial borrar datos faciales y **ofrecer
  alternativas** que no usen datos sensibles. **SIC, mayo de 2025:** multó a Mercado Libre con $214,4 millones por
  exigir reconocimiento facial. → **La cara no puede ser el único camino para cobrar un subsidio.**
- Además: registro de la base en el RNBD (lo hace el responsable, es decir la entidad), contratos de
  transmisión con el operador y política de retención y borrado.

## 6. Viabilidad y escalabilidad

| Aspecto | Evaluación |
|---|---|
| Técnica | **Alta.** Es tecnología madura; la banca colombiana ya hace millones de validaciones biométricas al mes (sobre todo con huella). |
| Escala | El cómputo no limita. Lo que limita es el **costo por transacción** (tarifa de la Registraduría o del proveedor) y la **calidad de captura** en miles de puntos. |
| Costo | Se cobra por verificación. Hay que pedir cotización a 2 o 3 operadores aliados y revisar la tarifa de la Resolución 1500 de 2026. |
| Riesgo principal | **Falsos rechazos en adultos mayores** con fotos viejas → se necesita alterno y medición en un piloto. |
| Riesgo legal | Manejable si Tatú no custodia la biometría y existe la alternativa. |
| Encaje con Tatú | Bueno. Reemplaza el PIN simulado sin cambiar el flujo de cobro; es un «proveedor de verificación» intercambiable. |

## 7. Demo del hackathon (librería básica)

**Opción sugerida:** usar [`@vladmandic/human`](https://github.com/vladmandic/human) en el navegador. Hace
detección, descriptor facial, modelos pequeños de *antispoof* y *liveness*, y detección de parpadeo. Corre
con WebGL y no necesita servidor de ML.

- **Enrolamiento:** al inscribirse en el programa, el beneficiario se toma una selfie (con una casilla de
  consentimiento). El descriptor se guarda en el **esquema del gobierno simulado**, no en el de Tatú, para
  mantener el relato de que «el gobierno custodia».
- **Caja:** el punto digita la cédula, se abre la cámara, se pide un parpadeo y se calcula el descriptor. Se
  llama al endpoint del gobierno simulado («verificar cara») y este compara la distancia con el descriptor
  guardado y responde sí/no. Mismo contrato que el PIN.
- **El PIN sigue disponible** como alterno: es lo que exigiría la SIC y además salva la demo si la luz del
  lugar es mala.

**Limitaciones que hay que decir en voz alta en el pitch:** el descriptor se calcula en el navegador (se puede
falsificar), los modelos de vida son pequeños y no están certificados, y no hay detección de inyección. Para
el jurado: «en producción este paso lo hace un operador biométrico certificado contra el ANI de la
Registraduría; Tatú solo recibe sí/no».

> ⚠️ **Tiempo:** la presentación es el 17 de octubre. Esto amplía el alcance (el README deja «fotos de identidad»
> fuera) y toca el flujo de cobro, que es la columna de la demo en vivo. Si se hace, conviene que vaya detrás
> de un interruptor (`VERIFICACION=pin|cara`) con PIN por defecto.

## 8. Preguntas abiertas

1. ¿La entidad del programa tendría convenio con la Registraduría, o contrataría un operador aliado?
2. ¿Cuál es la tarifa vigente de autenticación facial (Resolución 1500 de 2026)? No pude leer el sitio de la
   Registraduría (devuelve 403 a clientes automatizados).
3. ¿Qué FNMR tiene la foto de la cédula en mayores de 60 años? Habría que medirlo en un piloto antes de
   escalar.
4. ¿Cuál es el estado actual del piloto facial con la banca (2022–2023) y del piloto electoral de 2026?

## Fuentes

- Registraduría, piloto facial en elecciones de 2026: [El Tiempo](https://www.eltiempo.com/politica/elecciones-colombia-2026/registraduria-implementa-biometria-facial-para-reconocer-la-identidad-de-los-ciudadanos-en-las-elecciones-de-este-31-de-mayo-asi-funciona-3560885), [Infobae](https://www.infobae.com/colombia/2025/02/02/elecciones-del-2026-en-colombia-contaran-con-biometria-facial-confirmo-la-registraduria-nacional-asi-funcionara/)
- Registraduría y sector financiero: [comunicado](https://www.registraduria.gov.co/Registraduria-Nacional-pone-a-disposicion-del-sector-financiero-tecnologia-de.html), [El País](https://www.elpais.com.co/colombia/la-autenticacion-por-biometria-facial-es-segura-registraduria-y-bancos-avanzan-en-las-pruebas-pilotos.html), [Vanguardia](https://www.vanguardia.com/economia/nacional/2022/08/19/arranca-el-piloto-de-la-biometria-facial-en-colombia/), [Asobancaria](https://www.asobancaria.com/wp-content/uploads/2023/01/Programa_Autenticacion_Biometrica_2023_v1801.pdf)
- Convenios ANI y tarifas: [Informe de gestión 2025](https://www.registraduria.gov.co/IMG/pdf/20260130_informe_de_gestion_institucional_2025.pdf), [Tarifas vigentes](https://www.registraduria.gov.co/-Tarifas-vigentes-.html)
- Presentación vs. inyección: [iBeta IAD / CEN TS 18099](https://www.ibeta.com/ibeta-launches-injection-attack-detection-testing-against-cens-ts-18099/), [Signzy](https://www.signzy.com/blogs/injection-attack-detection), [Facephi](https://facephi.com/observatory/ataque-presentacion-vs-inyeccion/)
- SIC y biometría: [El Tiempo](https://www.eltiempo.com/justicia/servicios/la-sic-prohibe-a-las-administraciones-exigir-datos-biometricos-para-ingresar-a-conjuntos-residenciales-3575752), [Portafolio](https://www.portafolio.co/mis-finanzas/vivienda/sic-pone-limites-al-uso-de-datos-biometricos-para-ingresar-a-conjuntos-residenciales-499619), [El Colombiano (Mercado Libre)](https://www.elcolombiano.com/negocios/superindustria-multa-a-mercado-libre-por-exigir-reconocimiento-facial-LD27359424)
- Librería para la demo: [Human — demo FaceID](https://forja.metatencion.es/ambiser/human/src/branch/main/demo/faceid)
- Exactitud y sesgo: NIST FRTE 1:1 y NISTIR 8280 (2019), de conocimiento general; no los consulté en esta sesión.

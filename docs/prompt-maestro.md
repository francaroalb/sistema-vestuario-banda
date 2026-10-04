# PROYECTO: GESTIÓN DE VESTUARIO — BANDA MUNICIPAL NTRA. SRA. DEL VALLE

Quiero desarrollar una aplicación web privada para la gestión del vestuario de la Banda Municipal Ntra. Sra. del Valle de La Palma del Condado.

La aplicación debe formar parte del mismo ecosistema digital que nuestra aplicación de gestión de entradas, actualmente desplegada en:

`entradas.bmlapalma.com`

La nueva aplicación estará previsiblemente en:

`trajes.bmlapalma.com`

IMPORTANTE: no quiero que desarrolles toda la aplicación de una vez.

Debemos trabajar ESTRICTAMENTE POR FASES.

En cada fase debes:

1. Analizar únicamente lo necesario para esa fase.
2. Explicar brevemente qué vas a implementar.
3. Implementarlo.
4. Indicarme claramente cómo puedo probarlo.
5. Señalar decisiones importantes tomadas o dudas detectadas.
6. DETENERTE.
7. Esperar mi confirmación antes de continuar con la siguiente fase.

NO debes implementar funcionalidades pertenecientes a fases posteriores aunque consideres que puedes adelantarlas.

El objetivo es revisar progresivamente arquitectura, modelo de datos, UX y reglas de negocio antes de añadir más complejidad.

---

# 1. OBJETIVO GENERAL

La Banda dispone de un inventario propio de prendas de uniforme que se ceden tanto a músicos de la propia Banda como a músicos externos que participan como refuerzos en determinadas actuaciones.

Actualmente necesitamos controlar manualmente:

- qué prendas tenemos;
- qué talla tiene cada prenda;
- quién tiene físicamente cada prenda;
- desde cuándo;
- para qué actuaciones está prevista;
- cuándo debería devolverse;
- si está disponible;
- si está pendiente de lavandería;
- si está dañada;
- qué prendas utilizó anteriormente una persona;
- quién gestionó cada entrega/devolución;
- y qué vestuario hay que preparar para próximas actuaciones.

La aplicación debe resolver esta gestión de una forma MUY RÁPIDA desde un teléfono móvil.

En muchas ocasiones el responsable estará de pie en un ensayo o antes/después de una actuación con un músico delante.

Por ello, la prioridad absoluta de UX es:

**pocos clics + información clara + acciones rápidas + evitar trabajo administrativo innecesario.**

La aplicación también debe funcionar perfectamente desde escritorio y tablet.

---

# 2. STACK TECNOLÓGICO

Utilizar:

- Angular
- TypeScript
- versión estable actual compatible en el momento de iniciar el proyecto
- standalone components
- Angular Signals cuando aporten valor
- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security
- Cloudflare Pages
- Git
- GitHub
- PWA

No utilizar:

- Spring Boot
- microservicios
- backend propio
- infraestructura innecesaria
- servicios de pago salvo que sean absolutamente imprescindibles

La aplicación debe poder mantenerse dentro de los free tiers previstos para este volumen de uso.

El proyecto Supabase será TOTALMENTE INDEPENDIENTE del utilizado por la aplicación de entradas.

También tendrá repositorio GitHub independiente y despliegue Cloudflare independiente.

No crear un monorepo.

---

# 3. ECOSISTEMA Y BRANDING

Esta aplicación debe sentirse como una aplicación hermana de:

`entradas.bmlapalma.com`

Queremos construir progresivamente un pequeño ecosistema digital de la Banda.

Mantener:

- misma identidad visual;
- mismos principios de diseño;
- misma familia de componentes cuando tenga sentido;
- mismos colores corporativos;
- comportamiento parecido de botones, formularios, tarjetas, cabeceras, modales y navegación.

Identidad general:

- granate/burdeos oscuro como color principal;
- blanco y fondos claros;
- dorado como color de acento;
- estética elegante, moderna y relacionada con una institución musical/cultural;
- interfaces limpias;
- evitar apariencia genérica de panel empresarial.

Si se proporciona acceso al código de la aplicación de Entradas, analizar sus estilos/componentes reutilizables antes de recrearlos.

NO crear todavía una librería npm compartida ni una infraestructura de Design System compleja.

Sí definir correctamente design tokens reutilizables:

- colores;
- tipografía;
- spacing;
- border radius;
- sombras;
- tamaños;
- estados;
- botones;
- inputs;
- tarjetas.

Esto debe facilitar que futuras aplicaciones puedan seguir el mismo branding.

---

# 4. MOBILE FIRST + ESCRITORIO + PWA

La aplicación debe diseñarse MOBILE FIRST.

Caso habitual:

- responsable con móvil;
- músico delante;
- buscar persona;
- seleccionar prenda;
- entregar;
- firmar;
- confirmar.

Los targets táctiles deben ser amplios.

Evitar tablas horizontales incómodas en móvil.

Priorizar:

- tarjetas;
- listas;
- bottom sheets/modales cuando proceda;
- buscadores accesibles;
- botones grandes;
- acciones contextuales;
- feedback inmediato.

Pero NO debe ser una aplicación exclusivamente móvil.

En escritorio:

- aprovechar mejor el espacio;
- permitir vistas más amplias;
- utilizar tablas cuando realmente mejoren la gestión;
- mantener navegación y jerarquía coherentes.

Debe ser PWA instalable.

Debe poder añadirse a la pantalla de inicio de iPhone/Android y abrirse con apariencia de aplicación independiente.

NO se publicará inicialmente en App Store ni Google Play.

---

# 5. AUTENTICACIÓN

La aplicación es COMPLETAMENTE PRIVADA.

No existe ninguna web pública previa.

Al acceder a:

`trajes.bmlapalma.com`

si el usuario no tiene una sesión válida debe mostrarse directamente:

LOGIN

Utilizar Supabase Auth.

Autenticación inicial:

- email
- contraseña
- sesión persistente

No permitir registro público.

Los usuarios serán creados/controlados por los responsables de la Banda.

Habrá aproximadamente 3-4 administradores.

Inicialmente todos tendrán los mismos permisos.

Utilizar un único rol:

`ADMIN`

No crear sistemas de permisos complejos.

Cualquier ruta privada debe estar protegida.

---

# 6. AUDITORÍA

Aunque todos tengan los mismos permisos, es MUY IMPORTANTE saber quién realizó cada operación.

Registrar para acciones importantes:

- administrador;
- fecha/hora;
- tipo de acción;
- entidad afectada;
- información relevante.

Ejemplos:

- Fran entregó C-05-48 a Juan.
- Manuel recibió la devolución de C-08-46.
- Fran cambió una asignación.
- Manuel marcó una prenda como dañada.

No es necesario crear inicialmente un sistema empresarial de event sourcing.

Diseñar una auditoría sencilla, útil y mantenible.

---

# 7. INVENTARIO DE PRENDAS

Cada prenda física es ÚNICA y está etiquetada individualmente.

Ejemplos:

`C-01-44`
`C-02-46`
`C-03-46`

El formato exacto de los códigos no debe quedar excesivamente hardcodeado.

Tipos iniciales:

- Chaqueta
- Camisa
- Pantalón

Debe ser posible ampliar tipos posteriormente.

Cada prenda debe almacenar al menos:

- identificador interno;
- código visible;
- tipo de prenda;
- talla;
- estado físico;
- observaciones opcionales;
- activa/archivada;
- timestamps.

NO utilizar cantidades agregadas tipo:

`10 chaquetas talla 48`

Cada chaqueta es un registro independiente.

---

# 8. ESTADOS DE LAS PRENDAS

Mantener los estados físicos MUY SIMPLES.

Estados iniciales:

- DISPONIBLE
- PENDIENTE_LAVANDERIA
- DANADA

No crear inicialmente:

- fuera de servicio;
- reparación;
- revisión;
- perdido;
- etc.

Si una prenda deja definitivamente de utilizarse, se puede ARCHIVAR.

Archivar no debe destruir su histórico.

IMPORTANTE:

`CEDIDA` NO debe ser un estado físico almacenado.

Una prenda está cedida si existe una cesión activa que indica que una persona la tiene físicamente.

De igual forma:

`ASIGNADA`

no es un estado físico.

Una prenda puede estar físicamente DISPONIBLE en la Banda pero tener una asignación futura.

Separar claramente:

**estado físico**
de
**situación logística**.

Ejemplo:

`C-05-48`
Estado físico: Disponible
Situación: Asignada a Juan para el 15 de mayo

---

# 9. PERSONAS

Debe existir una entidad PERSONA.

Una persona puede ser:

- músico de la Banda;
- refuerzo.

No acoplar rígidamente el tipo de persona al tipo de cesión.

Un refuerzo podría excepcionalmente tener una cesión larga.

Un músico de la Banda podría necesitar una cesión temporal.

Además, una persona podría pasar de refuerzo a músico de la Banda sin duplicar su registro.

Campos iniciales:

- nombre;
- instrumento;
- tipo;
- teléfono opcional;
- observaciones opcionales;
- activa/archivada;
- timestamps.

NO almacenar obligatoriamente una "talla habitual".

La talla debe inferirse principalmente del histórico real de prendas utilizadas.

---

# 10. HISTÓRICO DE TALLAS

Ejemplo:

Juan Ruiz ha utilizado:

- C-05-48
- C-12-48
- C-03-46

La aplicación puede inferir:

`Talla habitual según histórico: 48`

o:

`En sus últimas cesiones utilizó chaqueta talla 48.`

Este dato debe derivarse del histórico, no mantenerse manualmente como una fuente de verdad.

Las observaciones de la persona pueden contener información humana como:

`La 48 le quedaba algo justa.`

No es necesario que el algoritmo interprete automáticamente este texto.

---

# 11. UNIFORMES

No hardcodear conceptos como:

"verano = camisa"

Crear un concepto configurable de UNIFORME.

Ejemplos:

Uniforme de verano:
- Camisa

Uniforme de invierno:
- Chaqueta

Otro uniforme futuro:
- Chaqueta
- Pantalón

Un uniforme define qué TIPOS DE PRENDA necesita una persona para una actuación.

Esto permitirá que una persona pueda necesitar simultáneamente más de una prenda.

Ejemplo:

Juan:
- C-05-48
- P-12-44

---

# 12. CESIONES

Una CESIÓN representa el periodo real durante el cual una persona tiene físicamente una o varias prendas.

NO crear como tipos rígidos únicamente:

- temporal;
- indefinida.

Modelar mediante fechas.

Una cesión tendrá conceptualmente:

- persona;
- fecha/hora de entrega;
- fecha de devolución prevista nullable;
- fecha de devolución real nullable;
- estado;
- prendas relacionadas;
- actuaciones relacionadas cuando proceda;
- administrador responsable;
- histórico/movimientos.

Ejemplos:

## Músico de Banda

Entrega:
14/02/2026

Devolución prevista:
NULL

Esto representa una cesión indefinida.

## Refuerzo de una actuación

Entrega:
15/05/2027

Devolución prevista:
15/05/2027

## Refuerzo durante un fin de semana

Entrega:
07/05/2027

Devolución prevista:
09/05/2027

## Semana Santa

Entrega:
Domingo de Ramos

Devolución prevista:
Viernes Santo

Una cesión puede contener varias prendas.

---

# 13. DEVOLUCIONES PARCIALES

Una cesión puede contener:

- chaqueta;
- camisa;
- pantalón.

Debe ser posible devolver solamente una parte.

Ejemplo:

- camisa devuelta;
- pantalón devuelto;
- chaqueta continúa en poder del músico.

La cesión no se considera completamente finalizada hasta que todas las prendas correspondientes hayan sido devueltas.

---

# 14. CAMBIO DE PRENDA

Debe existir una acción rápida:

`CAMBIAR PRENDA`

Caso real:

un músico joven tiene:

`CAM-04-S`

pero ya necesita:

`CAM-12-M`

NO cerrar artificialmente toda la cesión.

Registrar:

- devolución de CAM-04-S;
- entrega de CAM-12-M;
- misma relación logística/persona;
- movimiento correspondiente.

Esto permite conservar histórico de crecimiento/cambios.

---

# 15. MOVIMIENTOS

Las acciones físicas importantes deben generar MOVIMIENTOS.

Tipos iniciales:

- ENTREGA
- DEVOLUCION
- CAMBIO

Cada movimiento debe registrar:

- persona;
- prendas implicadas;
- fecha/hora;
- administrador;
- confirmación de firma cuando proceda;
- información necesaria para reconstruir el histórico.

Ejemplo:

14/01/2027 — ENTREGA
C-14-44
P-08-40
Persona: Antonio
Gestionado por Fran

03/09/2027 — CAMBIO
Devuelve P-08-40
Recibe P-17-42
Gestionado por Manuel

---

# 16. FIRMA EN PANTALLA

Durante una entrega/devolución/cambio, la persona podrá firmar directamente con el dedo en la pantalla del móvil.

Utilizar canvas o solución equivalente.

IMPORTANTE:

NO necesitamos almacenar la imagen de la firma.

La firma funciona únicamente como comprobación presencial dentro del flujo.

La aplicación debe:

1. mostrar área de firma;
2. comprobar que se ha dibujado realmente algo;
3. no permitir confirmar mientras esté vacía;
4. permitir limpiar/repetir;
5. al confirmar, guardar que la operación fue confirmada mediante firma;
6. guardar administrador y timestamp;
7. descartar el dibujo.

No utilizar Supabase Storage para firmas inicialmente.

---

# 17. ACTUACIONES

Debe existir un módulo de ACTUACIONES.

Campos iniciales:

- nombre/título;
- fecha;
- hora;
- uniforme;
- observaciones opcionales;
- serie opcional.

Ejemplo:

`Procesión de San Sebastián`
`15/05/2027`
`19:30`
`Uniforme de invierno`

Dentro de una actuación se pueden añadir los refuerzos que participan.

---

# 18. REFUERZOS DE UNA ACTUACIÓN

Al añadir una persona:

primero buscar entre personas existentes.

Si existe:
reutilizar el registro y todo su histórico.

Si no existe:
permitir creación rápida.

Campos mínimos para creación rápida:

- nombre;
- instrumento.

Tipo inicial:

`REFUERZO`

No obligar a introducir teléfono, talla u otros datos innecesarios.

---

# 19. SERIES DE ACTUACIONES

Debe existir el concepto:

SERIE

Una serie agrupa actuaciones relacionadas.

Ejemplos:

`SEMANA SANTA 2027`

con:

- Domingo de Ramos
- Martes Santo
- Miércoles Santo
- Jueves Santo
- Madrugá
- Viernes Santo

Otro ejemplo:

`GLORIAS MAYO 2027`

con:

- Viernes
- Sábado
- Domingo

Una actuación puede existir sin serie.

---

# 20. PREPARACIÓN DE UNA SERIE

Este es uno de los flujos MÁS IMPORTANTES de toda la aplicación.

NO obligar al usuario a entrar actuación por actuación asignando prendas manualmente.

Desde una serie debe existir un flujo de:

`PREPARAR REFUERZOS / PREPARAR VESTUARIO`

Primero se seleccionan los refuerzos participantes.

Después se indica rápidamente en qué actuaciones participa cada uno.

Conceptualmente:

Juan:
D ✓
M ✓
X ✓
J ✓
Madrugada ✓
V ✓

Pedro:
D ✓
M ✓
X -
J -
Madrugada -
V -

Antonio:
D ✓
M -
X ✓
J -
Madrugada -
V ✓

En móvil no utilizar necesariamente una tabla horizontal si perjudica la UX.

Buscar una solución táctil cómoda.

---

# 21. BLOQUES CONSECUTIVOS Y HUECOS

Esta regla es MUY IMPORTANTE.

Si un refuerzo participa en actuaciones consecutivas DENTRO DE LA SERIE, asumir inicialmente una única cesión.

Ejemplo:

Serie:
Domingo
Martes
Miércoles

Juan participa:
Domingo ✓
Martes ✓

Resultado:

una cesión desde Domingo hasta Martes.

No preguntar innecesariamente.

Sin embargo, si existe AL MENOS UNA ACTUACIÓN INTERMEDIA de la serie en la que la persona NO participa, preguntar SIEMPRE.

Ejemplo:

Juan:
Domingo ✓
Martes -
Miércoles ✓

Mostrar:

`Juan no participa en una actuación intermedia.`

Opciones:

A)
Mantener una única cesión:
Domingo → Miércoles

B)
Dividir:
Domingo → Domingo
Miércoles → Miércoles

No decidir automáticamente en función del número de días.

La existencia de una actuación intermedia no participada es lo que activa la decisión.

El usuario siempre tiene la última palabra.

---

# 22. ASIGNACIÓN VS CESIÓN FÍSICA

Separar claramente:

ASIGNACIÓN FUTURA

de

CESIÓN FÍSICA.

Ejemplo:

Una semana antes de Semana Santa:

Juan → C-05-48

La chaqueta sigue físicamente en la Banda.

Situación:

`Asignada a Juan`

pero todavía no:

`Cedida a Juan`.

Cuando llega Domingo de Ramos:

`ENTREGAR`

Juan firma.

A partir de ese momento existe la cesión física.

Esta separación es fundamental.

---

# 23. ASIGNACIONES FUTURAS

Debe poder prepararse el vestuario días o semanas antes.

Una asignación relaciona conceptualmente:

- persona;
- prenda;
- actuación/actuaciones;
- periodo previsto;
- serie si procede.

Evitar dobles asignaciones incompatibles.

Ejemplo:

si C-05-48 ya está asignada a Juan para una actuación, no debe recomendarse simultáneamente a Pedro para un periodo incompatible.

La disponibilidad debe considerar INTERVALOS, no únicamente fechas individuales.

---

# 24. RECOMENDADOR DE PRENDAS

NO utilizar IA.

Implementar reglas deterministas y explicables.

Al preparar el vestuario para una persona:

1. determinar los tipos de prenda requeridos por el uniforme;
2. consultar histórico de esa persona;
3. inferir talla utilizada habitualmente por tipo de prenda;
4. comprobar disponibilidad durante TODO el periodo previsto;
5. excluir conflictos;
6. recomendar la mejor opción.

Ejemplo:

Juan ha utilizado:

48
48
46

Preferencia:

48

Recomendación:

⭐ C-08-48

Alternativas:

C-11-48
C-02-50

Prioridades generales:

1. talla histórica más probable;
2. prenda disponible durante todo el intervalo;
3. otras prendas de la misma talla;
4. si no existe ninguna, siguiente talla MAYOR disponible.

IMPORTANTE:

NO recomendar automáticamente una talla menor.

Una talla mayor puede servir excepcionalmente.

Una menor puede no entrar.

El usuario siempre puede seleccionar manualmente cualquier prenda si conoce mejor el caso.

---

# 25. PERSONAS SIN HISTÓRICO

Si una persona nunca ha utilizado prendas:

NO inventar talla.

Mostrar algo similar a:

`Sin histórico de vestuario`

y permitir selección manual rápida.

Después de la primera cesión, ese histórico podrá utilizarse en futuras recomendaciones.

---

# 26. ASIGNACIÓN AUTOMÁTICA / ASISTIDA

Para series grandes, contemplar una función de preparación asistida.

Ejemplo:

10 refuerzos

- 8 con histórico claro;
- 1 con varias posibilidades;
- 1 sin histórico.

Permitir que el sistema proponga/asigne las opciones evidentes respetando todas las restricciones.

Después mostrar:

`2 necesitan revisión`

No ocultar decisiones dudosas.

No generar asignaciones conflictivas silenciosamente.

El objetivo es reducir trabajo repetitivo.

---

# 27. DÍA DE LA ACTUACIÓN

La pantalla de una actuación debe priorizar las acciones que FÍSICAMENTE hay que realizar ese día.

Ejemplo:

DOMINGO DE RAMOS

Juan Ruiz
C-05-48
[PENDIENTE DE ENTREGA]
[ENTREGAR]

Pedro
C-08-46
[PENDIENTE DE ENTREGA]
[ENTREGAR]

Después de entregar y firmar:

Juan:
`En su poder`

En una actuación posterior de la misma serie:

Juan:
C-05-48
🟢 Ya en su poder

NO pedir una nueva entrega/firma si físicamente ya conserva la chaqueta.

---

# 28. ÚLTIMA ACTUACIÓN / DEVOLUCIÓN

Si una actuación es la última incluida en la cesión prevista:

mostrar claramente:

`Última actuación — devolución prevista al finalizar`

Después:

`DEVOLVER`

---

# 29. MANTENER LA PRENDA DESPUÉS DE LA DEVOLUCIÓN PREVISTA

La realidad puede cambiar.

Un refuerzo puede terminar su actuación y quedarse temporalmente con la chaqueta/camisa.

Cuando exista una devolución prevista, permitir:

- DEVUELTA
- MANTIENE LA PRENDA

Si selecciona:

`MANTIENE LA PRENDA`

NO crear una devolución falsa.

La cesión continúa abierta.

Registrar la decisión.

---

# 30. CONFLICTOS CON ASIGNACIONES FUTURAS

Antes de permitir que una persona mantenga una prenda, comprobar asignaciones futuras.

Ejemplo:

Juan mantiene C-05-48.

Pero:

C-05-48 está asignada a Antonio dentro de 7 días.

Mostrar:

⚠️ Esta decisión afecta a una asignación futura.

Explicar:

- persona;
- actuación;
- fecha;
- prenda.

Permitir:

`MANTENER IGUALMENTE`

o:

`CANCELAR`

NO bloquear la acción.

La realidad manda sobre la planificación.

---

# 31. CONFLICTOS

Crear un concepto claro de CONFLICTO.

Ejemplos:

- prenda actualmente cedida pero asignada próximamente;
- prenda dañada pero asignada a una futura actuación;
- prenda pendiente de lavandería pero necesaria próximamente;
- cambios posteriores que invalidan una planificación.

IMPORTANTE:

NO modificar automáticamente y en silencio las asignaciones futuras.

Mantener la planificación y generar un conflicto visible.

El usuario debe resolverlo.

Ejemplo Inicio:

⚠️ 2 conflictos de vestuario

C-05-48:
Cedida a Juan
Asignada a Antonio dentro de 7 días.

[RESOLVER]

Al cambiar la prenda de Antonio o recuperar C-05-48, el conflicto desaparece.

---

# 32. RECOMENDACIONES Y CONFLICTOS

Una prenda que actualmente esté:

- cedida;
- dañada;
- pendiente de lavandería;
- o con conflicto;

no debe aparecer como primera recomendación automática.

Puede seguir siendo seleccionable manualmente cuando tenga sentido.

El sistema recomienda y avisa.

NO debe impedir reflejar la realidad.

---

# 33. DEVOLUCIÓN Y ESTADO POSTERIOR

Cuando una prenda vuelve físicamente a la Banda, permitir seleccionar su estado:

- Disponible
- Pendiente de lavandería
- Dañada

Diseñar la arquitectura para que posteriormente podamos introducir reglas configurables como:

`Toda camisa devuelta → Pendiente de lavandería`

pero NO es necesario implementar automatizaciones complejas inicialmente.

---

# 34. ACCIONES MASIVAS

Incluir cuando aporten valor real.

Ejemplos:

seleccionar varias camisas:

`Marcar pendientes de lavandería`

Después de recogerlas:

`Marcar disponibles`

Evitar construir sistemas masivos complejos si no son necesarios.

---

# 35. ARCHIVADO

Evitar borrado destructivo de entidades con histórico.

Debe poder archivarse:

- una prenda;
- una persona;
- posiblemente configuraciones antiguas.

Los registros archivados:

- no aparecen por defecto en operativa;
- mantienen histórico;
- pueden consultarse cuando sea necesario.

---

# 36. IMPORTACIÓN INICIAL

El inventario actual puede contener bastantes prendas.

No obligar a crearlas una por una.

Contemplar importación mediante CSV/Excel o una creación masiva sencilla.

La solución exacta se decidirá en su fase correspondiente.

No implementar esto prematuramente.

---

# 37. PANTALLA DE INICIO

Diseñar un dashboard MUY OPERATIVO.

Ejemplo conceptual:

GESTIÓN DE VESTUARIO

Próxima actuación
Procesión X
Viernes · 20:00

6 refuerzos
5/6 preparados

[ABRIR ACTUACIÓN]

---

Inventario

43 disponibles
18 cedidas
4 lavandería
2 dañadas

---

Cesiones activas
22

---

⚠️ Conflictos
2

---

Próximas actuaciones

...

Acciones rápidas:

- Nueva actuación
- Nueva cesión
- Buscar prenda
- Buscar persona

No saturar el dashboard.

---

# 38. NAVEGACIÓN PRINCIPAL

Propuesta inicial:

- Inicio
- Actuaciones
- Inventario
- Personas
- Cesiones

MOVIMIENTOS/HISTORIAL puede ser transversal y no necesita obligatoriamente una pestaña principal.

En móvil estudiar navegación inferior o solución equivalente.

En escritorio utilizar una navegación adaptada al espacio disponible.

---

# 39. INVENTARIO

Debe permitir buscar rápidamente por:

- código;
- tipo;
- talla;
- estado;
- situación.

Ejemplo:

C-01-44
Disponible

C-02-46
Disponible
📅 Asignada sábado

C-03-46
👤 Antonio Pérez

C-04-48
🧺 Lavandería

C-06-50
🔴 Dañada

Detalle de prenda:

- código;
- tipo;
- talla;
- estado;
- observaciones;
- cesión actual;
- asignaciones futuras;
- histórico;
- movimientos relacionados.

---

# 40. PERSONAS

Listado con búsqueda rápida.

Detalle:

- nombre;
- instrumento;
- tipo;
- observaciones;
- cesiones activas;
- prendas actualmente en su poder;
- histórico de prendas;
- tallas inferidas;
- actuaciones/series relacionadas cuando sea útil.

Priorizar información operativa.

---

# 41. CESIONES

Listado de cesiones activas y pasadas.

Permitir distinguir rápidamente:

- cesiones sin devolución prevista;
- devoluciones próximas;
- devoluciones vencidas;
- cesiones vinculadas a series;
- prendas que continúan en poder de una persona.

No introducir sistemas complejos de notificaciones inicialmente.

---

# 42. DUPLICAR SERIES

Funcionalidad deseable:

`DUPLICAR SERIE`

Ejemplo:

Semana Santa 2028 puede partir de Semana Santa 2027.

Debe copiar como BORRADOR la estructura útil:

- actuaciones;
- configuración general;
- posiblemente participantes como propuesta.

NO copiar automáticamente cesiones reales ni movimientos.

El usuario debe revisar la nueva planificación.

Implementar únicamente en su fase correspondiente.

---

# 43. OBSERVACIONES

Permitir notas opcionales tanto en:

PRENDA

Ejemplo:
`Le falta un botón.`

como en:

PERSONA

Ejemplo:
`La chaqueta 48 le quedaba algo justa.`

Mantenerlo sencillo.

---

# 44. PRINCIPIOS DE UX

Toda decisión debe evaluarse con esta pregunta:

`¿Puede hacer esto rápidamente una persona desde un móvil mientras tiene delante al músico?`

Evitar:

- formularios largos;
- modales innecesarios;
- demasiados pasos;
- pantallas intermedias sin valor;
- botones pequeños;
- información técnica;
- navegación profunda.

Favorecer:

- búsqueda inmediata;
- valores por defecto razonables;
- recomendaciones;
- confirmaciones claras;
- acciones rápidas;
- posibilidad de corregir errores;
- feedback visual.

---

# 45. INTEGRIDAD DE DATOS

Aunque la UX sea flexible, mantener integridad.

Ejemplos:

- una misma prenda no puede estar físicamente cedida simultáneamente a dos personas;
- evitar asignaciones futuras incompatibles;
- una prenda archivada no debe recomendarse;
- una prenda dañada no debe recomendarse automáticamente;
- movimientos históricos no deben desaparecer por editar datos actuales;
- una devolución parcial no debe cerrar una cesión completa;
- una cesión finaliza realmente cuando no quedan prendas pendientes.

Utilizar constraints, relaciones, transacciones/RPC cuando sean necesarias y RLS apropiadamente.

No trasladar toda la integridad únicamente al frontend.

---

# 46. RLS Y SEGURIDAD

Supabase debe configurarse correctamente.

No confiar en ocultar botones en Angular como mecanismo de seguridad.

Las tablas privadas deben utilizar RLS.

Únicamente usuarios autenticados/autorizados deben acceder a datos.

No utilizar service role key en frontend.

Variables sensibles nunca deben incluirse en el repositorio.

---

# 47. RENDIMIENTO

El volumen será pequeño/medio.

No sobreoptimizar.

Pero:

- indexar campos de búsqueda importantes;
- evitar consultas N+1;
- paginar/listar correctamente cuando proceda;
- optimizar carga móvil;
- PWA ligera;
- evitar dependencias enormes innecesarias.

---

# 48. ACCESIBILIDAD

Mantener:

- buen contraste;
- labels;
- navegación razonable por teclado en escritorio;
- estados no dependientes exclusivamente del color;
- targets táctiles amplios;
- mensajes de error claros.

---

# 49. ERRORES Y FEEDBACK

Una operación crítica debe proporcionar feedback.

Ejemplo:

`✓ C-05-48 entregada a Juan Ruiz`

No mostrar mensajes técnicos de Supabase al usuario final.

Traducir errores a mensajes entendibles.

---

# 50. IDIOMA

Interfaz inicialmente en español.

No implementar internacionalización completa salvo que exista una razón arquitectónica sencilla para dejarla preparada.

---

# 51. FECHAS Y HORAS

Utilizar correctamente timestamps y zona horaria.

Las actuaciones son eventos locales.

Evitar errores por conversiones UTC/frontend.

Definir una estrategia clara durante la fase de arquitectura.

---

# 52. FASES DE DESARROLLO

Debemos seguir este orden aproximado.

Puedes proponer pequeños ajustes durante FASE 0 si existe una razón técnica clara.

NO puedes empezar una fase posterior sin mi autorización.

---

## FASE 0 — ARQUITECTURA Y MODELO

NO programar todavía toda la aplicación.

Analizar:

- arquitectura general;
- entidades;
- relaciones;
- separación entre estado físico/asignación/cesión;
- actuaciones;
- series;
- bloques de participación;
- movimientos;
- recomendador;
- conflictos;
- auditoría;
- RLS;
- estrategia PWA;
- fechas/horas;
- estructura Angular;
- estrategia responsive;
- posibles componentes reutilizables de Entradas.

Proponer modelo de datos inicial.

Explicar especialmente cómo se modelará:

- una cesión con varias prendas;
- devolución parcial;
- cambio de prenda;
- asignación futura;
- una cesión que cubre varias actuaciones;
- división de cesiones por huecos;
- conflictos;
- histórico.

NO construir todavía todas las pantallas.

AL TERMINAR:

DETENTE Y ESPERA MI APROBACIÓN.

---

## FASE 1 — BASE DEL PROYECTO + BRANDING + LOGIN

Crear:

- proyecto Angular;
- configuración;
- routing;
- Supabase client;
- variables de entorno;
- login;
- auth guard;
- sesión persistente;
- logout;
- shell principal;
- navegación responsive;
- design tokens;
- base visual BML;
- manifest PWA;
- iconos/configuración básica PWA.

Objetivo:

poder abrir la aplicación, iniciar sesión y entrar a una interfaz vacía pero visualmente coherente.

NO implementar todavía inventario completo.

AL TERMINAR:

explica cómo probar login, responsive y PWA.

DETENTE.

---

## FASE 2 — BASE DE DATOS + INVENTARIO

Implementar migraciones/tablas necesarias para:

- tipos de prendas;
- prendas;
- estados;
- usuarios/perfiles cuando proceda;
- auditoría mínima necesaria.

Implementar:

- listado inventario;
- búsqueda;
- filtros;
- alta;
- edición;
- archivado;
- detalle de prenda.

Estados:

- Disponible
- Pendiente lavandería
- Dañada

NO implementar todavía actuaciones/series completas.

DETENTE.

---

## FASE 3 — PERSONAS + HISTÓRICO BASE

Implementar:

- listado personas;
- búsqueda;
- creación;
- edición;
- archivado;
- detalle;
- músico/refuerzo;
- instrumento;
- observaciones.

Preparar modelo para histórico.

Todavía NO construir el recomendador completo.

DETENTE.

---

## FASE 4 — CESIONES + MOVIMIENTOS + FIRMA

Implementar:

- nueva cesión;
- varias prendas;
- entrega;
- devolución;
- devolución parcial;
- cambio de prenda;
- cesión sin devolución prevista;
- movimientos;
- firma en canvas;
- validación de firma;
- auditoría;
- estados posteriores a devolución.

La firma NO se almacena como imagen.

Probar especialmente desde móvil.

DETENTE.

---

## FASE 5 — ACTUACIONES + UNIFORMES

Implementar:

- uniformes configurables;
- tipos de prenda requeridos;
- actuaciones;
- refuerzos;
- creación rápida de persona;
- asignaciones futuras básicas;
- preparación de una actuación individual.

Implementar comprobaciones básicas de disponibilidad.

DETENTE.

---

## FASE 6 — SERIES + SEMANA SANTA

Implementar el flujo completo de series.

Especial atención a:

- varias actuaciones;
- matriz/listado de participación;
- refuerzos repetidos;
- actuaciones consecutivas;
- huecos;
- decisión mantener/dividir cesión;
- preparación conjunta;
- asignaciones para periodos;
- entrega únicamente cuando físicamente corresponde;
- devolución únicamente al final del periodo real.

Esta fase debe probarse con un escenario realista de Semana Santa:

6 actuaciones
10 refuerzos
participaciones diferentes.

DETENTE.

---

## FASE 7 — RECOMENDADOR + PREPARACIÓN ASISTIDA

Implementar reglas de recomendación.

Considerar:

- histórico;
- talla;
- tipo de prenda;
- disponibilidad;
- intervalos;
- asignaciones existentes;
- cesiones activas;
- estados físicos.

Implementar:

- mejor opción;
- alternativas;
- nunca talla menor automáticamente;
- talla superior cuando proceda;
- sin histórico → selección manual;
- preparación asistida;
- casos que requieren revisión.

DETENTE.

---

## FASE 8 — CONFLICTOS + OPERATIVA AVANZADA

Implementar:

- detección de conflictos;
- dashboard de conflictos;
- mantener prenda después de devolución prevista;
- impacto en asignaciones futuras;
- resolución;
- cambios de estado que afectan al futuro;
- avisos sin bloqueos innecesarios.

Principio:

LA REALIDAD MANDA SOBRE LA PLANIFICACIÓN.

El sistema debe advertir, no obligar al usuario a falsear la realidad.

DETENTE.

---

## FASE 9 — PRODUCTIVIDAD

Revisar e implementar según necesidad real:

- acciones masivas;
- importación CSV/Excel;
- duplicar serie;
- mejoras de búsquedas;
- filtros;
- dashboard final;
- histórico/auditoría visible;
- pequeñas optimizaciones UX.

No añadir funcionalidades que no aporten valor real.

DETENTE.

---

## FASE 10 — QA + PRODUCCIÓN

Revisar:

- móvil iPhone;
- Android;
- escritorio;
- responsive;
- PWA;
- Safari;
- Chrome;
- seguridad;
- RLS;
- errores;
- integridad;
- accesibilidad;
- rendimiento;
- estados vacíos;
- loading;
- errores de red;
- sesiones;
- fechas;
- zonas horarias.

Preparar:

- Cloudflare Pages;
- dominio `trajes.bmlapalma.com`;
- variables de producción;
- Supabase producción;
- checklist de despliegue;
- README;
- instrucciones básicas de mantenimiento.

No considerar finalizado hasta probar los flujos críticos.

---

# 53. ESCENARIO DE PRUEBA PRINCIPAL

Durante el desarrollo utilizar como escenario de referencia:

SERIE:
SEMANA SANTA

Actuaciones:

1. Domingo de Ramos
2. Martes Santo
3. Miércoles Santo
4. Jueves Santo
5. Madrugá
6. Viernes Santo

10 refuerzos.

Casos:

- algunos participan en las 6;
- algunos solo en 2 consecutivas;
- algunos en 3 consecutivas;
- algunos tienen huecos;
- alguno participa Domingo y Miércoles;
- alguno Domingo y Viernes;
- algunos tienen histórico;
- alguno no tiene histórico;
- varias personas utilizan talla 48;
- disponibilidad limitada.

La aplicación debe permitir preparar todo sin gestionar manualmente 60 combinaciones.

Resultado esperado:

- propuestas automáticas;
- decisiones únicamente donde exista ambigüedad;
- una misma prenda puede permanecer con una persona durante varias actuaciones;
- no repetir entrega/devolución artificialmente;
- conflictos visibles.

---

# 54. PRINCIPIO FUNDAMENTAL

No diseñes la aplicación como un ERP de almacén.

Es una herramienta interna para una Banda de Música y la utilizarán aproximadamente 3-4 responsables.

Debe sentirse:

RÁPIDA.

SENCILLA.

VISUAL.

FIABLE.

El software debe adaptarse a cómo trabaja la Banda.

No obligar a la Banda a adaptar su funcionamiento a un modelo rígido del software.

---

# 55. TU PRIMERA RESPUESTA

Después de recibir este prompt:

NO EMPIECES A PROGRAMAR TODA LA APLICACIÓN.

Empieza exclusivamente por:

**FASE 0 — ARQUITECTURA Y MODELO**

Quiero que me presentes:

1. arquitectura propuesta;
2. entidades principales;
3. relaciones;
4. modelo conceptual de datos;
5. decisiones importantes;
6. cómo resolverás asignaciones, cesiones y movimientos;
7. cómo resolverás series y huecos;
8. cómo calcularás disponibilidad;
9. cómo gestionarás conflictos;
10. estrategia Angular/Supabase/RLS/PWA;
11. dudas o decisiones que necesites confirmar.

No generes todavía decenas de archivos.

No implementes las fases siguientes.

Cuando terminemos de revisar FASE 0, te autorizaré expresamente a comenzar FASE 1.
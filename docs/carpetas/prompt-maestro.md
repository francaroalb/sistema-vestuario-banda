# PROMPT MAESTRO DEFINITIVO
## Ampliación de Gestión de Trajes con Carpetas Musicales y Repertorio

### 0. CONTEXTO DEL PROYECTO

Estamos desarrollando una aplicación privada para la **Banda Municipal Ntra. Sra. del Valle de La Palma del Condado**.

La aplicación ya cuenta con funcionalidades de gestión de vestuario, personas, actuaciones, series, asignaciones, cesiones, entregas y devoluciones.

**Stack tecnológico existente:**
- Angular y TypeScript.
- Supabase PostgreSQL, Auth y RLS.
- Cloudflare Pages.
- Arquitectura responsive, mobile-first y PWA.
- Diseño corporativo burdeos, blanco y detalles dorados.

El objetivo es **ampliar la aplicación existente** para gestionar carpetas físicas de partituras, sus repertorios, las incidencias de mantenimiento y su cesión a refuerzos.

No crear una aplicación independiente.

No rehacer funcionalidades existentes.

No introducir servicios de pago, un backend adicional ni dependencias innecesarias.

La ampliación debe mantener la estética, la arquitectura y los patrones de interacción actuales.

---

# 1. METODOLOGÍA DE DESARROLLO

El trabajo se realizará estrictamente por fases.

Antes de implementar cualquier modificación:

1. Inspeccionar la estructura real del proyecto.
2. Analizar el esquema y las migraciones de Supabase.
3. Comprender las entidades de personas, actuaciones, series, prendas, cesiones y movimientos.
4. Revisar los mecanismos existentes de firma y confirmación.
5. Identificar componentes visuales reutilizables.
6. Proponer una ampliación de bajo impacto.

No asumir nombres de tablas, servicios, componentes o rutas sin comprobarlos.

**Al terminar cada fase:**
- Explicar qué se ha implementado.
- Identificar archivos y migraciones modificados.
- Documentar decisiones técnicas.
- Indicar pruebas ejecutadas.
- Comunicar riesgos o limitaciones.
- Detenerse y esperar aprobación expresa.

No avanzar automáticamente a la siguiente fase.

---

# 2. MODELO GENERAL DE MATERIAL

Existen dos categorías de material:

**Vestuario**
- Chaquetas.
- Camisas.
- Pantalones.
- Otras prendas existentes.

**Carpetas musicales**
- Unidades físicas identificadas individualmente.
- Cada carpeta pertenece a un repertorio.
- Cada carpeta corresponde a una voz musical concreta.
- Cada carpeta contiene partituras.
- Cada carpeta tiene su propio historial de cesiones y mantenimiento.

Ambas categorías comparten:
- Personas.
- Actuaciones.
- Series.
- Planificación.
- Operaciones coordinadas de entrega y devolución.

No deben compartir artificialmente atributos específicos.

Una carpeta no tiene talla.

Una prenda no tiene repertorio.

Mantener modelos especializados y reutilizar únicamente las abstracciones comunes que aporten valor.

---

# 3. CATÁLOGO DE VOCES MUSICALES

Implementar un catálogo configurable de voces.

Cada voz tendrá:
- Identificador interno.
- Código corto único.
- Nombre visible.
- Instrumento o familia musical, si procede.
- Estado activo o archivado.

Ejemplos:

| Código | Voz |
|---|---|
| CLAP | Clarinete principal |
| CLA1 | Clarinete 1.º |
| CLA2 | Clarinete 2.º |
| FLA1 | Flauta 1.º / Flautín |
| FLA2 | Flauta 2.º |
| SAL1 | Saxo alto 1.º |
| STN1 | Saxo tenor 1.º |
| TRP1 | Trompeta 1.º |
| TUB | Tuba |

Estos son ejemplos, no el catálogo completo.

Permitir crear nuevas voces sin modificar código fuente.

Evitar eliminar voces utilizadas por carpetas o actuaciones históricas.

---

# 4. ASIGNACIÓN DE VOZ POR ACTUACIÓN

**REQUISITO FUNCIONAL CRÍTICO.**

Cuando se añade una persona o refuerzo a una actuación, debe poder indicarse la voz concreta que interpretará en esa actuación.

Ejemplo:

Actuación: Pregón de Semana Santa.

Persona: Juan Ruiz.

Instrumento habitual: Clarinete.

Voz asignada: Clarinete principal.

La voz pertenece a la **participación en la actuación**, no exclusivamente a la ficha de la persona.

Juan puede tocar:
- Clarinete principal en un pregón.
- Clarinete 1.º en una procesión.
- Clarinete 2.º en otra actuación.

No imponer una voz fija para todas sus participaciones.

### Flujo de alta de participante

Al incorporar una persona a una actuación:

1. Seleccionar persona.
2. Mostrar su instrumento habitual, si existe.
3. Seleccionar voz para esa actuación.
4. Proponer la última voz utilizada o la más frecuente, cuando exista historial.
5. Guardar la voz en la participación correspondiente.
6. Utilizar esa voz para calcular las carpetas necesarias.

La voz no debe ser obligatoria para registrar una participación si todavía no se conoce, pero debe quedar marcada como **pendiente de definir** cuando sea necesaria para preparar carpetas.

No inventar una voz automáticamente.

### Series de actuaciones

Al incorporar una persona a varios días:

- Proponer una voz inicial.
- Permitir aplicarla a todos los días seleccionados.
- Permitir modificarla individualmente por actuación.
- Detectar cambios de voz.
- Recalcular las necesidades de carpetas.

### Cambios posteriores

Si se cambia la voz después de preparar el material:

- Identificar las asignaciones afectadas.
- Proponer carpetas compatibles con la nueva voz.
- Advertir de conflictos.
- No modificar ni cancelar silenciosamente cesiones físicas existentes.
- Solicitar confirmación para cambios en asignaciones futuras.

---

# 5. IDENTIFICACIÓN DE CARPETAS

Cada carpeta es una unidad física con código único ya impreso en su etiqueta.

Formato:

`{REPERTORIO}-{CODIGO_VOZ}-{NUMERO}`

Ejemplos:
- PRO-CLA1-001.
- PRO-CLAP-003.
- PRO-TUB-004.
- PMM-TRP1-001.

Repertorios:
- **PRO:** Marchas de procesión.
- **PMM:** Pasodobles y marchas militares.

Cada carpeta tiene:
- Identificador interno.
- Código físico único.
- Repertorio.
- Voz fija.
- Estado operativo.
- Fecha de alta.
- Observaciones.
- Historial.

Validar la unicidad en PostgreSQL.

No regenerar automáticamente códigos ya impresos.

No modificar el código de una carpeta por editar el nombre descriptivo de su voz.

Permitir archivar carpetas conservando su historial.

---

# 6. ESTADO FÍSICO Y DISPONIBILIDAD

Distinguir tres conceptos independientes:

**Disponibilidad**
- Disponible.
- Reservada para un periodo futuro.
- Cedida físicamente.

**Operatividad**
- Utilizable.
- No utilizable.
- Archivada.

**Incidencias de mantenimiento**
- Ninguna incidencia pendiente.
- Una o varias incidencias pendientes.

La disponibilidad se deriva de asignaciones y cesiones.

La operatividad determina si puede volver a entregarse.

Las incidencias pueden existir sin impedir el uso.

**REGLA FUNDAMENTAL: una carpeta con incidencias no debe bloquearse automáticamente.**

Ejemplos:

| Situación | Utilizable | Asignable |
|---|---|---|
| Carpeta en perfecto estado | Sí | Sí |
| Elásticos deteriorados | Sí | Sí, con aviso |
| Cubierta rota pero funcional | Sí | Sí, con aviso |
| Una partitura dañada | Sí | Sí, con aviso |
| Varias partituras faltantes | Sí | Sí, con aviso |
| Carpeta físicamente inutilizable | No | No |
| Carpeta archivada | No | No |

Una incidencia puede requerir mantenimiento sin modificar la operatividad.

Si se marca una carpeta como no utilizable mientras está cedida, conservar la realidad de la cesión y advertir de su situación. No generar devoluciones automáticas.

---

# 7. REPERTORIOS COMUNES

Existen dos catálogos centrales:
- PRO.
- PMM.

Cada repertorio contiene sus obras musicales.

Todas las carpetas de un repertorio deben contener todas sus obras activas, independientemente de la voz.

Cada obra tendrá:
- ID.
- Título.
- Repertorio.
- Autor opcional.
- Estado activo o retirado.
- Fechas de creación y actualización.

Permitir:
- Crear obras.
- Editar metadatos.
- Retirar obras.
- Reactivar obras.
- Buscar obras.
- Consultar carpetas afectadas.

No implementar gestión de versiones de partituras.

Una corrección de título o autor no debe generar mantenimiento físico.

---

# 8. INICIALIZACIÓN DEL CONTENIDO

Al registrar una carpeta existente, considerar inicialmente presentes todas las obras activas del repertorio en ese momento.

Es una presunción administrativa, no una revisión física individual.

Registrar la referencia temporal o lógica necesaria para reconstruir correctamente esa situación inicial.

Las obras añadidas posteriormente quedan pendientes de incorporar.

Las incidencias detectadas posteriormente prevalecen sobre la presunción inicial.

Evitar crear automáticamente cientos de registros redundantes por carpeta si existe un diseño relacional más eficiente.

---

# 9. PRESENCIA DE PARTITURAS

Distinguir el estado de presencia física de cada obra en cada carpeta:

- Presente.
- Faltante.
- Pendiente de incorporar.
- Pendiente de retirar, cuando la obra ya no está activa.

La presencia física es independiente del estado de conservación.

Una partitura puede estar **presente y dañada**.

Una partitura faltante no puede considerarse simultáneamente presente.

Las operaciones deben conservar historial.

---

# 10. NUEVO: INCIDENCIAS DE PARTITURAS

**REQUISITO FUNCIONAL CRÍTICO.**

Implementar incidencias de mantenimiento asociadas a una obra concreta dentro de una carpeta.

Ejemplo:

Carpeta: PRO-CLA1-003.

Obra: Coronación de la Macarena.

Incidencia: La partitura está deteriorada y necesita sustituirse.

La obra sigue presente, pero tiene una incidencia pendiente.

### Tipos de incidencia

Como mínimo:
- Partitura faltante.
- Partitura dañada.
- Necesita sustitución.
- Necesita revisión o reparación.

El sistema debe distinguir entre:
- Ausencia física de la partitura.
- Deterioro de una partitura que sí está presente.

La ausencia modifica el estado de presencia.

El deterioro genera una incidencia de mantenimiento, sin marcar automáticamente la obra como ausente.

### Datos de incidencia

Cada incidencia tendrá:
- Identificador.
- Carpeta.
- Obra.
- Tipo.
- Descripción opcional.
- Fecha de registro.
- Usuario responsable.
- Estado abierta o resuelta.
- Fecha y usuario de resolución.
- Observación de resolución opcional.

### Operaciones

Permitir:
- Registrar incidencia.
- Consultar incidencias pendientes.
- Editar o ampliar observaciones cuando corresponda.
- Resolver incidencia.
- Consultar historial.

Registrar incidencias desde:
- Ficha de carpeta.
- Buscador de obras de una carpeta.
- Entrega.
- Devolución.
- Revisión posterior.

Evitar duplicados accidentales de incidencias activas equivalentes.

No perder el historial al resolver una incidencia.

No obligar a gestionar versiones de partituras para sustituir una copia física dañada.

---

# 11. NUEVO: INCIDENCIAS DE LA CARPETA FÍSICA

**REQUISITO FUNCIONAL CRÍTICO.**

Implementar incidencias de mantenimiento asociadas a la carpeta física, independientes de las partituras.

Ejemplos:
- Elásticos rotos.
- Cubierta deteriorada.
- Anillas dañadas.
- Carpeta exterior pendiente de sustitución.
- Desperfectos generales.

### Datos

Cada incidencia tendrá:
- Identificador.
- Carpeta afectada.
- Tipo de incidencia.
- Descripción.
- Fecha y usuario de registro.
- Estado abierta o resuelta.
- Fecha y usuario de resolución.
- Indicador de si impide utilizar la carpeta.

### Comportamiento

Una incidencia física no bloquea la carpeta salvo que se indique expresamente que impide su utilización.

Ejemplo:

`PRO-CLA1-003`

Incidencia: «Los elásticos están rotos. Cambiar carpeta exterior».

Impide utilizar: No.

Resultado:
- La carpeta sigue disponible.
- Puede asignarse y entregarse.
- Muestra aviso de mantenimiento pendiente.
- El recomendador la considera menos preferente que otra equivalente sin incidencias.

Si la incidencia impide utilizarla:
- No se recomienda.
- No se permiten nuevas entregas.
- Se conserva el historial.
- Puede registrarse su devolución si ya estaba cedida.

Al resolver una incidencia bloqueante, revisar si existen otras incidencias que continúen impidiendo el uso.

No desbloquear automáticamente una carpeta si mantiene otro bloqueo activo.

---

# 12. CENTRO DE MANTENIMIENTO

Crear una vista centralizada de tareas pendientes.

Categorías:

**Repertorio**
- Obras pendientes de incorporar.
- Obras pendientes de retirar.
- Partituras faltantes.

**Conservación**
- Partituras dañadas.
- Partituras pendientes de sustitución o reparación.
- Carpetas físicas con incidencias.

Permitir consultar:
- Por carpeta.
- Por obra.
- Por tipo de incidencia.
- Por repertorio.
- Por estado.
- Por operatividad.

Mostrar contadores separados.

No tratar una partitura dañada como faltante.

No confundir una cubierta deteriorada con un problema de repertorio.

Permitir resolver tareas individualmente y realizar operaciones masivas cuando tengan sentido.

Las operaciones masivas de incorporación y retirada deben conservar auditoría individual por carpeta.

---

# 13. INCORPORACIÓN DE OBRAS

Al añadir una obra PRO, todas las carpetas PRO activas pasan a tenerla pendiente de incorporar.

Igualmente para PMM.

Permitir confirmar incorporaciones:
- Individualmente desde la carpeta.
- Desde la obra.
- Seleccionando varias carpetas.

Registrar fecha y usuario.

No dar por incorporada una partitura únicamente por crear la obra.

---

# 14. RETIRADA DE OBRAS

Al retirar una obra:
- Deja de formar parte del repertorio activo.
- Las carpetas donde consta presente pasan a tener una retirada física pendiente.
- Las carpetas donde consta ausente no necesitan esa tarea.
- Las carpetas cedidas conservan la tarea pendiente.
- Al devolverlas se muestra un recordatorio.
- La retirada pendiente no bloquea automáticamente las cesiones.

Permitir confirmación individual y masiva.

Si una obra vuelve al repertorio, determinar su presencia según el último estado físico conocido.

Conservar el historial.

---

# 15. RECOMENDADOR DE CARPETAS

**REGLA ACTUALIZADA: priorizar carpetas sin incidencias, permitiendo utilizar las que sigan siendo operativas.**

Orden de evaluación:

1. Repertorio requerido.
2. Voz exacta.
3. Disponibilidad durante todo el periodo.
4. Operatividad.
5. Estado del repertorio.
6. Incidencias de mantenimiento pendientes.

### Prioridades

Preferir:
- Carpetas disponibles.
- Carpetas operativas.
- Carpetas con repertorio completo.
- Carpetas sin incidencias físicas ni partituras deterioradas.

Si existen varias carpetas equivalentes, recomendar primero la que tenga menos tareas pendientes.

Si solo queda una carpeta con incidencias no bloqueantes, permitir asignarla mostrando las advertencias.

No recomendar una carpeta de otra voz.

No recomendar una carpeta no utilizable.

No reservar ni entregar automáticamente al mostrar una recomendación.

---

# 16. ACTUACIONES Y REPERTORIOS

Cada actuación puede necesitar:
- PRO.
- PMM.
- Ambos.

La configuración se realiza a nivel de actuación.

Los refuerzos heredan los repertorios requeridos.

Las necesidades individuales se calculan combinando:
- Actuación.
- Repertorios requeridos.
- Voz asignada al participante.

Ejemplo:

Pregón:
- Repertorio PRO.
- Juan Ruiz.
- Clarinete principal.

Necesidad calculada:
- Una carpeta PRO de voz CLAP.

El ejemplar físico concreto se asigna posteriormente.

---

# 17. SERIES Y CAMBIOS DE VOZ

Reutilizar las series existentes.

Por defecto, proponer una cesión continua de carpeta desde la primera hasta la última actuación que la requiera.

Si hay actuaciones intermedias de la serie a las que la persona no asiste, preguntar si mantener una cesión continua o dividirla.

Si cambia de voz, calcular carpetas distintas.

Permitir que una persona conserve simultáneamente carpetas de varias voces cuando sea necesario.

No obligar a devolver una para recibir otra.

No vincular automáticamente la duración de una cesión de carpeta a la de una chaqueta.

---

# 18. ASIGNACIONES Y DISPONIBILIDAD

Distinguir:
- Necesidad de material.
- Reserva o asignación futura.
- Entrega física.
- Cesión activa.
- Devolución física.

Comprobar conflictos temporales.

No permitir dos entregas físicas simultáneas de la misma carpeta.

No generar devoluciones automáticas cuando vence una fecha prevista.

Mantener avisos de conflicto hasta su resolución.

Una incidencia no bloqueante no debe generar un falso conflicto de disponibilidad.

---

# 19. ENTREGAS CONJUNTAS E INDEPENDIENTES

Permitir entregar:
- Solo prendas.
- Solo carpetas.
- Ambos tipos conjuntamente.

Una operación conjunta puede utilizar una única confirmación o firma.

Registrar movimientos individualizados para cada elemento.

Permitir devoluciones parciales.

Conservar estados y fechas independientes.

Reutilizar el mecanismo de firma existente.

No almacenar imágenes de firma si el sistema actual únicamente registra su confirmación.

---

# 20. DEVOLUCIÓN RÁPIDA

La devolución debe requerir el mínimo número de acciones.

Flujo:
1. Identificar carpeta.
2. Confirmar devolución.
3. Registrar movimiento y usuario.
4. Actualizar disponibilidad.

Opcionalmente permitir:
- Registrar partitura faltante.
- Registrar partitura dañada.
- Registrar incidencia física de la carpeta.
- Añadir observación.

No exigir revisión de todas las obras.

No resolver incidencias automáticamente.

Mostrar tareas de mantenimiento pendientes, incluidas retiradas de obras.

Si la carpeta se devuelve dañada pero utilizable, debe continuar disponible con advertencia.

Si se declara no utilizable, bloquear nuevas entregas hasta resolver la situación.

---

# 21. CESIONES PUNTUALES

Permitir préstamos sin actuación asociada desde:
- Ficha de persona.
- Ficha de carpeta.
- Cesiones.

Fecha prevista de devolución opcional.

Si no existe fecha prevista, mantener la cesión abierta hasta devolución real.

Advertir de conflictos con asignaciones posteriores.

---

# 22. NAVEGACIÓN DEFINITIVA

Mantener cinco pestañas inferiores:

1. Inicio.
2. Actuaciones.
3. Inventario.
4. Personas.
5. Cesiones.

En Inventario, añadir un selector superior:

**Vestuario | Carpetas**

Vestuario conserva sus pantallas actuales.

Carpetas dispone de:
- Inventario físico.
- Repertorio PRO/PMM.
- Mantenimiento.

No añadir una sexta pestaña inferior.

Mantener el diseño actual y su coherencia visual.

---

# 23. FICHA INDIVIDUAL DE CARPETA

Mostrar:

- Código.
- Repertorio.
- Voz.
- Disponibilidad.
- Operatividad.
- Cesión actual.
- Obras incorporadas.
- Obras faltantes.
- Incorporaciones pendientes.
- Retiradas pendientes.
- Incidencias de partituras.
- Incidencias de carpeta física.
- Historial de cesiones.
- Historial de mantenimiento.

Priorizar visualmente las incidencias abiertas.

Permitir buscar una obra sin cargar visualmente todo el repertorio.

Acciones principales:
- Asignar.
- Entregar.
- Devolver.
- Registrar incidencia.
- Resolver mantenimiento.
- Editar carpeta.

Mostrar únicamente acciones válidas para su estado actual.

---

# 24. PERSONAS E HISTORIAL

Reutilizar el catálogo de personas.

Mostrar en su ficha:
- Instrumento habitual.
- Historial de voces utilizadas.
- Carpetas asignadas.
- Carpetas cedidas.
- Historial de préstamos.
- Actuaciones próximas.

Permitir préstamo puntual.

No crear personas duplicadas para el nuevo módulo.

---

# 25. SEGURIDAD, INTEGRIDAD Y AUDITORÍA

Reutilizar Supabase Auth y RLS.

Proteger todas las nuevas tablas.

No confiar únicamente en las validaciones del frontend.

Evitar:
- Códigos duplicados.
- Cesiones físicas simultáneas.
- Incidencias activas duplicadas.
- Referencias a obras inexistentes.
- Pérdida de historial.
- Operaciones masivas parcialmente aplicadas sin informar.

Registrar usuario, fecha y acción.

Utilizar transacciones o mecanismos seguros para operaciones que afecten a múltiples elementos.

No exponer credenciales privilegiadas.

---

# 26. DISEÑO Y EXPERIENCIA DE USUARIO

Conservar la estética corporativa y los componentes actuales.

Prioridades:
- Mobile-first.
- Pocos clics.
- Formularios breves.
- Buscadores rápidos.
- Jerarquía visual clara.
- Estados fácilmente reconocibles.
- Buen diseño de escritorio.
- Confirmaciones claras para operaciones críticas.
- Alertas discretas y útiles.

No saturar las fichas con decenas de insignias o advertencias repetidas.

No introducir una nueva plantilla visual.

El módulo debe parecer parte original de la aplicación.

---

# 27. RENDIMIENTO

Los repertorios pueden contener más de 100 obras y existir decenas o centenares de carpetas.

Evitar consultas N+1.

Indexar códigos, voces, repertorios y relaciones relevantes.

Utilizar paginación o carga progresiva cuando proceda.

Optimizar contadores de incidencias.

No duplicar innecesariamente todos los registros obra-carpeta.

---

# PLAN DE DESARROLLO POR FASES

## FASE 0 — Auditoría y arquitectura

Inspeccionar el proyecto existente y proponer:

- Modelo de carpetas.
- Catálogo configurable de voces.
- Voz por participación en actuación.
- Modelo de repertorios.
- Presencia física de partituras.
- Incidencias de partituras.
- Incidencias de carpeta física.
- Separación entre operatividad y mantenimiento.
- Integración con cesiones existentes.
- Migraciones y políticas RLS.
- Estrategia de pruebas y prevención de regresiones.

No implementar todavía.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 1 — Modelo de datos y servicios

Implementar:
- Voces.
- Carpetas.
- Repertorios.
- Obras.
- Presencia física y operaciones de repertorio.
- Incidencias de partituras.
- Incidencias físicas.
- Operatividad.
- Historial.
- Migraciones e índices.
- RLS.
- Servicios y tipos TypeScript.

Preparar pruebas de integridad.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 2 — Navegación e inventario

Implementar:
- Selector Vestuario / Carpetas.
- Inventario de carpetas.
- Alta y edición.
- Búsquedas y filtros.
- Ficha individual.
- Estados de operatividad.
- Archivado.
- Adaptación visual.

No alterar el funcionamiento de Vestuario.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 3 — Repertorio y presencia de partituras

Implementar:
- Catálogo PRO/PMM.
- Alta y edición de obras.
- Inicialización de carpetas como completas.
- Incorporaciones pendientes.
- Retiradas pendientes.
- Registro de faltantes.
- Reactivación de obras.
- Historial.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 4 — Incidencias y mantenimiento

Implementar:
- Incidencias de partituras presentes pero dañadas.
- Sustitución y reparación de copias físicas.
- Incidencias de carpeta exterior.
- Indicador de bloqueo de uso.
- Resolución de incidencias.
- Centro de mantenimiento.
- Operaciones individuales y masivas.
- Auditoría.
- Avisos no bloqueantes.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 5 — Cesiones individuales

Implementar:
- Préstamos puntuales.
- Asignaciones.
- Entregas.
- Devoluciones rápidas.
- Firma o confirmación existente.
- Conflictos de disponibilidad.
- Historial por persona y carpeta.
- Incidencias opcionales durante devolución.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 6 — Integración con vestuario

Implementar:
- Entrega conjunta.
- Devolución conjunta.
- Selección parcial de material.
- Movimientos independientes.
- Una firma por operación cuando proceda.
- Independencia de periodos de cesión.
- Pruebas de regresión de vestuario.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 7 — Voces, actuaciones y series

Implementar:
- Selector de voz al añadir participante.
- Propuesta de voz habitual.
- Cambio de voz por actuación.
- Repertorios requeridos por actuación.
- Cálculo automático de necesidades.
- Preparación de carpetas por refuerzo.
- Series con cesiones continuas.
- División opcional ante actuaciones intermedias no asistidas.
- Cambios de voz sin alterar cesiones reales.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 8 — Recomendador y conflictos

Implementar:
- Recomendaciones por repertorio y voz.
- Preferencia por carpetas completas.
- Preferencia por carpetas sin incidencias.
- Permitir carpetas con incidencias no bloqueantes.
- Excluir carpetas no utilizables.
- Detección de reservas solapadas.
- Conflictos con cesiones no devueltas.
- Avisos en actuaciones e Inicio.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 9 — Optimización y pulido

Revisar:
- Experiencia móvil.
- Operaciones rápidas.
- Buscadores.
- Formularios.
- Estados visuales.
- Accesibilidad.
- Rendimiento.
- Consistencia estética.
- Mensajes de error.
- Operaciones masivas.

**DETENERSE Y ESPERAR APROBACIÓN.**

## FASE 10 — QA y despliegue

Probar, como mínimo:

1. Crear carpeta con código duplicado.
2. Crear una voz nueva.
3. Asignar a Juan Ruiz como clarinete principal en una actuación.
4. Asignar a Juan Ruiz como clarinete segundo en otra.
5. Cambiar la voz después de preparar material.
6. Crear carpeta con repertorio inicial completo.
7. Añadir una obra nueva a PRO.
8. Confirmar incorporación individual y masiva.
9. Registrar partitura faltante.
10. Registrar partitura presente pero dañada.
11. Resolver una incidencia de partitura.
12. Registrar elásticos rotos sin bloquear carpeta.
13. Recomendar una carpeta sin incidencias frente a otra deteriorada.
14. Prestar una carpeta con incidencia no bloqueante.
15. Bloquear una carpeta declarada no utilizable.
16. Registrar dos incidencias bloqueantes y resolver solo una, comprobando que sigue bloqueada.
17. Retirar una obra con una carpeta cedida.
18. Reactivar una obra retirada.
19. Entregar chaqueta y carpeta conjuntamente.
20. Devolver carpeta sin devolver chaqueta.
21. Devolver carpeta sin revisar el repertorio.
22. Registrar incidencia durante la devolución.
23. Crear una cesión puntual.
24. Detectar asignaciones solapadas.
25. Gestionar una cesión vencida sin devolución real.
26. Preparar una serie con cambios de voz.
27. Mantener dos carpetas simultáneamente para una persona.
28. Archivar una carpeta sin perder historial.
29. Verificar permisos y políticas RLS.
30. Comprobar que todos los flujos existentes de vestuario siguen funcionando.

No realizar operaciones destructivas sobre datos reales sin autorización.

**DETENERSE Y ESPERAR APROBACIÓN.**

---

# INSTRUCCIÓN FINAL

Comienza exclusivamente por la **FASE 0**.

Inspecciona la implementación real antes de proponer modificaciones.

Da especial importancia a:

1. La asignación de voz por actuación.
2. La diferencia entre partitura faltante y partitura presente pero dañada.
3. La diferencia entre incidencia de una partitura e incidencia de la carpeta física.
4. La independencia entre incidencias de mantenimiento y operatividad.
5. La prioridad de carpetas sin incidencias en las recomendaciones.
6. La compatibilidad con el sistema actual de vestuario y cesiones.

Si descubres incompatibilidades con la arquitectura existente, explica las alternativas y recomienda la de menor impacto.

No avances a la fase 1 sin aprobación expresa.
# Carpetas musicales y repertorio — fase 0

Fecha: 13 de octubre de 2026. Estado: aprobada por el usuario el 13 de octubre de 2026.
Referencia funcional: [prompt maestro](prompt-maestro.md).

Esta es una ampliación de Gestión de trajes, no otra aplicación. No se han cambiado
código, migraciones, configuración de despliegue ni datos. Solo se documenta la auditoría.
Los nombres nuevos de tablas, servicios y rutas de este documento son propuestas.
Esta numeración de fases pertenece a Carpetas y es independiente de las fases anteriores.

## 1. Auditoría de la implementación existente

Se inspeccionaron las 12 migraciones versionadas y, especialmente, las definiciones
vigentes de planificación (migración 011) y conflictos (010), no solo sus versiones iniciales.
Se revisaron el acceso, los repositorios Angular, las rutas, la firma, los listados,
la preparación de series, las pruebas y la configuración del despliegue.
La comprobación se basa en el repositorio local: no se ha consultado ni alterado
el esquema remoto de producción. Antes de aplicar futuras migraciones se cotejará su historial.

| Área | Implementación comprobada | Consecuencia |
|---|---|---|
| Acceso | `admin_profiles`, `private.is_admin()`, Auth y guards | Reutilizar el mismo administrador, sin otro sistema de usuarios. |
| Personas | `people`: tipo BANDA/REFUERZO, instrumento como texto y archivado | Reutilizar UUID; mostrar Componente. El instrumento no identifica una voz. |
| Actuaciones | `events`, uniforme obligatorio e instantánea de tipos, cuatro fechas | Añadir repertorios sin reutilizar tipos de prendas. Conservar uniformes existentes. |
| Participaciones | `event_participants`, PK `(event_id, person_id)`, `active`, `block_id` | Lugar natural para la voz opcional por actuación. |
| Asignaciones | `event_assignments`, clave actuación/persona/tipo de prenda | No sirve como tabla de carpetas sin alterar su semántica. |
| Series | `event_series`, `series_blocks` con `type_ids`, un `block_id` por participación | Los periodos de carpetas deben ser independientes de estos bloques de vestuario. |
| Cesiones | `loans` con `due_at` en cabecera; `loan_items` exige prenda, tipo y talla | Evitar meter carpetas como prendas o compartir obligatoriamente su vencimiento. |
| Posesión | Índice único parcial en `loan_items(garment_id)` si no devuelta | Repetir esta garantía para carpetas. |
| Movimientos | `record_loan_movement`, `loan_movements`, firma obligatoria, devoluciones parciales | Reutilizar patrón y firma; coordinar entregas mixtas en servidor. |
| Planificación | `plan_event`, `plan_series`, lock 65005, `planning_requests`, versiones | Integrar cambios mediante revisión y confirmación; mantener transacciones y conflictos. |
| Conflictos | `wardrobe_conflicts`, avisos de devolución compatible separados | Mantener la distinción entre aviso y conflicto real. |
| Auditoría | `audit_log` con acciones cerradas y FK generadas por entidad | Ampliarla explícitamente; no reintroducir Actividad reciente. |
| Interfaz | Cinco pestañas, formularios breves, filtros, tarjetas y carriles de series | Integrar Carpetas dentro de Inventario, manteniendo estos patrones. |
| Despliegue | `wrangler.jsonc`, Workers Static Assets y modo SPA | El prompt menciona Pages, pero el despliegue adoptado es Workers; conservarlo. |

Referencias principales: `supabase/migrations/20261005000500_loans.sql`,
`20261005000600_events.sql`, `20261005000800_series.sql`,
`20261005001000_conflicts.sql`, `20261005001100_reuse_owned_garments.sql`;
`src/app/core/loans/`, `src/app/core/events/`, `src/app/shared/ui/signature-pad.ts`,
`src/app/features/loans/loan-operation.ts`, `src/app/features/events/series-detail.*`.

### Incompatibilidades y alternativa de menor impacto

1. **No generalizar `garments` ni `loan_items`.** Hacer talla/tipo opcionales y añadir
   repertorio afectaría las RPC, vistas, recomendador y pruebas existentes. Se recomienda
   un dominio especializado de carpetas y una coordinación común de operaciones físicas.
2. **No reutilizar `series_blocks` para carpetas.** Sus tipos y duración son de vestuario;
   además, `ATTENDANCE` reconstruye esos bloques y sus asignaciones. Los nuevos periodos
   se enlazarán a participaciones estables, nunca a esos bloques que pueden desaparecer.
3. **Cambiar voz no debe ejecutar `ATTENDANCE`.** Actualmente este comando puede rechazar
   cambios con prendas entregadas (`SERIES_IN_CUSTODY`). La nueva operación de voz será
   independiente, con revisión de carpetas afectadas, sin devolver ni replanificar prendas.
4. **No hacer dos peticiones HTTP para una entrega conjunta.** Una podría confirmarse
   y la otra fallar. Hace falta una RPC coordinadora con una transacción y firma común.
5. El selector `ChoicePicker` está acoplado a Personas/Prendas y el texto de `SignaturePad`
   menciona prendas. Reutilizar el selector de personas y parametrizar el texto de firma;
   no forzar el selector de prendas para representar carpetas.

## 2. Modelo especializado propuesto

| Entidad propuesta | Responsabilidad |
|---|---|
| `musical_voices` | Código corto único, nombre, familia/instrumento opcional, archivo, versión y responsables. |
| `music_repertoires` | Catálogo PRO/PMM y revisión lógica del catálogo. |
| `repertoire_works` | Obra, título, autor, repertorio fijo, activa/retirada, versiones y fechas. |
| `repertoire_work_periods` | Intervalos de pertenencia activa medidos por revisión del catálogo. No versiones de partituras. |
| `music_folders` | Código físico único, repertorio, voz fija, revisión inicial, bloqueo manual, archivo y observaciones. |
| `folder_work_presence` | Último estado físico explícito por carpeta/obra cuando difiere o se ha comprobado después del alta. |
| `folder_work_movements` | Historial inmutable de incorporación, ausencia, retirada y recuperación/sustitución confirmada. |
| `folder_score_issues` | Incidencias sobre una obra concreta dentro de una carpeta. |
| `folder_physical_issues` | Incidencias de cubierta, elásticos, anillas, etc., con indicador explícito de bloqueo. |

Todas las entidades editables incorporarán versión y autor/fechas del servidor; las
incidencias también resolución y observaciones. Relaciones reales y borrado restringido.
La relación carpeta/obra debe pertenecer al mismo repertorio, validada en PostgreSQL
con claves compuestas o validación equivalente protegida, no solo en formularios.

Código de carpeta normalizado y único, incluso entre archivadas. Validar
`PRO|PMM` + código de voz + número conforme al formato impreso. No generar ni renumerar
etiquetas. Conservar el identificador físico. Una voz se puede renombrar sin cambiar su
código corto ni los códigos de carpetas; códigos de voz ya utilizados serán estables.
Repertorio y voz de una carpeta no se cambiarán como una edición ordinaria una vez usada.
Una corrección excepcional requeriría un flujo explícito; no forma parte de esta ampliación.

No convertir los ejemplos del prompt en un catálogo supuesto completo. PRO y PMM sí son
los dos repertorios requeridos; las voces se gestionarán desde la aplicación.

## 3. Presencia inicial y evolución del repertorio

Al crear una carpeta existente, guardar `baseline_revision` del repertorio y registrar
una acción «contenido inicial presumido». No se trata de una revisión física.

Cada alta, retirada o reactivación de obra cambia la revisión lógica del repertorio y
abre/cierra su intervalo de actividad. La creación de carpeta se serializa con estos
cambios mediante bloqueo del repertorio para no dejar dudas en operaciones simultáneas.
Editar título/autor no modifica pertenencia ni genera mantenimiento.

Para reconstruir la presencia de una obra:

1. Usar el último estado físico explícito de esa pareja, si existe.
2. En su defecto, presumir presente si estaba activa en la revisión inicial de la carpeta.
3. Si no estaba activa, no presumir que haya sido incorporada.

No se crean filas por cada pareja al dar de alta carpetas ni al añadir obras.
Los intervalos de actividad son compartidos por todas las carpetas. Las filas explícitas
aparecen cuando hay una operación física o una incidencia de ausencia.

| Situación | Presentación |
|---|---|
| Obra activa y presente | Presente; puede tener deterioro pendiente. |
| Obra activa declarada faltante | Faltante. |
| Obra activa nunca incorporada o retirada anteriormente | Pendiente de incorporar. |
| Obra retirada del repertorio, físicamente presente | Pendiente de retirar. |
| Obra retirada y físicamente ausente | Sin retirada pendiente; conservar en historial. |

El último caso necesita un estado interno ausente/retirada aunque no genere una tarea
activa. «Pendiente de retirar» significa que sigue presente; no es ausencia.

Una reactivación consulta la presencia real anterior: si la copia nunca se retiró, vuelve
a contar como presente; si se retiró, necesita incorporación; si se declaró faltante,
conserva esa incidencia. Nunca reinicializar carpetas antiguas ni borrar excepciones.
Una carpeta archivada conserva su revisión y cambios; al reactivarla aparecen las tareas
que correspondan, sin fingir que su contenido se actualizó durante el archivo.

## 4. Incidencias y operatividad

Las incidencias de partituras y las físicas se guardan por separado. No reutilizar
`garment_state`: DANADA significa otra cosa en el dominio de vestuario.

- Partitura faltante: registrar incidencia y ausencia en la misma transacción.
- Partitura dañada: registrar incidencia manteniendo la presencia que consta; no asumir
  que ha reaparecido una partitura previamente ausente.
- Sustituir/recuperar: confirmar la presencia y resolver las incidencias seleccionadas
  en la misma operación. No cerrar otras incidencias indiscriminadamente.
- Resolver una incidencia administrativa no implica por sí solo incorporar o retirar
  una copia: el formulario y la RPC deben exigir el resultado físico cuando proceda.
- Si se retira del repertorio una obra faltante, no generar retirada física ni borrar
  su incidencia. Mostrarla con el contexto de obra retirada y permitir resolución explícita.

Unicidad parcial de incidencia abierta equivalente: carpeta/obra/tipo para partituras;
carpeta/tipo para incidencias físicas. Una nueva observación amplía la incidencia abierta
con auditoría. Tras resolverla puede registrarse una nueva, conservando la anterior.

Operatividad efectiva:

`utilizable = no archivada AND no bloqueo manual AND ninguna incidencia física bloqueante abierta`

Resolver uno de dos bloqueos mantiene la carpeta no utilizable. Resolver todos tampoco
elimina un bloqueo manual. Daños no bloqueantes, faltantes y tareas de repertorio generan
avisos, no una prohibición automática de asignación/entrega. Archivar con posesión activa
se rechazará; declarar no utilizable durante la cesión sí se permite y no la devuelve.
Devolver siempre debe seguir permitido aunque la carpeta no sea utilizable.

El centro de mantenimiento agregará tareas derivadas de repertorio y ambas clases de
incidencias, con contadores separados. No duplicar una ausencia como dos tareas distintas
por tener además una incidencia faltante vinculada. El total y los motivos deben ser claros.
Operaciones masivas acotadas: revisión, confirmación atómica y auditoría individual por
carpeta; ante un conflicto, nada se aplica y se identifican los elementos a revisar.

## 5. Voz por participación y planificación

Añadir `voice_id` nullable a `event_participants`, con FK a `musical_voices` y auditoría de
sus cambios. No añadir una voz obligatoria a `people`. La clave actuación/persona ya existe.
El soporte de selección y las RPC de participación se incorporan en fase 7; hasta entonces
ninguna participación histórica se rellena por inferencia.

Las propuestas usarán participaciones anteriores con voz definida, con criterio explícito
(última usada, frecuencia como información) y sin asignación silenciosa. No usar futuras
participaciones como evidencia histórica ni transformar «Clarinete» en CLA1 automáticamente.
Voces archivadas permanecen visibles en históricos, pero no se proponen para nuevos planes.

`event_repertoires` relacionará actuación con cero, uno o dos repertorios. Las actuaciones
anteriores tendrán cero necesidades de carpetas hasta configurarlas expresamente.
Para preparación individual, propuesta: refuerzos incluidos por defecto al activar
repertorios; permitir incluir componentes explícitamente mediante un indicador de necesidad
de carpeta en la participación. Así no se presupone que todos los componentes necesitan
material prestado. Es una decisión propuesta para validación, no un requisito añadido.

Necesidad derivada: participación activa + requiere carpeta + repertorio(s) + voz.
Con voz pendiente, mostrar «Voz pendiente», no sugerir una carpeta arbitraria.

Planificación especializada propuesta:

- `folder_plan_periods`: persona, repertorio, voz y periodo propio `[desde, hasta)`, decisión
  mantener/dividir y versión. Puede corresponder a una actuación, serie o reserva puntual.
- `folder_plan_events`: participaciones cubiertas por cada periodo, con relaciones reales.
- `folder_assignments`: ejemplar reservado para el periodo y línea física que cumple la
  entrega, si existe. Asignar nunca genera una cesión ni cambia la posesión.

Para una serie, agrupar por persona/repertorio/voz y proponer desde el primer hasta el
último uso. Detectar actuaciones intermedias no asistidas en el orden de la serie y pedir
mantener/dividir; no copiar automáticamente la decisión de vestuario. Un cambio de voz
crea necesidades diferentes y permite conservar dos carpetas simultáneamente.
Un mismo ejemplar continuo se reserva una sola vez aunque sirva varias actuaciones.

Cambiar voz, repertorio, asistencia, fechas o cancelación debe revisar el impacto sobre
estos periodos. Usar vista previa con versiones y confirmación de ajustes futuros; preservar
las cesiones existentes. Si el usuario no confirma, conservar el plan anterior. El historial
debe reflejar reservas sustituidas/canceladas. La copia de agenda podrá copiar repertorios,
pero seguirá sin copiar participantes, asignaciones ni entregas.

## 6. Cesiones especializadas y operaciones comunes

Recomendación de menor impacto: mantener `loans`, `loan_items` y su RPC con su contrato
actual para Vestuario; añadir `folder_loans`, `folder_loan_items`, `folder_loan_movements`.
La cabecera de carpetas identifica persona y apertura; fecha prevista, entrega y devolución
por línea permiten independencia incluso entre dos carpetas entregadas juntas.
Índice único parcial de carpeta con `returned_at IS NULL`, sin expiración automática.

Desde fase 5, las nuevas operaciones de carpetas se registrarán con un identificador común
`material_operations` (actor, fecha, confirmación de firma, petición y resultado).
En fase 6, una RPC coordinadora usará ese registro para unir movimientos especializados
con relaciones verificables; los movimientos antiguos seguirán válidos sin ese vínculo.
No migrar ni inventar firmas para el histórico existente.

Una entrega conjunta para una persona:

1. Revisión de selección y fechas independientes, una única firma sobre todo el resumen.
2. Una RPC valida versiones, disponibilidad y firma; bloquea filas en orden estable.
3. Registra todas las líneas de prendas y carpetas, movimientos y auditoría en una transacción.
4. Si falla cualquier elemento, revierte todo; reintentar la misma petición devuelve el
   mismo resultado y no duplica entregas. Reutilizar UUID con otro actor o contenido se rechaza.

No basta con llamar a repositorios de prendas y carpetas secuencialmente desde Angular.
El adaptador de vestuario podrá reutilizar `record_loan_movement` dentro de la transacción
manteniendo el orden real de locks, con pruebas concurrentes entre llamadas antiguas y nuevas.
Cuando la entrega parte de una actuación debe actualizar también las referencias de
cumplimiento; no saltarse `plan_event DELIVER` ni dejar prendas físicamente entregadas sin enlace.
Definir un orden común para solicitudes, planificación, persona, cabeceras y recursos
ordenados; evitar adquirir el lock de planificación después de bloquear prendas.

Devoluciones parciales: seleccionar lo que vuelve, confirmar/firmar y registrar; no exigir
revisar obras ni resolver mantenimiento. Prendas y carpetas cierran sus propias cesiones
cuando corresponda. La pantalla Cesiones puede agruparlas por operación sin aparentar un
vencimiento único. Reutilizar firma presencial actual (booleano, sin imagen ni Storage).

Extender la protección del archivado de personas para detectar también carpetas en su
poder. No permitir que el nuevo módulo deje a una persona archivada con cesiones ocultas.

## 7. Disponibilidad y recomendación

No guardar DISPONIBLE/RESERVADA/CEDIDA como una única columna mutable: una carpeta puede
estar cedida y tener una reserva futura compatible. Mostrar posesión actual y próxima reserva.
Disponibilidad se consulta para el periodo completo y se revalida al confirmar.

Filtros obligatorios: repertorio exacto, voz exacta, no archivada, operativa y sin reservas
incompatibles. La posesión de otro con devolución prevista compatible es una opción
condicionada con aviso, menos preferente que una carpeta disponible; no permite otra
entrega física hasta la devolución real. Sin fecha o con devolución incumplida, señalar
conflicto. Una ya cedida a la misma persona puede cubrir su necesidad sin otra entrega,
si es compatible con todo el periodo.

Entre opciones viables: disponibilidad sin depender de terceros, repertorio completo,
menor número de tareas de repertorio, menos incidencias de conservación; desempate estable
por código. Mostrar los motivos. No premiar accidentalmente una carpeta llena de incidencias
porque tiene menos filas de mantenimiento almacenadas: contar las tareas derivadas también.

Nunca recomendar otra voz ni una carpeta bloqueada. Incidencias no bloqueantes permiten
recomendar/asignar/entregar con aviso. Mostrar propuestas no escribe reservas.

## 8. Interfaz, integración y rendimiento

Mantener las cinco entradas de `src/app/layout/navigation.ts`.
Inventario incorpora Vestuario / Carpetas. Carpetas incluye Inventario físico,
Repertorios y Mantenimiento; catálogo de voces accesible desde este módulo.
Rutas nuevas bajo `/inventario/carpetas/...`, declaradas antes de `/inventario/:id`
para evitar que «carpetas» se interprete como UUID de prenda. No romper enlaces actuales.
Las rutas de cesiones de carpetas seguirán el mismo criterio respecto a `/cesiones/:id`.

Reutilizar tokens de `src/styles.scss`, patrón de pestañas `events-tabs.ts`, tarjetas,
paginación, filtros en URL, selector de personas, carril de participantes y firma.
No todas las piezas son genéricas: adaptar únicamente lo necesario, sin nueva librería UI.
Ficha de carpeta: código, posesión, operatividad y resumen de pendientes primero;
obras e históricos consultables por búsqueda y páginas, no listas interminables.
Una advertencia resumida abre sus detalles. Devolución con mantenimiento opcional desplegable.

Servicios propuestos en `core/folders`, `core/repertoire`, `core/maintenance` y,
cuando corresponda, coordinación en `core/material-operations`; pantallas con carga diferida.
Tipos especializados en `database.types.ts` y modelos propios. No extender `PhysicalState`
con estados que corresponden solo a carpetas.

Consultas agregadas en PostgreSQL, sin una petición por carpeta u obra. Paginación de 24
como los inventarios actuales; búsqueda de obra sin descargar todo el repertorio.
Índices por repertorio/voz/archivo, código único, pareja carpeta/obra, incidencias abiertas,
posesión activa, persona/fecha y asignación/periodo. Las tareas derivadas se consultan por
lotes; medir planes con volúmenes representativos antes de introducir cachés persistentes.
Las operaciones de catálogo bloquean solo el repertorio afectado. Reservas coordinadas
con el lock de planificación existente; si se divide en locks más finos, hacerlo después
de demostrar la integridad concurrente, no durante esta primera integración.

## 9. Migraciones, seguridad y fases

Solo migraciones nuevas posteriores a `20261005001200_productivity.sql`; no editar archivos
ya aplicados. Antes de producción, comparar historial remoto y respaldar según la operativa
existente. No borrar datos de demostración ni datos reales como parte de la ampliación.

- Fase 1: catálogos, carpetas, revisión inicial, presencia e historial, ambas incidencias,
  operatividad, RLS, índices, RPC y tipos/servicios. Probar integridad sin nuevas pantallas.
  Campo de voz nullable puede quedar preparado sin rellenar datos existentes.
- Fases 2–4: navegación/inventario; repertorio; mantenimiento, consumiendo esa base.
- Fase 5: cesiones especializadas, operaciones idempotentes, posesión única, reservas
  puntuales y devolución rápida, con pruebas de integridad antes de conectarlas a eventos.
- Fase 6: coordinador mixto, enlaces de operaciones y vistas/listados conjuntos; preservar
  la API de vestuario y probar los fallos parciales.
- Fase 7: repertorios y voces de participaciones, periodos de carpetas y cambios confirmados
  de eventos/series. No esperar a fase 8 para prevenir reservas solapadas en servidor.
- Fase 8: recomendador y presentación central de conflictos y avisos.
- Fases 9–10: pulido, rendimiento, QA completo y despliegue conforme al prompt.

Todas las tablas nuevas: RLS, SELECT solo ADMIN activo, sin escritura directa desde
navegador. RPC con `private.is_admin()`, lista cerrada de campos, validación en servidor,
`search_path` cerrado, EXECUTE revocado a PUBLIC/anon, control de versión y petición UUID.
Vistas `security_invoker`; funciones privilegiadas verifican explícitamente el rol.
Auditoría de cambios/resoluciones y movimientos protegida, con actor y reloj del servidor.
Ampliar las restricciones de `audit_log` conservando acciones históricas y FK reales.
No guardar PDFs, imágenes de firma o credenciales nuevas; no añadir servicios de pago.

## 10. Pruebas ejecutadas y estrategia

Base actual comprobada el 13/10/2026:

- `npm test`: 30 pruebas aprobadas, 8 archivos.
- `npm run test:db`: 89 comprobaciones aprobadas, 9 grupos, con PGlite aislado aplicando
  todas las migraciones actuales. No toca Supabase remoto.
- Inspección estática de rutas, firma, cesiones, planificación, estilos y despliegue.
- No se han ejecutado pruebas de navegador ni verificación de producción en esta fase.

En fases siguientes conservar estas pruebas como regresión y añadir los 30 casos del
prompt. Especial atención a secuencias: alta de carpeta → obra nueva → retirada → reactivación;
alta de carpeta entre cambios; presencia dañada frente a ausencia; dos bloqueos con una
sola resolución; incorporación y resolución concurrentes; carpetas archivadas/reactivadas;
fechas de Madrid y límites de intervalos; cambio de voz con carpeta entregada; cancelación
con cesión abierta; prendas/carpetas con devolución distinta; reintentos y rollback mixto.

PGlite sirve para integridad y permisos simulados; no sustituye pruebas concurrentes con
conexiones PostgreSQL reales. Validar esas carreras en un entorno aislado antes de publicar.
Playwright actual emula móvil sobre Chrome; añadir Safari/WebKit y dispositivos reales en
QA final sin afirmar que la emulación cubre todos los navegadores.

## 11. Decisiones pendientes de aprobación

Se recomienda aprobar conjuntamente: modelo especializado, presencia inicial por revisión
lógica, incidencias separadas, periodos de carpetas propios y operaciones mixtas atómicas.
Supuesto funcional propuesto: refuerzos requieren carpeta al activar repertorios; componentes
pueden incluirse expresamente. No se asignará voz ni repertorio por defecto a datos anteriores.

La implementación comienza únicamente tras aprobación expresa de la fase 1.

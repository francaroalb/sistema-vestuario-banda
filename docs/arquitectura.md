# Arquitectura y decisiones aprobadas

## Límites

Proyecto, repositorio Git, Supabase y futuro despliegue independientes de Entradas.
Angular SPA standalone con Signals y carga diferida, Supabase Auth y PostgreSQL con RLS.
No backend propio, monorepo ni librería visual compartida. Interfaz en español.

La referencia visual es `sistema-entradas-banda`: granate #8e1717/#5d0c12, dorado #c48113,
fondos claros, Manrope y Cormorant Garamond. Tokens y patrones comunes copiados al proyecto;
sin dependencia de ejecución sobre la aplicación de Entradas.

## Cambios aprobados después de fase 0

- Cada actuación tendrá **fecha/hora de inicio y fin**, interpretadas en Europe/Madrid.
- La disponibilidad futura se calculará con intervalos horarios `[inicio, fin)`, permitiendo
  varias actuaciones el mismo día. El intervalo de posesión previsto incluirá preparación,
  entrega y devolución cuando se definan esos flujos; no confundir duración del evento con
  tiempo total durante el cual la prenda está ocupada.
- Fechas reales de movimientos/auditoría en `timestamptz`, generadas por el servidor.
- La operativa requiere conexión. PWA sin escrituras offline ni caché de datos privados.
- Tabla mínima de administradores y RLS adelantadas a fase 1 para probar autorización real.

## Modelo global previsto (implementación parcial por fases)

- Tipos de prendas y tallas comparables por sistema/tipo; códigos visibles únicos sin formato rígido.
- Prenda física única, estado DISPONIBLE/PENDIENTE_LAVANDERIA/DANADA y archivado independiente.
- Persona persistente con tipo BANDA/REFUERZO mutable sin duplicar su identidad.
- Uniforme configurable con sus tipos requeridos; actuación con uniforme y serie opcional.
- Participación persona–actuación; plan de vestuario por persona y periodo, con actuaciones asociadas.
- Asignación reserva una prenda para el futuro; no crea una posesión física.
- Cesión real con varias líneas de prendas. Cada línea conserva entrega y devolución propias.
- Cesión finalizada cuando todas las líneas han vuelto; devoluciones parciales no cierran toda la cesión.
- Cambio: cerrar la línea antigua y añadir otra en la misma cesión, dentro de una transacción.
- Movimientos de ENTREGA/DEVOLUCION/CAMBIO con detalle, administrador, timestamp y confirmación de firma.
- Firma dibujada solo en memoria; descartar imagen al confirmar.
- Auditoría separada de movimientos, generada en base de datos y sin edición libre desde el cliente.

## Planificación y conflictos

En series, consecutivo significa adyacente en el orden de actuaciones de la serie, no días
consecutivos del calendario. Si existe una actuación intermedia no participada, preguntar
siempre si se mantiene una única cesión o se divide; persistir la decisión.

Evitar solapamientos de reservas incompatibles y prohibir dos posesiones físicas abiertas
de una misma prenda. Revalidar y bloquear registros dentro de las RPC al confirmar operaciones.
La posesión real prevalece: mantener una prenda no borra ni modifica silenciosamente reservas;
genera advertencias/conflictos visibles. Los cambios de planificación no reescriben movimientos reales.

Recomendador determinista: historial real por tipo, talla más frecuente, desempate por reciente,
disponibilidad de todo el intervalo y siguiente talla mayor comparable si es necesario.
Nunca inventar talla ni recomendar automáticamente una menor. Prendas actualmente cedidas,
dañadas, lavandería o en conflicto no serán primeras recomendaciones automáticas.

## Fase 2 implementada

- Nombre visible **Gestión de trajes**, inicio con acciones y recuentos reales, logo de la Banda,
  navegación burdeos y acentos dorados. Sin mensajes promocionales.
- Tablas `garment_types`, `garments` y `audit_log`. Tipos iniciales: Chaqueta, Camisa y Pantalón.
- Código único global (también en archivadas), normalizado a mayúsculas y sin espacios exteriores.
- Talla como texto libre normalizado, sin inferir orden ni equivalencias. Al abordar el recomendador
  se definirá un catálogo comparable por tipo/sistema sin perder los valores originales.
- Solo tres estados físicos; archivo independiente. No existe `CEDIDA` como estado físico.
- Alta/edición y archivo/reactivación por RPC con bloqueo de fila y versión optimista. Un conflicto
  devuelve `PT409`/HTTP 409; no utilizar `40001`, reservado a errores de serialización transitorios.
  La migración correctiva es aditiva y mantiene el historial de migraciones aplicado.
- Un UUID de alta se conserva en los reintentos del formulario para evitar duplicados tras una
  respuesta perdida. Las operaciones sin cambios no generan auditoría adicional.
- Auditoría transaccional con actor y fecha del servidor y fotografías JSON de antes/después.
  Consulta restringida a ADMIN; escritura/borrado desde navegador prohibidos. Su vista de gestión
  corresponde a fase 9. El historial de movimientos se incorporará con las cesiones en fase 4.
- Listado de 24 prendas por página, código por coincidencia parcial literal y filtros combinables
  por tipo, talla exacta, estado y archivo. Los filtros permanecen en la URL al abrir/volver de una ficha.
- Recuentos agregados en servidor. No hay datos de muestra permanentes.
- Desconexión: sin escrituras y conservando el borrador actual en memoria. Salir o recargar un
  formulario modificado requiere confirmación; no se promete persistencia local del borrador.

## Fase 3 implementada

- `people`: UUID permanente, nombre completo, tipo BANDA/REFUERZO mutable, instrumento,
  teléfono y observaciones opcionales, archivo independiente, versión y autor/fechas del servidor.
- No hay nombre único ni identidad basada en nombre/teléfono: se admiten homónimos.
  El nombre y el instrumento conservan las mayúsculas y acentos introducidos; se eliminan espacios
  exteriores y se agrupan espacios repetidos. No se exige catálogo de instrumentos en esta fase.
- Alta/edición y archivo/reactivación por RPC. Reintentos de alta con el mismo UUID se serializan
  con un bloqueo transaccional y no duplican ni la ficha ni su auditoría. Ediciones desactualizadas
  devuelven HTTP 409 y mantienen el borrador del formulario.
- Auditoría ampliada sin perder entradas de prendas: `entity_type`/`entity_id` se conservan y
  columnas generadas `garment_id`/`person_id` mantienen claves foráneas reales con borrado restringido.
  Cada cambio de tipo conserva la identidad, autor y estado anterior/posterior.
- RLS ADMIN y prohibición de escrituras directas, borrados y manipulación de auditoría desde navegador.
- Listado paginado de 24 personas, búsqueda parcial por nombre y filtros de tipo, instrumento
  (parcial) y archivo. Una última página vacía tras archivar redirige a la última página existente.
- Accesos Nueva persona / Buscar persona en Inicio. Se reutiliza el estilo de fichas del inventario.
- Base histórica preparada mediante UUID estable y auditoría protegida. Las futuras cesiones
  referenciarán `people.id`; no se crean préstamos, movimientos ni tallas inferidas antes de fase 4.
  La consulta general de auditoría sigue reservada para fase 9.

## Fase 4 implementada

- `loans`: persona y nombre al entregar, fecha real, devolución prevista opcional, notas, cierre y versión.
- `loan_items`: una línea por entrega física, con código/tipo/talla originales. Devolución y estado
  final por línea. Índice único parcial impide dos posesiones abiertas de una misma prenda.
- `loan_movements`: ENTREGA/DEVOLUCION/CAMBIO con instantáneas de líneas, persona, actor, hora y
  confirmación de firma. No existe columna de imagen ni trazos. Escrituras y borrado denegados al navegador.
- Una RPC transaccional bloquea persona, cesión y prendas en orden estable, valida los datos y
  registra movimiento y auditoría. Cambio devuelve una línea y entrega otra del mismo tipo sin
  cerrar la cesión. Solo cerrar cuando todas las líneas estén devueltas.
- Cada formulario mantiene UUID de cesión/operación. Reintentos del mismo contenido devuelven la
  operación ya confirmada; un UUID reutilizado con distinto contenido produce conflicto HTTP 409.
- Nuevas entregas solo de prendas activas, disponibles físicamente en la Banda y con persona activa.
  Archivo de personas/prendas bloqueado si mantienen posesión pendiente. Se permite registrar
  devoluciones aunque la persona no participase ya: la realidad física queda en los movimientos.
- La fecha prevista se recibe como fecha/hora local, se valida y convierte en PostgreSQL con
  Europe/Madrid; se rechazan horas inexistentes/repetidas y fechas pasadas. Sin fecha no hay vencimiento.
- Firma canvas por Pointer Events, ratón o táctil. Validación mínima de trazo; solo transmitir
  confirmación booleana. Limpiar, cambiar selección y destruir eliminan el dibujo; redimensionar solo escala el canvas en memoria.
  El servidor exige confirmación; no verifica identidad biométrica ni firma digital.
- Vistas con `security_invoker` para cesiones y situación del inventario, con RLS en tablas base.
  «Cedida» es una posesión derivada, nunca un estado físico. Disponibles del inicio excluye cedidas.
  En listado y ficha, una posesión abierta tiene prioridad visual: etiqueta «Cedida» y nombre de
  la persona. No mostrar «Disponible» mientras esté cedida; lavandería/daños se indican por separado.
- Fichas de persona/prenda muestran seis cesiones recientes (activas primero) y enlace al listado
  completo filtrado; la ficha de cesión contiene líneas y movimientos. No hay recomendaciones ni reservas.
- Auditoría ampliada a cesión con clave foránea generada y restricción de borrado, conservando las
  auditorías anteriores. Los movimientos tienen autor y hora propios; no se reescriben al editar fichas.

## Fase 5 implementada

- Uniformes configurables con uno o varios tipos de prenda y archivo independiente. Cada actuación
  conserva una instantánea del nombre y los tipos elegidos, evitando cambios silenciosos al editar el uniforme.
- Actuaciones individuales con inicio/fin y periodo previsto de posesión que contiene todo el evento.
  Conversión y validación de las cuatro fechas en PostgreSQL/Europe-Madrid; rechazo de horas DST ambiguas.
- Participaciones persistentes con alta/baja lógica; búsqueda de personas existentes y alta rápida
  atómica de refuerzo (nombre e instrumento) reutilizando el modelo de Personas.
- Una asignación por actuación/persona/tipo, independiente del estado físico y de las cesiones.
  Intervalos `[desde, hasta)`: una devolución a las 14:00 permite otra reserva desde las 14:00.
  En esta fase se bloquean todos los solapamientos entre actuaciones, incluso para la misma persona;
  la cesión continuada entre actuaciones se resolverá explícitamente en fase 6.
- RPC `plan_event` con lista cerrada de comandos/campos, versión optimista y UUID estable de petición.
  Bloqueo transaccional de planificación para evitar escritura concurrente incompatible entre eventos;
  bloqueos de persona y prenda coordinados con los de cesiones. No se necesita una extensión nueva.
- `planning_requests` deduplica reintentos. Auditoría general ampliada con FK reales de actuación/uniforme,
  actor y hora de servidor y estado anterior (evento, participaciones y asignaciones). Ninguna escritura
  directa del navegador; RLS ADMIN también en todas las tablas y vistas nuevas.
- Disponibilidad básica comprueba estado, archivo, tipo, otras reservas y posesión actual. Una prenda
  de otra persona sin devolución compatible no se asigna. Si hay fecha compatible, la reserva queda
  marcada pendiente de devolución, sin prometer una entrega hasta que la prenda vuelva.
- Preparación deriva «En su poder» de la cesión real, sin exigir otra entrega/firma si la persona ya la tiene.
  Entrega desde la actuación revalida versión, selección, firma y periodo real desde ahora; usa la RPC
  de cesiones en la misma transacción, registra vínculo a sus líneas y actualiza la preparación.
- Devoluciones y cambios siguen en Cesiones. La preparación consulta la situación actual de las prendas;
  no inventa entregas/devoluciones ni modifica una fecha de cesión al editar el plan.
- Cancelar libera reservas conservando históricos y posesión real. Quitar un participante/asignación
  tampoco registra una devolución. Reincorporar un participante retirado limpia sus antiguas
  asignaciones al pasar de inactivo a activo, conservándolas en la auditoría previa de la operación.
  No restaura reservas automáticamente ni altera cesiones; añadir una persona ya activa conserva su plan. Cambios físicos posteriores muestran avisos sin borrar el plan.
- Listados paginados: 24 actuaciones, 12 participantes/prendas candidatas, 6 reservas por ficha.
  Consulta de reservas en inventario/personas y aviso en el selector de cesiones ordinarias.
  Uniformes/tipos se gestionan dentro de Actuaciones; se mantiene la navegación de cinco secciones.
- No se implementan series, matriz de participación, recomendador ni motor completo de conflictos.

## Fase 6 — series y periodos

- `event_series` agrupa actuaciones y mantiene versión optimista. `events.series_id` es opcional.
  Las actuaciones individuales existentes conservan sus datos y comportamiento.
- `series_blocks` materializa un periodo por persona con actuaciones, tipos requeridos, límites
  horarios y decisión `CONSECUTIVE`, `KEEP` o `SPLIT`. Las participaciones enlazan el bloque.
  Orden: inicio de actuación e identificador para empates; no se cuentan días del calendario.
- `plan_series` valida ADMIN, RLS, comandos y campos cerrados. Usa el mismo bloqueo transaccional
  de planificación que `plan_event`, versión de serie y UUID de petición. Crear y vincular una
  actuación o crear un refuerzo y su participación son operaciones atómicas.
- La decisión de huecos se exige también en servidor. `KEEP` ocupa desde la primera recogida
  hasta la última devolución, incluyendo actuaciones no participadas. `SPLIT` materializa los
  tramos consecutivos y rechaza periodos de posesión que se solapan entre sí.
- Una reserva por tipo se propaga a todas las actuaciones del bloque. Si cambian los uniformes,
  el bloque requiere la unión de tipos. `planning_occupancy` proporciona intervalos completos;
  únicamente el mismo bloque/persona admite repetición de la reserva entre sus actuaciones.
  Las comprobaciones de actuaciones individuales y sus selectores utilizan esos mismos intervalos.
- La entrega reutiliza el movimiento firmado existente, usa el final del bloque y vincula la línea
  real a todas sus actuaciones. Reintentos no duplican movimientos. La posesión actual manda:
  no se crea otra cesión para prendas ya en su poder. Una devolución temprana o parcial real sigue
  siendo posible; no se inventan devoluciones por fechas o cambios del plan.
- No se altera retrospectivamente la devolución prevista de una cesión ya existente. Las nuevas
  entregas desde una serie sí toman el final del bloque como previsión.
- Las participaciones y asignaciones de actuaciones vinculadas se gestionan desde la serie.
  Cambiar participación reemplaza periodos y libera reservas con aviso y auditoría; no registra
  devolución física. Con líneas del bloque pendientes de devolver se bloquea el reemplazo.
- Cambiar orden, pertenencia, fechas, uniforme o cancelar actuaciones con bloques preparados exige
  retirar antes las participaciones. Así no se conserva una decisión de huecos ya invalidada.
  La interfaz explica esta restricción; los planes anteriores quedan en la auditoría.
- `series_detail` devuelve una instantánea coherente, solo ADMIN. Series paginadas de 24,
  selector de prendas de 12. Límite por serie: 60 actuaciones y 200 personas.
  Tras el refinamiento de fase 8, los participantes sustituyen la paginación de 12 y las dos
  columnas por una tira horizontal con búsqueda, filtros y una sola ficha abierta. Los
  pendientes aparecen antes de los preparados; la edición de participación queda dentro
  de la ficha. Se mantienen las casillas táctiles para elegir actuaciones y los mismos RPC.
- Migración `20261005000800_series.sql` aplicada al proyecto independiente. Sin cambios de
  permisos de administradores, almacenamiento de firmas ni escrituras offline.
- No se adelantan recomendador, preparación automática, duplicados de series ni motor de conflictos.

## Fases pendientes

Antes de fase 5 se ha aplicado el refinamiento visual solicitado: tokens comunes, superficies
neutras, navegación inferior burdeos y lateral claro, controles y jerarquía consistentes.
Ver `docs/sistema-visual.md`. Esta revisión no modifica modelos, RPC ni flujos funcionales.

9 Productividad implementada · 10 QA y producción pendiente.

Se requiere aprobación expresa entre fases. No comenzar fase 10 sin autorización.


## Fase 7 — recomendador y preparación asistida

- Reglas deterministas en PostgreSQL, sin IA. El histórico se obtiene de las tallas y tipos
  guardados en las líneas de cesiones físicas, incluyendo prendas devueltas. No se usa el
  inventario actual para reinterpretar una entrega antigua ni se aprende de reservas futuras.
- Talla preferida: mayor número de entregas por persona y tipo. Desempate por entrega más
  reciente y etiqueta estable; los empates siguen requiriendo revisión aunque exista un orden.
- Comparación conservadora: enteros positivos 1–999 y escala XXS, XS, S, M, L, XL, XXL/2XL,
  XXXL/3XL. No se mezclan números y letras. Otras etiquetas requieren coincidencia exacta.
  No se convierten sistemas de tallaje ni se presupone equivalencia entre marcas.
- Candidatas: misma talla primero y siguiente mayor disponible, hasta cinco opciones,
  ordenadas por talla, posesión propia y código/UUID. Nunca se propone una menor. La talla
  superior siempre requiere elección manual. Sin histórico no se inventa talla.
- Se excluyen prendas archivadas, dañadas, pendientes de lavandería, en poder de otra persona
  o reservadas en un intervalo incompatible. Una prenda en poder de su destinatario puede
  reutilizarse. Se comprueba todo el bloque de serie, incluidos huecos KEEP.
- La vista previa conserva las asignaciones existentes y cuenta las que necesitan revisar
  por conflicto o devolución pendiente. Solo propone automáticamente coincidencias claras.
  La asignación provisional es determinista por UUID de persona, inicio del periodo y tipo;
  no es un optimizador global de reparto. Evita repetir una prenda en periodos incompatibles.
- Máximo 200 líneas pendientes por vista previa. Para planes mayores hay que reducir las
  pendientes mediante la preparación manual. La interfaz pagina las propuestas de ocho en ocho.
- Confirmación explícita mediante RPC ADMIN: bloqueo de planificación compartido, bloqueo de
  personas y prendas, recálculo íntegro y comparación con la vista previa. Si cambian datos,
  rechaza todo el conjunto y pide actualizar; las asignaciones son atómicas e idempotentes.
- Se reutilizan plan_event/plan_series y su auditoría. No se crean cesiones, movimientos ni
  firmas al recomendar o reservar. Las escrituras directas siguen denegadas por RLS.
- Migración 20261005000900_recommendations.sql aplicada exclusivamente al Supabase de Vestuario.
  La fase 8 amplía esta base con seguimiento y resolución de conflictos.


## Fase 8 — conflictos y realidad física

- La vista wardrobe_conflicts, con security_invoker y RLS de sus tablas de origen, deriva
  las incidencias de reservas vigentes para actuaciones no terminadas ni canceladas. No hay
  una tabla de conflictos que pueda quedar desactualizada ni un botón para ocultarlos.
- Causas: prenda/persona archivada, tipo cambiado, daño, lavandería, posesión de otra persona,
  decisión de mantener y reservas incompatibles. La posesión propia no es un conflicto por
  sí misma. Una devolución futura compatible es un aviso diferenciado de un conflicto.
- Agrupación por bloque/actuación, persona y tipo. Para una serie se muestra la primera actuación
  aún vigente del bloque y su periodo completo. No se duplica el contador por cada actuación.
  El inicio resume conflictos y avisos; el panel pagina 12 filas y permite filtrar por gravedad.
- Al entrar/actualizar se recalcula con el reloj del servidor. No requiere cron ni cambia
  físicamente una prenda al vencer una fecha. Cesiones conserva su filtro de vencidas.
- loan_items.retained_at registra que se mantiene una línea pendiente. La fecha original
  loans.due_at no se borra ni se desplaza; a partir de esa decisión deja de justificar una
  devolución compatible para otras personas. Nuevas asignaciones manuales tampoco pueden
  confiar en esa fecha invalidada. Las reservas existentes se conservan y señalan.
- La acción requiere cesión activa con fecha prevista y permite elegir entre 1 y 30 prendas
  pendientes no marcadas previamente. Puede registrarse también antes de vencer cuando ya se
  sabe que la persona las conservará. No añade una fecha ficticia de devolución.
- preview_retention es de solo lectura y muestra todas las reservas afectadas de otras
  personas, incluidas series. Confirmar es una acción expresa; el impacto no impide mantener.
  Si el plan o la cesión cambian entre revisión y confirmación, hay que revisar el nuevo impacto.
- confirm_retention requiere ADMIN, comparte el bloqueo de planificación y bloquea persona,
  cesión y prendas en el mismo orden que movimientos. Verifica la vista previa íntegra,
  incrementa la versión de la cesión y admite reintentos con UUID sin duplicar decisiones.
  Compite de forma segura con una devolución/cambio físico y con nuevas asignaciones.
- loan_retention_decisions conserva administrador, fecha, selección e impacto observado;
  solo lectura para ADMIN. También se registra PRENDAS_MANTENIDAS en la auditoría.
  Es una decisión administrativa sin movimiento físico: no exige ni simula una firma.
  Entregas, cambios y devoluciones reales conservan su firma y sus validaciones.
- La devolución real resuelve la posesión, pero puede dejar una incidencia por daño o lavandería.
  Editar un estado sigue permitido; el formulario muestra las reservas y avisa del efecto futuro.
  La resolución utiliza las operaciones existentes con sus versiones y auditoría.
- Migración 20261005001000_conflicts.sql aplicada al Supabase independiente de Vestuario.
  No se alteran datos físicos ni reservas preexistentes al aplicar la migración.
- Las importaciones y copias de agenda se incorporan después en fase 9.

## Reutilización de prendas propias al añadir participantes

Migración `20261005001100_reuse_owned_garments.sql`: PARTICIPANT y ATTENDANCE vinculan
las prendas actualmente cedidas a esa persona para los tipos requeridos por el uniforme
(o la unión de tipos del periodo de serie). Incluye cesiones sin devolución prevista.
Solo se elige automáticamente una única prenda compatible por tipo, no archivada y en
buen estado, sin reserva solapada fuera de ese periodo. Varias opciones dejan la decisión
manual. No sustituye asignaciones ya existentes. Reincorporar elimina las reservas antiguas
según la regla previa y después evalúa de nuevo la posesión real actual.

La operación usa las transacciones, bloqueo de planificación, versiones e idempotencia
existentes. El ayudante privado no tiene permisos directos para usuarios del navegador.
No crea movimientos, cesiones ni firmas; no cambia la fecha prevista de devolución.
Las prendas reutilizadas se muestran EN_SU_PODER por su cesión activa, con Ver cesión.
Se aplica al registrar participación; no hace una asignación implícita al consultar pantallas.
Validación: 83 comprobaciones de base de datos aprobadas, incluidos ausencia de nuevas
entregas, ambigüedad, solapamiento, conservación de asignaciones y propagación por serie.
Aplicada en Supabase y comprobada con el caso existente reportado, sin nuevos movimientos.


## Fase 9 — productividad

- Migración `20261005001200_productivity.sql`, aplicada al proyecto independiente.
  `preview_import` revisa hasta 200 altas de personas o prendas. `apply_import` repite la
  validación, exige la vista previa íntegra y crea el lote en una transacción. Se reutilizan
  save_person/save_garment y sus auditorías. Sin sobrescritura ni detección de identidad
  automática por nombre; las coincidencias se rechazan para revisión manual.
- CSV UTF-8 desde Excel u otra hoja: comas/punto y coma, BOM, campos entrecomillados,
  comillas escapadas y saltos dentro de campos. Tamaño máximo 1 MB. Cabeceras cerradas;
  el servidor también valida contenido, límites, tipos activos, estados y duplicados.
  XLSX no se interpreta: exportar a CSV evita añadir una dependencia de hojas de cálculo.
- `preview_series_copy` deriva la agenda desplazando días de calendario de Madrid.
  Incluye versiones de serie, actuaciones y uniformes. `apply_series_copy` recalcula la
  vista previa bajo el bloqueo de planificación y reutiliza plan_series/plan_event.
  Conserva los títulos, notas y horarios, usa uniformes actuales y omite canceladas.
  Copia únicamente la agenda; participantes y prendas deben prepararse para el nuevo periodo.
- Aplicaciones idempotentes por UUID guardado en planning_requests; misma petición devuelve
  el resultado anterior, distinto contenido/actor con el mismo UUID se rechaza. Solo ADMIN;
  funciones con search_path cerrado, EXECUTE revocado a PUBLIC/anon. No se abre escritura
  directa sobre las tablas. Importaciones coordinadas con ediciones mediante bloqueo de
  tablas y con otros planes mediante el bloqueo existente. Sin movimientos físicos.
- Actividad reciente retirada de la interfaz por petición del usuario. Se conserva audit_log
  y su auditoría interna, sin pantalla ni acceso desde Inicio.
- Inicio diario, búsquedas y agrupaciones de inventario/personas completados en las revisiones
  previas se mantienen. No se incorporan otras modificaciones masivas sin un caso concreto.
- Versión 0.9.0. La fase 10 de QA general y producción requiere nueva autorización.

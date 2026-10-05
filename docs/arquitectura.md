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

## Fases pendientes

5 Actuaciones/uniformes ·
6 Series · 7 Recomendador · 8 Conflictos · 9 Productividad · 10 QA y producción.

Se requiere aprobación expresa entre fases. No comenzar fase 5 sin autorización.

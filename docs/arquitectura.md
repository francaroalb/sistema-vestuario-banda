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

## Modelo previsto (no implementado todavía)

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

## Fases pendientes

2 Inventario · 3 Personas · 4 Cesiones/movimientos/firma · 5 Actuaciones/uniformes ·
6 Series · 7 Recomendador · 8 Conflictos · 9 Productividad · 10 QA y producción.

Se requiere aprobación expresa entre fases. En fase 1 solo existe el acceso y el shell.

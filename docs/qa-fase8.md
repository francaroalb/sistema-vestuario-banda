# Fase 8 — conflictos y operativa avanzada

Fecha: 5 de octubre de 2026. Versión 0.8.0.

## Operativa disponible

- Panel **Conflictos y avisos**, accesible desde Inicio y Actuaciones. Distingue conflictos
  de devoluciones previstas compatibles que todavía deben comprobarse.
- Tarjetas compactas con prenda, talla, destinatario, actuación, periodo, poseedor actual y
  causas. Las series cuentan una incidencia por persona/tipo/bloque, sin duplicar actuaciones.
- Resolución mediante cambio de asignación, devolución física o revisión del estado. Las
  reservas se conservan hasta que el administrador actúa. El panel se recalcula al consultar.
- **Mantiene la prenda** en cesiones activas con devolución prevista: selección parcial,
  vista previa de impacto y confirmación expresa incluso cuando hay reservas afectadas.
- **Cancelar** no escribe nada. Mantener conserva la cesión abierta, la fecha original,
  el estado físico y las reservas. Registra administrador, fecha, prendas e impacto.
- Una devolución posterior sigue requiriendo firma y puede dejar una incidencia por daño o
  lavandería. El formulario de edición también muestra las asignaciones previstas.
- En actuaciones y series, **Ver cesión** permite llegar a la decisión de permanencia.

## Decisiones

La permanencia se registra en la línea de cesión y en una tabla de decisiones con RLS,
además de la auditoría. No es una entrega/devolución y no simula una firma.
La fecha original deja de considerarse garantía de devolución para otras personas.
La prenda propia puede conservarse para la siguiente actuación sin conflicto por posesión.

La confirmación usa bloqueo de planificación, versión de cesión y bloqueo de persona,
cesión y prendas. Si cambian el plan o la cesión desde la vista previa, se pide revisar de
nuevo; si se pierde una respuesta, repetir la misma petición no duplica decisiones.
Las escrituras directas están denegadas. No se pueden inventar devoluciones ni ceder a dos
personas a la vez para quitar un aviso.

Las incidencias son derivadas, sin descartes manuales ni cambios silenciosos del plan.
Se consultan actuaciones no terminadas/canceladas y periodos todavía vigentes. Para cesiones
vencidas sin actuaciones pendientes sigue disponible el filtro de vencidas en Cesiones.
No se añade actualización en tiempo real: entrar o pulsar Actualizar consulta la situación actual.

## Comprobaciones

- 16 pruebas unitarias existentes de acceso, revocación, navegación y respuestas tardías.
- 82 pruebas de PostgreSQL aislado: incluye permanencia parcial, cancelar/vista previa,
  auditoría, reintentos, permisos, manipulación, cambio de planes, devolución posterior,
  daño/lavandería/archivo, sustitución, cancelación, posesión propia, vencimiento y series.
- Compilación de producción correcta: paquete inicial 497,54 kB, sin avisos de presupuesto.
- 54 pruebas de navegador validadas: 24 con respuestas controladas y 30 contra Supabase
  real. La ejecución general pasó 52; se repitieron con éxito las dos pruebas de paginación
  tras añadir una espera explícita a la finalización del login simulado.
- Navegador con Supabase real en escritorio y móvil: cancelar sin cambios, confirmar pese
  al impacto, perder la respuesta y reintentar, resolver todo el bloque sustituyendo la prenda,
  editar estado físico, devolución firmada, restricciones offline y permisos de escritura.
- Carrera real entre mantener y devolver: una operación gana y la otra recibe conflicto
  de versión/estado, preservando la posesión física.
- Respuestas controladas para error recuperable, filtros, 13 incidencias paginadas,
  última página que queda vacía y control de acceso de la nueva ruta.
- Anchuras 320, 390, 768, 1280 y 1440 px comprobadas sin desbordamiento horizontal.
  Capturas locales fase8-mantener y fase8-conflicto, para escritorio y móvil.

Migración 20261005001000_conflicts.sql aplicada exclusivamente al proyecto independiente de
Vestuario. No se despliega, no se modifica Entradas y no se adelanta la fase 9.

Verificación final: migración local/remota idéntica y cero registros temporales QA restantes
en series, bloques, actuaciones, uniformes, personas, prendas, cesiones, auditoría, decisiones
de permanencia y peticiones de planificación.

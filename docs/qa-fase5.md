# Fase 5 — Actuaciones y uniformes

Autorizada por el usuario el 5 de octubre de 2026 después de la revisión visual.
Implementación en el proyecto independiente de Vestuario; sin cambios en Entradas ni despliegue.

## Entregado

- Uniformes con tipos requeridos, edición y archivo. Instantánea de requisitos por actuación.
- Actuaciones con inicio/fin y periodo de prendas, todos en hora de Madrid.
- Participantes existentes y alta rápida de refuerzo con nombre/instrumento.
- Asignación manual por tipo, búsqueda paginada y motivos de indisponibilidad.
- Preparación individual con pendientes, asignadas, en poder, devueltas y avisos básicos.
- Entrega enlazada al plan, revisión/firma, reintento sin duplicados y devolución real desde Cesiones.
- Reservas visibles en inventario y fichas de prendas/personas.
- Cancelación y retirada de participantes sin borrar cesiones ni registrar devoluciones ficticias.
- RLS, RPC transaccionales, versiones, auditoría y migración aditiva `20261005000600_events.sql`,
  aplicada y registrada en Supabase `vbrtkmufrtfuanimmqyp` sin datos de muestra permanentes.

## Verificaciones

- Unitarias: 16 pruebas correctas.
- PostgreSQL aislado: 54 pruebas TAP, incluidos los grupos principales; 13 escenarios nuevos
  verifican autorización, validaciones, instantáneas, idempotencia, alta rápida, adyacencia horaria,
  solapamientos, versiones antiguas, posesión real, firma, cancelación, devoluciones y auditoría.
- Navegador: 22 casos de respuestas controladas y 18 contra Supabase, en Chrome escritorio y
  móvil emulado. Incluyen paginación/búsqueda/recuperación de errores, flujos anteriores y fase 5.
- Prueba real de dos reservas simultáneas: solo una se confirma; la otra devuelve `RESERVATION_OVERLAP`.
- Respuesta perdida después de la entrega: reintentar conserva UUID y un único movimiento firmado.
- Recuperación de prendas quitadas de la selección y confirmación al abandonar una revisión con firma.
- Anchuras 320, 390, 768 y 1280 sin desbordamiento horizontal; revisión visual de capturas locales.
- Build de producción sin advertencias de presupuesto, aproximadamente 497 kB iniciales sin comprimir.

En la primera ejecución real, los recorridos y la concurrencia pasaron, pero `afterAll` agotó el
plazo del llavero de macOS al limpiar. Se recuperaron exclusivamente los UUID con los dos prefijos
exactos de esa ejecución y se limpiaron. Se centralizó la limpieza y se habilitó un ejecutor local
opcional con la contraseña existente de PostgreSQL, TLS y verificación del certificado oficial.
La siguiente ejecución completa contra Supabase terminó con 18/18 y limpieza correcta.
La verificación final confirma cero registros sintéticos en actuaciones, uniformes, personas, prendas,
cesiones, auditoría y solicitudes de planificación. Las seis migraciones constan registradas;
el contenido local de fase 5 coincide exactamente con el registrado.
Las credenciales, el cliente SQL temporal, certificados y capturas permanecen fuera de Git.

Configuración TLS contrastada con [la documentación oficial de Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement).
No se desactivó la verificación TLS ni se cambiaron permisos de la aplicación para ejecutar las pruebas.

## Decisiones y límites

- Periodo previsto separado del horario: incluye recogida y devolución. No reservar solo el rato del concierto.
- Una devolución prevista de otra persona permite planificar con aviso, pero no equivale a disponibilidad física.
- Las entregas anticipadas comprueban también reservas entre ahora y el inicio previsto.
- Cambios posteriores de estado, archivo o posesión se señalan sin cancelar asignaciones automáticamente.
- Editar un uniforme no cambia actuaciones existentes. Para cambiar el uniforme de una actuación,
  retirar antes sus asignaciones. Archivar un uniforme no invalida sus eventos anteriores.
- Cancelar una actuación o retirar a alguien conserva préstamos e histórico. No se cierra ninguna cesión por planificación.
- Las cesiones ordinarias conservan su operativa real y avisan de reservas; no se incorpora aún el motor
  completo de resolución de conflictos de fase 8.
- Sin series, periodos compartidos mantener/dividir, recomendador, exportación ni automatismos de fases posteriores.
- Móvil emulado en Chromium; validación en Safari/iPhone físico y despliegue HTTPS siguen en fase de producción.

Detenerse aquí y esperar aprobación antes de fase 6.


## Corrección: reincorporación de participantes

Una persona retirada conservaba las asignaciones inactivas para su histórico. Si se asignaba esa
prenda a otra persona y se reincorporaba a la primera, se reactivaba también su reserva anterior,
provocando `RESERVATION_OVERLAP` al añadirla.

La migración aditiva `20261005000700_participant_rejoin.sql` reinicia únicamente las asignaciones
al pasar de participación inactiva a activa. La reincorporación queda pendiente de asignar prendas;
las cesiones reales, movimientos y auditoría se conservan. Una persona que ya estaba activa mantiene
sus asignaciones, y asignar realmente la misma prenda a dos participantes sigue bloqueado.
La migración cambia la lógica de la operación, sin modificar filas existentes al aplicarla.

- Regresión reproducida antes de la corrección con el mismo error de solapamiento.
- 55 pruebas de PostgreSQL correctas después del cambio, incluyendo reintentos, historial y posesión real.
- Caso de reincorporación verificado contra Supabase desde la interfaz en escritorio y móvil emulado.
- Los datos de la actuación del usuario se conservan; se eliminan únicamente los fixtures propios de QA.

# Carpetas — fases 7 y 8: actuaciones, voces y recomendaciones

Autorizadas conjuntamente el 13/10/2026. Implementadas; pendientes de validación del usuario.
La fase 9 no se ha iniciado. No se ha hecho push ni publicado la interfaz.

## Uso

Desde una actuación o serie, abrir **Preparar carpetas musicales**. Una actuación de serie
lleva a su preparación conjunta para no duplicar reservas entre días.

1. Abrir **Actuaciones y repertorios** y seleccionar PRO, PMM o ambos por actuación.
2. Desplegar la tarjeta de una persona. En **Voz y participación por actuación**, elegir su
   voz por día, o aplicar una voz inicial a todos sus días. La propuesta usa la última voz
   registrada, nunca una voz deducida del instrumento. Puede dejarse pendiente.
3. Los refuerzos necesitan carpeta por defecto. Los componentes pueden activarla de forma
   explícita. Las necesidades combinan voz, repertorio y participación activa.
4. En una serie se propone un periodo continuo por voz y repertorio. Ante días intermedios
   sin asistencia, elegir **Mantener entre actuaciones** o **Dividir si no asiste**. Esta
   decisión es independiente de los periodos de las prendas.
5. **Ver carpetas recomendadas** muestra ejemplares compatibles; consultar no reserva ni
   entrega. Elegir un ejemplar, revisar los avisos y confirmar **Reservar carpeta**.
6. **Entregar y firmar** abre el flujo de entrega existente. La reserva no implica posesión.
   Si la persona ya tiene una carpeta compatible, puede reutilizarse sin crear otra entrega.

El alta de participantes en actuaciones y series también permite elegir voz y propone la
última conocida. En series existentes, editar asistencia conserva las voces por día salvo
que se marque expresamente aplicar la nueva voz a los días seleccionados.

## Fechas y cambios

Las carpetas usan inicialmente el inicio y fin de cada actuación, no las fechas del vestuario.
**Fechas de carpeta** permite ampliar ese periodo; debe contener la actuación completa.
La zona horaria es Europe/Madrid. Cambiar de voz puede requerir varias carpetas simultáneas.

Los cambios recalculan las necesidades, pero conservan las asignaciones anteriores para revisión.
Un cambio incompatible de voz, repertorio o asistencia aparece en **Asignaciones afectadas por
cambios**. Cambiar fechas, archivar una voz o bloquear una carpeta también señala la preparación.
Una serie vacía conserva la opción de retirar explícitamente sus reservas anteriores.

**Cambiar / quitar asignación** cancela únicamente la reserva aún pendiente. Nunca devuelve
material ni altera una cesión firmada. La devolución física sigue requiriendo su operación y firma.

## Recomendaciones y avisos

- Voz exacta y repertorio requerido, operatividad y disponibilidad durante todo el periodo.
- Preferencia por carpetas accesibles, repertorio completo, ausencia de incidencias y menos tareas.
- Las tareas e incidencias no bloqueantes permiten elegir, tras aceptar sus avisos.
- Las reservas activas solapadas se excluyen. Una carpeta cedida a otra persona puede proponerse
  si su devolución futura está prevista antes del inicio; se indica quién la tiene y las fechas.
- Sin fecha de devolución, con devolución vencida o posterior al inicio, no se ofrece.
- Reutilizar una carpeta propia cuyo retorno previsto es anterior al final muestra un aviso;
  no amplía silenciosamente la cesión. Ese uso planificado impide reservas incompatibles para otros.
- Inicio y actuaciones muestran pendientes, conflictos y avisos. **Carpetas → Avisos de actuaciones**
  reúne las próximas preparaciones que necesitan atención, con acceso directo a cada una.

## Implementación

Migraciones aditivas `20261013000700_music_planning.sql` y
`20261013000800_music_empty_series_release.sql`. Se conserva el motor de Vestuario y las
cesiones especializadas de Carpetas. Tablas nuevas para configuración por actuación,
voz por participación, continuidad por persona/serie, asignaciones y peticiones idempotentes.

Las vistas `music_need_periods` y `music_preparation` calculan periodos y estado actual.
Lecturas con `security_invoker`, tablas con RLS de administrador y escrituras solo mediante RPC.
`plan_music_participant` integra la participación existente y su voz en una transacción.
`music_planning_command` valida versiones, pertenencia, instantánea de necesidad, disponibilidad
bajo bloqueo, avisos y petición/actor. No se hacen reintentos de escritura automáticos.

Los listados de personas, recomendaciones y avisos se paginan de 24 en 24. Las necesidades y
participaciones devueltas corresponden a las personas de esa página. Las asignaciones antiguas
se muestran incluso cuando la persona ya no participa, para que puedan liberarse.

## Validación y prueba manual

Probar una serie con tres actuaciones y un refuerzo que asista a la primera y tercera:

- Configurar repertorio y voz; comprobar la decisión explícita de continuidad.
- Comparar mantener y dividir; modificar solo las fechas de carpeta y verificar el vestuario.
- Cambiar la voz del último día y comprobar dos necesidades distintas.
- Ver recomendaciones, reservar y comprobar que inventario todavía no indica posesión.
- Entregar con firma; cambiar la voz o quitar la asignación y comprobar que la cesión permanece.
- Probar carpeta bloqueada, incidencia no bloqueante, reserva solapada y devolución futura compatible.
- Revisar avisos en Inicio y en la actuación.

Pruebas automatizadas: unitarias, suite de PostgreSQL aislado, interfaz en escritorio/móvil,
recorrido real en Supabase, asignaciones concurrentes y regresión de series. Los datos de QA
usan UUID/prefijos propios; no se añaden obras al repertorio compartido y se limpian al terminar.

Resultados de base: 38 pruebas unitarias y 145 comprobaciones de PostgreSQL aprobadas;
compilación de producción sin advertencias. Interfaz de preparación y operaciones conjuntas:
8 pruebas aprobadas en escritorio/móvil. Recorrido real de planificación musical: 2 aprobadas;
regresión real de series: 4 aprobadas, incluida pérdida de respuesta y concurrencia.
Las migraciones remotas se cotejaron con los archivos locales y conservaron los recuentos
previos de personas, prendas, actuaciones y cesiones. Limpieza musical verificada sin restos.

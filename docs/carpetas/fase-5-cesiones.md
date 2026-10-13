# Carpetas — fase 5: cesiones individuales

Implementada el 13 de octubre de 2026. Pendiente de validación del usuario antes de fase 6.

## Acceso y alcance

- **Cesiones → Carpetas**: reservas pendientes, carpetas en poder de personas, devoluciones
  vencidas, conflictos y todo el historial. Filtros por persona y código, paginación de 24
  registros y conservación de filtros al regresar desde una ficha.
- **Nueva cesión o reserva**: seleccionar persona y carpeta utilizable, elegir entregar ahora
  o reservar para más adelante, fechas de Madrid y observaciones opcionales.
- También se inicia desde **Personas → Ceder o reservar carpeta** y desde la ficha de carpeta.
  Ambas fichas enlazan al historial de carpetas de la persona o del ejemplar.
- Reservar no entrega ni firma. La ficha ofrece **Entregar y firmar** y **Cancelar reserva**.
  Para cambiar el periodo o destinatario se cancela y se crea otra reserva; se conserva la anterior.
- La entrega y devolución reutilizan la firma presencial existente. Se guarda únicamente la
  confirmación; el dibujo se limpia y no se envía ni almacena una imagen.
- **Devolver carpeta** desde la ficha de la carpeta o la cesión: revisión breve y firma, sin
  exigir revisión de obras. Un desplegable permite añadir una incidencia de partitura o exterior.
- El inventario muestra posesión real y próxima reserva, independientemente de la operatividad.
  La ficha incluye devolución prevista y el acceso directo a devolver.

La operación individual de esta fase comprende una carpeta. Una persona puede tener varias
cesiones independientes, con fechas distintas. La entrega/devolución conjunta de varias carpetas
con prendas y una firma común pertenece a fase 6. No se han añadido asignaciones a eventos,
voces por actuación, recomendador ni cambios de periodos de series.

## Disponibilidad

Se comprueba y revalida en PostgreSQL al confirmar, con intervalos `[inicio, fin)`:

- Reservas solapadas de la misma carpeta: conflicto. Un fin coincidente con el siguiente inicio
  no es un solape. Sin fin, la reserva ocupa el periodo indefinidamente hasta su cancelación
  o su conversión en cesión y devolución real.
- Carpeta cedida con devolución prevista anterior o igual al nuevo inicio: reserva permitida
  con aviso de devolución pendiente. No admite otra entrega hasta registrar su devolución real.
- Cesión anterior sin fecha compatible, o con devolución vencida: conflicto para nuevas reservas.
- Entrega directa con fecha que se solapa con una reserva: conflicto.
- Préstamo directo sin fecha y con reservas posteriores: exige confirmar expresamente el aviso;
  el listado conserva el conflicto hasta devolver o cancelar las reservas afectadas.
- Llegar a la fecha prevista no devuelve automáticamente el material. Se identifica como vencido.
- Incidencias no bloqueantes y tareas de repertorio generan avisos, no falsos conflictos de uso.
  La revisión muestra al poseedor actual, su devolución prevista y las reservas pendientes.
- Un bloqueo o archivado impide nuevas entregas/reservas. La devolución sigue permitida si la
  carpeta está bloqueada. No se puede archivar una carpeta o persona con carpetas en posesión.

Las reservas conservadas muestran conflictos si cambia después el bloqueo, la persona se archiva
u otra cesión queda sin devolución compatible. La resolución centralizada y recomendaciones
corresponden a fases posteriores; aquí se gestionan desde el listado y las fichas de cesiones.

## Incidencias en devolución

Opcionales, una por operación individual; otras pueden registrarse después desde Mantenimiento.

- Partitura: buscar entre las copias presentes, incluidas las pendientes de retirar; marcar
  falta, daño, sustitución o reparación. El daño conserva la presencia; la falta registra ausencia.
- Carpeta exterior: descripción obligatoria y bloqueo de uso desmarcado por defecto.
- La incidencia y la devolución se confirman en la misma transacción. Si falla la incidencia,
  se revierte también la devolución. Una incidencia equivalente ya abierta se amplía desde
  Mantenimiento; puede devolverse sin crear otra incidencia.
- Devolver no resuelve incidencias previas ni confirma incorporaciones o retiradas pendientes.

## Datos, seguridad y auditoría

Migraciones aditivas aplicadas al Supabase independiente de Vestuario:

- `20261013000400_folder_loans.sql`: `folder_reservations`, `folder_loans`,
  `folder_loan_items`, `folder_loan_movements` y registro común `material_operations`.
  Fechas de entrega, devolución y vencimiento por línea; índice único de posesión activa.
  Vista `folder_loan_overview` y extensión del inventario con poseedor y próxima reserva.
- `20261013000500_folder_loan_identity.sql`: protección de identidad entre reservas y cesiones;
  compartir UUID solo es válido al cumplir explícitamente esa reserva. No se puede usar una
  entrega directa con el ID de otra reserva para excluirla de la comprobación de disponibilidad.

RLS para administradores activos, solo lectura directa; escrituras mediante RPC de revisión
`preview_folder_loan` y confirmación `apply_folder_loan`. Campos cerrados, actor y fecha del
servidor, control de versión, idempotencia por petición/actor/contenido y bloqueo transaccional
compartido con las operaciones musicales. El bloqueo de la fila de persona coordina la entrega
con el archivado existente. No se alteran movimientos ni cesiones de prendas.

Las operaciones generan auditoría propia de carpeta y movimientos físicos asociados a la
operación y al administrador. Las reservas/cancelaciones no inventan movimientos físicos.
`material_operations` prepara el enlace común para fase 6, sin implementar aún operaciones mixtas.

El historial previo de migraciones fue cotejado antes de aplicar fase 5. Se verificó que los
recuentos de personas, prendas, cesiones de vestuario y actuaciones se conservaron.
No se ha hecho push ni desplegado la interfaz en Cloudflare.

## Comprobación manual

1. Con `npm start`, abrir http://localhost:4201/cesiones/carpetas.
2. Crear una reserva futura. Comprobar que la carpeta sigue en la Banda y aparece como
   pendiente de entregar. Intentar otro periodo solapado y comprobar el conflicto.
3. Abrir la reserva → Entregar y firmar. Revisar y dibujar la firma. Antes de firmar no se
   puede confirmar; después, el inventario debe mostrar a la persona como poseedora.
4. Crear una reserva posterior a una devolución prevista compatible: debe avisar, no bloquear
   la reserva. Intentar entregar mientras siga cedida: debe rechazarlo.
5. Devolver con una incidencia de partitura dañada: desaparece la posesión, la copia sigue
   presente y queda un aviso de mantenimiento. Repetir con un faltante para comprobar la ausencia.
6. Devolver con un desperfecto exterior bloqueante: la carpeta vuelve a la Banda, pero no es
   utilizable hasta resolver el bloqueo. Sin marcarlo debe seguir siendo utilizable.
7. Consultar el historial por persona/carpeta y cancelar una reserva. Probar errores de conexión
   y cambios en otra pestaña: el borrador se conserva y se exige revisar de nuevo si cambia la versión.

## Validación

- Compilación de producción sin advertencias y 36 pruebas unitarias aprobadas.
- Suite completa de base de datos: 117 comprobaciones aprobadas, incluidas las 10 específicas
  de fase 5 y la protección de identidad entre reservas y cesiones.
- Pruebas de solapes y límites, devolución compatible, firma, ausencia de vencimiento automático,
  posesión única, permisos, reintentos, versiones obsoletas, archivos protegidos e incidencias.
- Fallo provocado al registrar la incidencia después de iniciar la devolución: revierte toda
  la transacción. La repetición posterior no duplica devolución ni movimiento.
- Navegador real en escritorio y móvil: reserva → entrega firmada → respuesta perdida →
  reintento idempotente → devolución con daño → historial; dos entregas enviadas concurrentemente
  a Supabase y solo una obtiene la carpeta.
- Interfaz: funcionamiento sin conexión, borrador tras conflicto, firma que se debe renovar al
  revisar, filtros/paginación y navegación Vestuario/Carpetas.
- Regresión real de vestuario: entrega, devolución parcial, cambio, cierre, concurrencia y permisos.
  La pasada conjunta ha aprobado 16 comprobaciones de navegador. El recorrido real y la
  concurrencia se repitieron con las dos migraciones finales aplicadas.
- Verificación remota final: ambas migraciones coinciden con los archivos y no quedan
  personas, voces, obras, cesiones, reservas, incidencias ni operaciones sintéticas de fase 5.

Los datos reales de la Banda no se usan como fixtures. Las pruebas musicales crean UUID y
prefijos sintéticos, omiten el alta de repertorio si ya hay carpetas ajenas y limpian únicamente
sus propios datos. La concurrencia comprobada cubre dos entregas simultáneas; no es una prueba
de carga ni una validación completa de futuros flujos mixtos.

La siguiente fase es **6 — Integración con vestuario**. Requiere autorización expresa.

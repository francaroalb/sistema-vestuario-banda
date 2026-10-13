# Carpetas — fase 2: navegación e inventario

Implementada y aprobada el 13 de octubre de 2026.

## Qué incluye

- Selector **Vestuario / Carpetas** en Inventario, sin cambiar las cinco secciones principales.
- Rutas específicas `/inventario/carpetas`, `/nueva`, `/:id` y `/:id/editar`, antes de las rutas de prendas.
- Inventario compacto, con códigos destacados, operatividad y contadores separados de presencia,
  faltantes, cambios de repertorio e incidencias. Páginas de 24 carpetas.
- Búsqueda por código y filtros combinables de repertorio, voz, operatividad y archivo.
  Los filtros se conservan en la dirección y al volver de una ficha o formulario.
- Selector de voz con búsqueda y paginación; alta de voces desde el formulario de carpeta.
- Alta con código físico, repertorio, voz, notas y bloqueo manual. Se comprueba la etiqueta antes
  de guardar y PostgreSQL vuelve a validar identidad, duplicados y permisos.
- Edición de notas y bloqueo manual. Código, repertorio y voz permanecen estables desde el alta.
- Ficha con operatividad efectiva, contenido, conservación e historial propio con fechas y responsable.
- Archivado y reactivación con confirmación, preservando contenido, bloqueos, identidad e historial.

No se presentan estados de posesión o disponibilidad: las cesiones de carpetas corresponden a
otra fase. No se añaden interfaces para obras, mantenimiento, entregas, firmas, planificación
ni recomendaciones. El resumen de contenido es de solo lectura.

## Protección de las operaciones

Las escrituras reutilizan la misma petición al reintentar los mismos datos, deshabilitan acciones
sin conexión y conservan el borrador ante un fallo. Las versiones evitan sobrescribir cambios
simultáneos. La recarga tras un conflicto pide confirmación si descarta un borrador.
Salir de un formulario modificado avisa, incluidas las voces aún sin guardar. Durante una escritura
se impide navegar. El archivado no borra registros ni libera su código.

## Supabase y publicación

Se aplicaron las migraciones de fase 1 `20261013000100` y `20261013000200` al proyecto independiente
`vbrtkmufrtfuanimmqyp`, en una transacción y registrándolas en el historial de migraciones.
Se verificó que los recuentos de prendas, personas, cesiones y actuaciones se conservaron.
Las pruebas reales crean voces/carpetas identificadas por UUID y códigos únicos y eliminan
exclusivamente sus propios registros al terminar.

No se ha hecho push ni desplegado la interfaz en Cloudflare. El nuevo inventario se puede probar
localmente con `npm start`, en http://localhost:4201/inventario/carpetas, usando el acceso habitual.

## Comprobación manual

1. Abrir Inventario → Carpetas → Nueva carpeta.
2. Crear una voz, por ejemplo código CLA1, nombre Clarinete primero e instrumento Clarinete.
3. Crear PRO-CLA1-001, repertorio PRO y esa voz. Usar otra etiqueta si ya existe.
4. Editar sus notas y marcarla como no utilizable. Comprobar su estado en el listado y la ficha.
5. Buscar por parte del código; combinar repertorio, voz y estado. Volver de la ficha conserva filtros.
6. Archivar, consultar Archivadas y reactivar. El historial conserva ambos cambios.
7. Intentar repetir el código, incluso archivado: se rechaza sin perder el formulario.
8. Abrir la misma carpeta en dos pestañas. Guardar un cambio en una y después en la otra:
   aparece conflicto y se conserva el borrador hasta recargar expresamente.

Las voces nuevas son reales. Archivar una carpeta de prueba permite retirarla de la lista activa
sin eliminar su historial. La gestión completa del repertorio llegará en fase 3.

## Validación

- Compilación de producción sin advertencias.
- 36 pruebas unitarias y 106 comprobaciones de base de datos aprobadas.
- Diez pruebas de navegador aprobadas en escritorio y móvil: seis de Carpetas y cuatro
  de regresión del inventario de prendas, incluidas operaciones y permisos con Supabase real.
- Verificados duplicados incluso archivados, conflictos sin pérdida de borrador, persistencia,
  alta de voz, bloqueo, archivo/reactivación, historial, filtros, paginación y las cinco secciones.
- Respuesta perdida simulada: el segundo envío conserva exactamente petición, ID, versión y datos.
  Modo sin conexión: el formulario conserva el borrador y deshabilita Guardar.
- Capturas de ficha, alta y listado y comprobación de ausencia de desbordamiento horizontal.
- Verificación remota final: las dos migraciones coinciden con los archivos y no quedan voces
  ni carpetas sintéticas de esta fase.

## Siguiente fase

Fase 3: repertorio y presencia de partituras. Requiere aprobación expresa.

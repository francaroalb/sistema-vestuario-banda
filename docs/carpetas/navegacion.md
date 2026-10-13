# Navegación propia de Carpetas

Refinamiento solicitado el 13/10/2026, independiente de la fase 6.

- El menú general incluye **Carpetas**, con entrada en `/carpetas`.
- Dentro del módulo, el menú lateral y la barra móvil muestran **Resumen, Inventario,
  Repertorio, Mantenimiento y Cesiones**. En móvil, Mantenimiento se abrevia como Avisos.
- Resumen reúne cuatro accesos diferenciados y atajos para añadir una carpeta, una obra
  o una cesión/reserva. No requiere consultas adicionales a Supabase.
- **Menú general** vuelve a Inicio. Las pestañas duplicadas Vestuario/Carpetas desaparecen
  del inventario, repertorio y cesiones. En móvil, Actuaciones se abrevia como Agenda.
- Se conservan las URL existentes `/inventario/carpetas/...` y `/cesiones/carpetas/...`
  para mantener enlaces guardados, parámetros `volver`, filtros y rutas desde Personas.
  La navegación identifica estos destinos como Carpetas, sin activar Inventario o Cesiones
  de Vestuario. Las incidencias pertenecen a Mantenimiento; el contenido de una carpeta
  pertenece a Inventario.
- Se mantienen los servicios especializados, permisos y protección de formularios con cambios
  pendientes. No cambia el modelo de datos ni se requieren migraciones.

Esta decisión posterior sustituye la organización inicial en cinco secciones generales.

Validación: compilación de producción sin advertencias, 38 pruebas unitarias y 54 pruebas
E2E con respuestas simuladas en Chrome escritorio/móvil. Dos pruebas de acceso real quedaron
excluidas al no activar REAL_AUTH. Se comprueban filtros, borradores, menú general, acceso
tras login, selección única de sección y botones de al menos 44 px a 320 px de ancho.

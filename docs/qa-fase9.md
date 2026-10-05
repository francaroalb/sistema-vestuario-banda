# Fase 9 — Productividad

Implementada el 5 de octubre de 2026, versión 0.9.0. Pendiente de validación del usuario.

## Alcance y decisiones

- Altas por lotes de personas y prendas mediante CSV UTF-8, con plantilla descargable,
  revisión previa de todas las columnas y errores por fila. Hasta 200 filas y 1 MB.
  Excel debe exportar a CSV; no se interpreta XLSX.
- Importación completa en una transacción, sin sobrescribir fichas. Códigos y nombres
  coincidentes se rechazan; los homónimos se gestionan manualmente.
- Duplicación de la agenda de una serie: nombre y fecha inicial nuevos, conservando horarios
  locales de Madrid, distancias entre actuaciones e intervalos previstos. Revisión antes de
  confirmar. Usa uniformes actuales y omite actuaciones canceladas. No copia participantes,
  asignaciones, cesiones ni firmas.
- Actividad reciente retirada posteriormente por petición del usuario; la auditoría interna
  se conserva.
- Se mantienen el inicio operativo, los filtros y las agrupaciones incorporados anteriormente.
  No se añaden otras acciones masivas sin una necesidad concreta.

## Validación ejecutada

- 30 pruebas unitarias aprobadas, incluidas lectura CSV y rutas seguras tras iniciar sesión.
- 89 comprobaciones de base de datos aprobadas en PGlite con todas las migraciones.
  Cubren atomicidad, duplicados, permisos, auditoría, vistas previas alteradas u obsoletas,
  reintentos idempotentes y copia sin participantes ni movimientos físicos.
- 8 pruebas de navegador aprobadas: seis con respuestas controladas y dos de integración
  con Supabase real, distribuidas entre escritorio y móvil emulado. Incluyen revisión CSV,
  bloqueo ante errores, reintento tras error de red con la misma petición, copia de agenda,
  cambios de formulario que invalidan la revisión y consulta de actividad.
- Las dos pruebas CSV se repitieron después del ajuste visual final. Verifican que la página
  no desborda horizontalmente; la tabla conserva columnas legibles con desplazamiento propio.
- Compilación de producción aprobada sin advertencias.
- Migración `20261005001200_productivity.sql` aplicada y cotejada con Supabase de Vestuario.
  Comprobada la limpieza de los registros QA creados por estas pruebas, conservando los
  datos del usuario y el inventario e historial de demostración.

## Interfaz y límites

Paneles compactos, colores y tipografía existentes. Selector de archivo con control táctil,
revisión paginada de 20 filas y tabla desplazable en móvil. La copia muestra toda la agenda
(hasta 60 actuaciones); los cambios posteriores a la revisión requieren volver a revisarla.
Las operaciones requieren conexión. No se producen entregas físicas mediante importación
ni copia; las entregas reales conservan su flujo de firma.

Las pruebas móviles usan emulación Chromium. No equivalen a validación en dispositivos
físicos o Safari. La revisión general de QA, PWA y publicación de producción pertenece a
la fase 10, todavía no iniciada.

## Ajuste posterior solicitado

Retirados el enlace del Inicio, la ruta, el componente y la consulta de Actividad reciente,
así como sus pruebas de interfaz. Los resultados anteriores corresponden al cierre inicial
de fase 9. Se conservan los registros y mecanismos internos de auditoría.

Validación del ajuste: 30 pruebas unitarias aprobadas y compilación de producción correcta.

# Validación de fase 3 — 5 de octubre de 2026

## Alcance

Gestión de personas: listado, búsqueda por nombre, filtros de tipo/instrumento/archivo,
alta, edición, detalle, archivo y reactivación. Tipos BANDA y REFUERZO editables sobre la
misma identidad. Instrumento, teléfono y observaciones opcionales. Accesos en Inicio.

El histórico base se prepara con UUID estable, auditoría transaccional y referencias protegidas.
No hay aún cesiones, movimientos, tallas inferidas ni recomendador. No se han importado personas.

## Pruebas locales

- `npm test`: 14 pruebas aprobadas. Incluye mensajes y rutas seguras de Personas y regresión
  de autenticación/inventario.
- `npm run test:db`: 26 escenarios aprobados dentro de tres pruebas padre (29 resultados TAP).
  Incluye 10 escenarios de Personas: acceso denegado, alta normalizada, autor/timestamps,
  reintentos idempotentes, homónimos, límites, cambio de tipo con historial, conflicto de versión,
  campos opcionales vacíos, operaciones sin cambios, archivo/reactivación y revocación.
- La prueba de migración parte de una prenda con auditoría previa: comprueba que se conserva
  el historial al ampliar la tabla y que ambas entidades mantienen claves foráneas reales.
  Los escenarios de inventario se ejecutan también con la migración de Personas aplicada.
- `npm run build`: correcto, sin advertencias de presupuesto. Carga inicial 489,59 kB;
  transferencia estimada 122,61 kB. Las tres pantallas de Personas se cargan bajo demanda.

## Cobertura de navegador

`REAL_AUTH=1 npm run test:e2e`: **28 pruebas aprobadas** (2,5 minutos).
Se han revisado las capturas de listado y ficha en escritorio y móvil.

Playwright con Chrome, escritorio y emulación iPhone 13 con Chromium:

- Validación del nombre obligatorio y persistencia tras recargar.
- Alta de refuerzo con instrumento, teléfono y notas; edición a músico de la Banda con mismo UUID.
- Búsqueda, filtros combinados, retorno desde ficha conservando filtros y estados vacíos.
- Paginación de 25 personas y recuperación cuando desaparece la última página al archivar.
- Errores de consulta, reintento y búsqueda de caracteres `%`/`_` como texto literal.
- Detalle de persona inexistente y nombres/campos de longitud máxima sin desbordamiento horizontal.
- Archivo cancelado/confirmado, bloqueo de edición archivada y reactivación de la misma ficha.
- Edición simultánea rechazada con HTTP 409, conservación del borrador y recarga confirmada.
- Sin conexión: guardar deshabilitado y borrador conservado. Cancelar puede mantener o descartar.
- Dos altas simultáneas con el mismo UUID generan una ficha y una entrada de auditoría.
- Homónimos permitidos con identidades distintas. Dos ediciones simultáneas: solo una aceptada.
- Permisos reales de Supabase: sin escrituras directas ni borrados desde navegador;
  acceso anónimo denegado. Auditoría con autor y secuencia de operaciones comprobados.
- Regresión de inventario, login, persistencia, logout y caché PWA sin datos privados.

Los escenarios reales crean registros sintéticos por UUID y prefijo y eliminan exclusivamente
esos registros al finalizar. Comprobación remota final: cero personas, prendas y entradas de auditoría
sintéticas pendientes. Migración `20261005000400_people.sql` aplicada y registrada en Vestuario.
Las credenciales y capturas están en `.local/`, excluida de Git.

## Límites

La emulación móvil no equivale a una prueba en Safari/iPhone o Android físicos. Esas pruebas
y la instalación desde HTTPS quedan para la fase de QA/producción. No hay despliegue público.
Los cambios manuales desde la aplicación sí son reales; retirar fichas mediante archivado.

Ver [pasos manuales](../README.md#probar-la-fase-3). Esperar aprobación antes de fase 4.

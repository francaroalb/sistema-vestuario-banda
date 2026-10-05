# Validación de fase 2 — 5 de octubre de 2026

## Alcance entregado

Inventario individual, tipos iniciales, tres estados físicos, detalle, alta, edición, búsqueda,
filtros, paginación, archivo/reactivación y auditoría mínima. Supabase independiente real.
Inicio operativo y nueva identidad visible «Gestión de trajes», con logo y navegación burdeos.
Personas, cesiones, actuaciones, series y recomendador no se han implementado.

## Resultados

- `npm test`: 11 pruebas unitarias aprobadas (autorización, sesión, retorno seguro, errores,
  escape literal del buscador y fechas Europe/Madrid).
- `npm run test:db`: 16 escenarios aprobados, agrupados en dos pruebas padre (18 resultados TAP).
  PostgreSQL aislado con PGlite y las tres migraciones. Comprueba normalización, duplicados,
  campos inválidos, reintento de alta, auditoría con autor y snapshots, versión optimista,
  archivo/reactivación, estados, revocación y prohibición de escritura directa.
- `npm run build`: compilación de producción correcta, sin avisos de presupuesto. Carga inicial
  488,97 kB sin comprimir; 122,54 kB de transferencia estimada. Pantallas de inventario diferidas.
- `REAL_AUTH=1 npm run test:e2e`: 18 pruebas aprobadas, escritorio y móvil emulado.
  Login/persistencia/logout, PWA, autorización, validación de formularios, paginación de 25 registros,
  error y reintento, búsqueda literal, alta/edición real, filtros combinados, conservar filtros al volver,
  archivo (cancelar y confirmar), reactivación, código duplicado, conflicto concurrente con borrador,
  desconexión durante edición y auditoría real. Dos RPC simultáneas: una edición aceptada y otra
  rechazada con HTTP 409. Rechazo remoto de escrituras directas y usuarios anónimos.
- Tras el último ajuste responsive, prueba enfocada `npm run test:e2e -- --grep 'códigos y tallas largos'`:
  2 pruebas adicionales aprobadas con código de 60 caracteres y talla de 20, a 320/390/768/1280 px.
  La suite completa contiene ahora 20 pruebas de navegador.
- Capturas revisadas de inicio y fichas; logo completo, colores, navegación y contraste.
  Evidencia local en `.local/screenshots/`, excluida de Git.
- Migraciones 00100, 00200 y 00300 aplicadas y registradas en el proyecto de Vestuario.
- Limpieza comprobada: cero prendas sintéticas y cero entradas de su auditoría tras las pruebas.
  No se han cargado prendas de muestra permanentes ni modificado Entradas.

## Corrección detectada durante QA

La prueba real de concurrencia detectó que la respuesta inicial `40001` podía quedarse esperando.
Se corrigió mediante una migración aditiva a `PT409` (conflicto HTTP 409), manteniendo el bloqueo
por fila y la comprobación de versión. La interfaz conserva los cambios pendientes y permite
recargar la ficha con confirmación. La prueba real posterior pasó en ambos tamaños de pantalla.

Supabase documenta el [reintento de errores de serialización en PostgREST](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
Este código de serialización no debe utilizarse para conflictos de negocio permanentes.

## Límites de esta validación

Chrome de escritorio y emulación móvil de iPhone 13 con Chromium; no es una prueba en Safari
ni en dispositivos físicos. Instalación PWA real en iPhone/Android y dominio HTTPS quedan para
la fase de QA/producción. No hay despliegue público. Las comprobaciones remotas usan prendas
sintéticas temporales; los datos que se introduzcan manualmente sí se conservarán.

Consulta los pasos manuales de inventario en [README](../README.md#probar-la-fase-2).
Esperar aprobación antes de comenzar fase 3.

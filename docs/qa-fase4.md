# Validación de fase 4 — 5 de octubre de 2026

## Alcance

Cesiones de varias prendas, devolución prevista opcional, devoluciones parciales, cambio de
una prenda dentro de la misma cesión y cierre al devolver la última. Movimientos con persona,
prendas, estado de devolución, administrador, fecha/hora del servidor y confirmación de firma.
Histórico desde Personas e Inventario. Situación física actual visible en prendas y recuentos.

La firma solo vive en memoria en el canvas. No se transmite ni almacena imagen, trazos o base64.
No se implementan actuaciones, reservas, series ni recomendador en esta fase.

## Pruebas locales

- `npm test`: 16 pruebas aprobadas.
- `npm run test:db`: 36 escenarios aprobados dentro de cuatro pruebas padre (40 resultados TAP).
  Diez escenarios nuevos comprueban permisos, firma obligatoria, validación de selecciones,
  fecha de Madrid y cambios horarios, entrega múltiple, reintento idempotente, devolución parcial,
  cambio atómico, cierre, instantáneas históricas y revocación de administrador.
- Regresión de las migraciones anteriores con Cesiones aplicada; se conservan auditorías y
  referencias de prendas/personas. No se modifica una migración anterior ya aplicada.
- `npm run build`: compilación correcta sin advertencias de presupuesto. Carga inicial
  492,34 kB y transferencia estimada 123,24 kB; pantallas de Cesiones bajo demanda.

## Navegador y Supabase real

`REAL_AUTH=1 npm run test:e2e`: **34 pruebas aprobadas** (3,8 minutos).
Tras los últimos ajustes de orden del historial y mensajes, recompilación correcta y
`REAL_AUTH=1 npm run test:e2e -- --grep 'cesiones'`: **6 pruebas aprobadas** (1,1 minutos).

Playwright con Chrome de escritorio y emulación iPhone 13 en Chromium:

- Entrega de dos prendas, resumen y firma con ratón o eventos táctiles reales del navegador.
- Firma vacía o simple toque no habilitan Confirmar. Limpiar y volver a la selección exigen
  dibujar otra firma. Redimensionar o capturar la pantalla conserva el dibujo en memoria.
- Desconexión bloquea la confirmación y conserva el formulario abierto.
- Respuesta perdida después de confirmar en el servidor: el reintento conserva el UUID y
  registra exactamente un movimiento.
- Inventario muestra quién tiene la prenda e impide archivarla mientras está cedida.
- Devolución parcial a lavandería mantiene la cesión activa. Cambio devuelve una prenda dañada
  y entrega otra del mismo tipo sin cerrar la cesión. Última devolución la finaliza.
- Comprobación remota de secuencia de movimientos, actor, confirmación y parámetros enviados:
  no se transmite la imagen ni las coordenadas de la firma.
- Dos entregas simultáneas de una prenda: solo una aceptada. Dos devoluciones con la misma
  versión: solo una aceptada. Sin firma, sin autorización o con escritura directa: rechazadas.
- Histórico de persona enlazado al listado; filtros de activas, vencidas, finalizadas y todas,
  paginación, búsqueda, recuperación de errores y dirección de cesión inválida.
- Revisión de capturas y de desbordamiento horizontal en anchuras 320, 390, 768 y 1280 píxeles.
- Regresión de login, sesión, cierre de sesión, PWA, inventario y personas.

Los escenarios reales crean registros temporales identificados por UUID y prefijo. La limpieza
elimina exclusivamente sus propios registros, incluidos movimientos y auditoría. La migración
`20261005000500_loans.sql` está aplicada y registrada en el Supabase independiente de Vestuario.
Comprobación remota final: cero personas, prendas, cesiones o entradas de auditoría sintéticas pendientes.

## Decisiones y límites

La devolución prevista es opcional y se interpreta en Europe/Madrid. Se rechazan horas
inexistentes o repetidas del cambio horario. Cambiar prendas exige mismo tipo; el estado físico
y la posesión siguen separados. Las prendas cedidas no aparecen como disponibles para entregar.

La emulación móvil no sustituye pruebas en Safari/iPhone o Android físicos. La instalación desde
una URL HTTPS y el despliegue público siguen pendientes de la fase de QA/producción.

Ver [pasos manuales](../README.md#probar-la-fase-4). Esperar aprobación antes de fase 5.

# Carpetas — fase 4: incidencias y mantenimiento

Implementada y aprobada el 13 de octubre de 2026.

## Alcance y acceso

- Inventario → Carpetas → **Mantenimiento**: tareas de repertorio y conservación con
  contadores separados, páginas de 24 registros y filtros por carpeta, obra, tipo,
  repertorio, categoría, estado y operatividad actual. Los filtros se conservan en la URL.
- Los filtros están plegados al entrar sin filtros generales; se despliegan para editar una
  selección existente. Tarjetas compactas con código, obra, aviso y acción en paralelo.
- Ficha de carpeta → **Registrar desperfecto**: elásticos, cubierta, anillas, sustitución del
  exterior u otro desperfecto, descripción obligatoria y bloqueo de uso explícito.
- Ficha → **Ver partituras** → **Registrar deterioro**: daño, sustitución o reparación de
  una copia que permanece dentro. También se puede registrar una ausencia real.
- **Ver incidencias** desde una partitura y **Incidencias e historial** desde la carpeta
  abren el centro acotado a ese material. Se puede editar la observación, revisar el bloqueo
  de una incidencia física, resolver y consultar las incidencias resueltas.
- Las incorporaciones/retiradas tienen acceso a **Gestionar por lotes**, que reutiliza la
  selección, revisión y confirmación atómica de fase 3 con auditoría individual por carpeta.
  Las reparaciones y resoluciones se confirman individualmente, con su resultado físico.

## Reglas

- Daño y ausencia son independientes. Un daño no cambia la presencia.
- Una incidencia exterior nace sin bloqueo; el administrador debe marcar expresamente
  «Impide utilizar la carpeta». Los avisos de conservación no bloquean por defecto.
- Resolver una incidencia no elimina otras incidencias ni el bloqueo manual.
- Resolver un faltante exige recuperar la copia, o confirmar que queda ausente si la obra
  está retirada. No existe la opción de cerrar un faltante activo sin aclarar su presencia.
- Recuperar o sustituir una copia confirma su introducción y registra un movimiento físico.
  Reparar/revisar permite cerrar la incidencia sin modificar la presencia actual.
- No se duplican incidencias abiertas equivalentes. Se conservan fechas, responsables,
  observaciones y resolución. Una ausencia aparece una sola vez en mantenimiento.
- Las carpetas archivadas no admiten nuevas incidencias; las ya existentes pueden resolverse.
- «Operatividad» en el historial refleja el estado actual de la carpeta, no su estado histórico.

Los formularios conservan borradores ante errores, impiden guardar sin conexión y protegen
la salida con cambios pendientes. Los reintentos idénticos conservan su UUID. Ante conflicto
se exige cargar y revisar la versión actual; descartar un borrador requiere confirmación.

## Datos y permisos

Nueva migración aditiva `20261013000300_music_maintenance.sql`, aplicada al Supabase
independiente de Vestuario. Añade únicamente una vista de lectura `music_maintenance_index`
con tareas pendientes e incidencias resueltas, metadatos y responsables. `security_invoker`
mantiene las políticas RLS existentes; solo los administradores activos pueden consultar datos.
No modifica las migraciones ya aplicadas ni permite escrituras directas.

Las escrituras reutilizan las RPC de fase 1, con control de versión, idempotencia y auditoría.
Los recuentos de prendas, personas, cesiones y actuaciones permanecen iguales tras migrar.
No se ha hecho push ni publicado la interfaz en Cloudflare.

## Cómo probar

1. Iniciar `npm start` y abrir http://localhost:4201/inventario/carpetas con el acceso habitual.
2. Crear una obra y después una carpeta de su repertorio, o usar una carpeta con copias presentes.
3. En sus partituras, registrar un daño. Comprobar que la copia sigue presente y la carpeta
   utilizable, y que aparece el aviso de conservación.
4. Revisar la incidencia, ampliar las observaciones y guardar. Resolverla confirmando la
   sustitución física; consultar el movimiento en el historial de contenido y la incidencia resuelta.
5. Registrar un faltante y recuperarlo desde mantenimiento. La copia vuelve a estar presente.
6. Registrar un desperfecto exterior sin marcar bloqueo: conserva su operatividad. Registrar
   dos desperfectos bloqueantes; resolver uno y comprobar que el otro sigue impidiendo el uso.
7. Consultar el centro, desplegar filtros y alternar pendientes/resueltas. Volver de una incidencia
   conserva la selección. Desde una incorporación/retirada acceder a su operación por lotes.

## Validación

- Compilación de producción sin advertencias; 36 pruebas unitarias aprobadas.
- 18 comprobaciones de base de datos: presencia/daño, duplicados, resolución, bloqueos
  múltiples/manuales, historial, lotes atómicos, idempotencia y acceso/RLS. La prueba nueva
  verifica categorías, ausencia sin duplicar, responsables e incidencias resueltas en el índice.
- Flujo real contra Supabase probado en escritorio y móvil, con datos sintéticos propios y
  limpieza posterior: daño presente, edición de nota, sustitución, faltante/recuperación,
  desperfecto no bloqueante, bloqueos independientes y consulta del historial.
- Pérdida real de respuesta tras una escritura confirmada: el reintento mantiene la misma
  petición y no duplica la incidencia.
- 18 pruebas de navegador aprobadas entre flujo real, interfaz y regresiones, en escritorio y móvil.
- Pruebas de interfaz para borradores sin conexión, conflicto de versión, recarga cancelable,
  filtros conservados, contadores completos y paginación fuera de rango; regresión de las
  interfaces de carpetas y repertorio en escritorio y móvil.

Las pruebas reales se omiten si hay carpetas ajenas a la prueba, para no crear obras temporales
que afecten a un repertorio compartido. No sustituyen una prueba de carga/concurrencia con
múltiples conexiones. No se añaden cesiones de carpetas, firmas, planificación ni recomendador:
corresponden a fases posteriores. La fase 5 fue autorizada después; ver [su guía](fase-5-cesiones.md).

# Carpetas — fase 3: repertorio y presencia

Implementada y aprobada el 13 de octubre de 2026.

## Alcance

- Acceso **Repertorio PRO / PMM** dentro de Inventario → Carpetas, manteniendo las cinco
  secciones principales. Catálogo con títulos, autores, repertorios, obras activas/retiradas,
  búsqueda y páginas de 24 registros. El regreso desde una ficha conserva filtros.
- Alta y edición de obras. El repertorio identifica la obra y permanece estable desde su alta.
  Corregir título o autor conserva su estado activo y no genera tareas físicas nuevas.
- Retirada y reactivación con confirmación y control de versión. Retirar del catálogo no
  confirma la retirada física. Reactivar conserva el último hecho físico de cada copia.
- Ficha de obra con carpetas afectadas por estado, código físico y voz. Las archivadas se
  identifican y no pueden seleccionarse para operaciones físicas.
- Incorporación y retirada desde una obra: selección de una o varias carpetas de la página
  actual, revisión explícita de sus códigos y confirmación transaccional. Cambiar página o
  filtro vacía la selección. Los lotes de esta pantalla abarcan hasta 24 carpetas.
- **Ver partituras** desde la ficha de cada carpeta. Lista y filtros por presencia, confirmación
  individual de incorporación/retirada y registro de faltantes con nota opcional.
- Historial del catálogo (incluye título/autor guardados, responsable y fecha) e historial
  físico por carpeta (obra, movimiento, nota, responsable y fecha), desplegables y paginados.

## Decisiones de presencia

La base implementada en fase 1 ya registra una revisión lógica al crear cada carpeta. Las obras
activas en ese momento se presumen presentes, sin generar una fila de presencia por cada obra.
La interfaz identifica esta presunción administrativa; no la presenta como revisión física.
Las obras nuevas quedan pendientes de incorporar y exigen una confirmación física explícita.

Presencia y conservación permanecen separadas. Registrar un faltante marca la ausencia y crea
su incidencia y movimiento en una sola transacción, sin bloquear automáticamente la carpeta.
No se usa este flujo para copias dañadas que siguen físicamente presentes.

Las obras retiradas físicamente ausentes se muestran como **Retirada y ausente**. Si una copia
consta faltante y su obra vuelve al repertorio, sigue faltante. Si se confirmó su retirada,
al reactivar la obra queda pendiente de incorporar. No se reinicializa el contenido de carpetas
existentes al editar, retirar, reactivar o archivar.

La gestión y resolución de incidencias de conservación, incluidos recuperación/sustitución,
reparación y centro de mantenimiento, corresponden a fase 4. No se añaden cesiones, firmas,
planificación, asignaciones de voz por actuación ni recomendador.

## Robustez y acceso

Se reutilizan las RPC y RLS ya aplicadas. No hacen falta migraciones nuevas ni cambios de
permisos. Las identidades de petición se conservan al reintentar una operación con los mismos
datos. Un conflicto de versión exige volver a cargar y revisar antes de confirmar.

Los formularios conservan el borrador ante errores, avisan al salir y deshabilitan las escrituras
sin conexión. Las operaciones masivas tienen una revisión de solo lectura y una confirmación
atómica que vuelve a validar todas las carpetas. Las búsquedas abortan respuestas anteriores;
la paginación se corrige si deja de existir la última página al completar pendientes.

Los nombres de obras y responsables para movimientos se obtienen en consultas agrupadas por
página, sin una petición por cada fila. La carga del historial se hace al abrir el desplegable.

## Cómo probar

1. Inventario → Carpetas → Repertorio PRO / PMM → Nueva obra: crear una obra PRO.
2. Crear después una carpeta PRO: su contenido inicial debe incluir esa obra como presente.
3. Añadir otra obra PRO: la carpeta anterior debe tenerla pendiente; una carpeta PMM no la recibe.
4. Desde la obra, seleccionar carpetas y revisar. Cancelar no cambia ninguna presencia.
   Confirmar solo cuando se hayan colocado las copias físicamente.
5. Desde una carpeta → Ver partituras, registrar un faltante. Aparece la ausencia y el movimiento;
   la operatividad de la carpeta no cambia únicamente por ese faltante.
6. Retirar una obra del repertorio: las copias presentes quedan pendientes de retirada física.
   Confirmarla en una carpeta; reactivar la obra y comprobar que esa carpeta queda pendiente
   de incorporarla de nuevo.
7. Editar título/autor: se actualizan los nombres, sin cambiar presencia ni generar incorporaciones.
8. Consultar los historiales y probar filtros, regreso a la lista y navegación móvil.

## Verificación

- Compilación de producción sin advertencias.
- 36 pruebas unitarias y 17 comprobaciones específicas de base de datos aprobadas.
- Ciclo completo con Supabase real aprobado en escritorio y móvil: inicialización, edición,
  PRO/PMM separados, revisión cancelable, lotes, conflicto sin aplicación parcial, faltante,
  pérdida de respuesta con reintento idempotente, retirada, reactivación e historiales.
- Las pruebas reales no arrancan si existe un inventario de carpetas ajeno a sus propios datos:
  una obra es común a todo su repertorio y no debe crear tareas temporales en carpetas reales.
  La limpieza usa exclusivamente los UUID y prefijos sintéticos propios. Las revisiones lógicas
  del repertorio avanzan de forma monotónica; no se rebobinan.
- Ocho pruebas de interfaz de fase 3 y cuatro de regresión de fase 2 aprobadas en escritorio
  y móvil: errores, borradores, filtros, archivo y paginación. Con las dos pruebas reales,
  catorce comprobaciones de navegador aprobadas.
- Verificación remota final: no quedan voces, obras ni peticiones sintéticas de esta fase.

## Publicación y siguiente fase

No se ha hecho push ni desplegado la interfaz. Puede probarse localmente con `npm start`,
en http://localhost:4201/inventario/carpetas/repertorio, contra Supabase real.

La fase **4 — Incidencias y mantenimiento** fue autorizada posteriormente. Ver [su guía](fase-4-mantenimiento.md).

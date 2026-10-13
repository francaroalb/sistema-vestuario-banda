# Carpetas — fase 1: datos y servicios

Implementada el 13 de octubre de 2026. Pendiente de validación del usuario antes de fase 2.
La numeración de esta ampliación es independiente de las fases anteriores de Vestuario.

## Alcance

Modelo especializado de carpetas, voces configurables, repertorios PRO/PMM, obras,
presencia física, incidencias de partituras y de carpetas, operatividad e historial.
Incluye migraciones, RLS, servicios TypeScript y pruebas. No añade pantallas, cesiones
de carpetas, selección de voz, recomendador ni rutas. No altera las entregas de prendas.
Las nuevas migraciones están comprobadas localmente; no se han aplicado a Supabase remoto.
No se ha realizado push ni despliegue de esta ampliación.

## Archivos

- `supabase/migrations/20261013000100_music_foundation.sql`: diez tablas, índices,
  permisos, extensión aditiva de auditoría y tres vistas de lectura.
- `supabase/migrations/20261013000200_music_operations.sql`: operaciones transaccionales,
  revisión/confirmación de lotes y ayudantes privados.
- `src/app/core/music/models.ts`: modelos especializados y contratos de comandos.
- `src/app/core/music/music-api.ts`: transporte RPC, errores, petición estable y paginación.
- `src/app/core/folders/folders-repository.ts`: inventario, voces e historial de carpeta.
- `src/app/core/repertoire/repertoire-repository.ts`: obras, contenido, movimientos y lotes.
- `src/app/core/maintenance/maintenance-repository.ts`: pendientes, incidencias y resolución.
- `src/app/core/config/database.types.ts`: nuevas tablas, vistas, RPC y participación con voz nullable.
- `tests/music-database.test.mjs` y `src/app/core/music/music-api.spec.ts`: integridad y contratos.

No se modifican migraciones ya existentes. Se conserva el prompt maestro y la auditoría
aprobada en esta misma carpeta de documentación.

## Decisiones implementadas

### Catálogo e identidad

`musical_voices` admite nuevas voces sin cambiar código fuente. No se carga un catálogo
incompleto a partir de los ejemplos. PRO y PMM sí se inicializan como repertorios.
Las voces se pueden renombrar o archivar, conservando código e historial.

Código físico normalizado a mayúsculas y único incluso en carpetas archivadas. Se comprueba
que el repertorio y la voz coinciden con la etiqueta y que su número es positivo (hasta seis
dígitos, conservando ceros iniciales). No se generan etiquetas ni se renumeran códigos.
Código, repertorio y voz de una carpeta son estables desde el alta. Para corregir una
identidad errónea haría falta una operación posterior expresamente diseñada para ello.

`event_participants.voice_id` queda preparado, nullable y con FK. No se deducen voces de
instrumentos ni se rellenan participaciones. Su selector y operaciones corresponden a fase 7.

### Presencia y repertorio

`music_folders.baseline_revision` referencia la pertenencia activa histórica de las obras,
registrada en `repertoire_work_periods`. Cambios de título/autor no cambian esa pertenencia.
La inicialización administrativa queda registrada en auditoría con su revisión.
No se crean filas por cada pareja carpeta/obra al inicializar el inventario.

`folder_work_presence` conserva hechos posteriores y `folder_work_movements` su historial.
La vista `folder_work_state` distingue PRESENT, MISSING, PENDING_ADD, PENDING_REMOVE y
ABSENT_RETIRED. Una obra retirada puede seguir físicamente presente: solo desaparece
la tarea cuando se confirma su retirada. Una reactivación usa el último hecho físico,
o la presunción inicial cuando no se ha registrado otro hecho.

Archivar/reactivar una carpeta conserva la revisión inicial y las excepciones. No convierte
sus obras pendientes en presentes. Las relaciones compuestas impiden mezclar repertorios.

### Incidencias y operatividad

`folder_score_issues` separa MISSING, DAMAGED, REPLACE y REPAIR. Una nueva incidencia de daño
requiere que la partitura conste presente. Registrar MISSING actualiza la presencia y registra
su movimiento dentro de la misma transacción. Resolverla como PRESENT confirma recuperación;
solo una obra retirada permite resolverla como ABSENT. No se acepta cerrarla sin resultado físico.

`folder_physical_issues` separa elásticos, cubierta, anillas, sustitución de carpeta y otros
problemas. `blocks_use` es explícito. Incidencias abiertas equivalentes tienen índice único
parcial; ampliar observaciones mantiene el registro con auditoría. Resolver conserva historial.

Operatividad efectiva: no archivada, sin bloqueo manual y sin incidencia física bloqueante
abierta. Resolver un bloqueo no elimina otros ni el bloqueo manual. Una partitura faltante
o dañada no bloquea automáticamente. La disponibilidad física/reservas se incorporará con
las cesiones y planificación: esta fase no inventa estados de posesión.

`music_maintenance_tasks` unifica pendientes de repertorio y conservación sin contar dos
veces una ausencia con incidencia MISSING. Una incidencia de obra retirada conserva contexto
y requiere resolución explícita. Las vistas y repositorios son la base para la pantalla de fase 4.

### Transacciones, concurrencia y seguridad

Las escrituras del nuevo módulo utilizan un bloqueo transaccional propio (65013), sin tocar
el bloqueo de planificación de vestuario. Ajuste respecto a la propuesta inicial: se serializa
el pequeño volumen de escrituras del módulo completo, en lugar de bloquear por repertorio,
para asegurar un orden único entre catálogos, incidencias y lotes. Lecturas no adquieren ese
bloqueo. Esto simplifica la integridad inicial; la concurrencia se medirá antes de refinarlo.

RPC `music_command`: acciones VOICE_SAVE, WORK_SAVE, FOLDER_SAVE, PRESENCE, SCORE_SAVE,
SCORE_RESOLVE, PHYSICAL_SAVE y PHYSICAL_RESOLVE. Campos cerrados y tipos validados en SQL;
no admite imágenes ni metadatos de autor aportados por el navegador. Actor y fechas del servidor.
Versiones de incidencia, carpeta y obra se verifican cuando afectan a una operación.

`music_requests` conserva petición, actor y resultado. El cliente debe mantener su UUID
al reintentar. Misma petición/actor devuelve el resultado anterior; cambio de contenido o
actor se rechaza. No se generan movimientos ni auditorías duplicadas por respuesta perdida.

`preview_music_presence` revisa incorporaciones/retiradas de hasta 200 carpetas, sin escribir.
`apply_music_presence` vuelve a comprobar la vista previa completa y sus versiones, y aplica
el lote en una transacción. Cada carpeta tiene movimiento y auditoría propios. Un fallo,
incluso después de escribir la primera carpeta, revierte todo el lote.

Tablas con RLS y lectura solo para ADMIN activo. Navegador sin INSERT/UPDATE/DELETE directos.
RPC con control ADMIN, search_path cerrado y sin EXECUTE para anon/PUBLIC. Ayudantes privados
sin permisos de ejecución del navegador. Vistas security_invoker. Auditoría ampliada con
FK reales a carpetas, voces y obras, conservando todas las acciones anteriores de vestuario.

## Uso desde los siguientes formularios

1. Leer ficha y versiones actuales desde los repositorios.
2. Crear una petición UUID al preparar la operación; mantenerla durante los reintentos.
3. Enviar la selección revisada con versiones esperadas y petición.
4. Actualizar la ficha con el resultado. Las incidencias devuelven también folder_version.
5. Ante conflicto, volver a consultar/revisar antes de confirmar una petición nueva.

Los contratos concretos están en `MusicInputs` y `MusicResults`. Historiales y listados
usan páginas de 24 registros y orden estable. El contenido se consulta por carpeta u obra;
no se requiere descargar todo el repertorio ni hacer una petición por elemento.

## Validación

- 36 pruebas unitarias aprobadas, incluidas seis nuevas de servicios y manejo de errores.
- Suite completa de base de datos aprobada con 105 comprobaciones: las 89 anteriores y
  16 del módulo de carpetas (incluido el grupo de prueba).
- Después se añadió una comprobación de volumen: la suite específica final pasa sus
  17 comprobaciones. Crea más de 120 obras y 40 carpetas de prueba y comprueba que no se
  multiplican las filas de presencia y que los contadores derivados son correctos.
- Fallo provocado en la segunda escritura de un lote: no quedan cambios parciales,
  movimientos, auditorías ni peticiones confirmadas.
- Probados duplicados, RLS, usuario inactivo, permisos de escritura, referencias inválidas,
  idempotencia, versiones obsoletas, ausencia/daño, bloqueos múltiples, retiradas,
  reactivaciones, edición de observaciones, archivado y conservación del historial.
- `npm run build:production`: correcto, sin advertencias.
- `git diff --check`: correcto.

Las pruebas SQL usan PGlite aislado y aplican todas las migraciones. No modifican producción.
No equivalen a pruebas de concurrencia con varias conexiones PostgreSQL reales: quedan
pendientes antes de publicar el módulo. No se ejecutan pruebas nuevas de navegador porque
esta fase no añade interfaz. No hay todavía préstamos o reservas de carpetas que probar.

## Siguiente fase

Fase 2: selector Vestuario/Carpetas, inventario físico, alta/edición, búsquedas, ficha,
operatividad y archivado, manteniendo las cinco pestañas. Requiere autorización expresa.

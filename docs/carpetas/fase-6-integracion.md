# Carpetas — fase 6: integración con vestuario

Implementada el 13/10/2026, tras autorización expresa. Pendiente de validación del usuario.
Posteriormente se autorizaron las [fases 7 y 8](fases-7-8-planificacion.md). Sin push ni despliegue de interfaz.

## Acceso y uso

- **Carpetas → Entregar o devolver material**, desde Resumen.
- **Cesiones → Entrega y devolución conjunta**, tanto en Vestuario como en Carpetas.
- **Personas → Entregar o devolver material**, con la persona ya seleccionada.
- Rutas protegidas `/carpetas/operacion` y `/cesiones/material`. `persona` preselecciona la
  persona; `accion=devolver` abre las devoluciones. Los formularios avisan al salir con cambios.

Elegir **Entregar** o **Devolver**, identificar a la persona y seleccionar hasta 30 elementos.
Se admiten solo prendas, solo carpetas o ambos tipos. Los buscadores están plegados hasta que
se necesita añadir material. El material en posesión y las reservas se paginan de 24 en 24.

En entrega se pueden cumplir reservas existentes de carpetas desde su lista. Elegir una reserva
no entrega todavía: hace falta revisar, aceptar los avisos si los hay y firmar. Cada elemento
puede tener su propia fecha de devolución, o ninguna. Las fechas se interpretan en Madrid.

En devolución solo vuelven los elementos seleccionados. Cada prenda conserva su estado elegido
(disponible, lavandería o dañada); el resto sigue cedido, con su periodo original. La devolución
no resuelve incidencias existentes de carpetas. Las incidencias opcionales siguen disponibles
mediante la devolución individual de la carpeta, o desde su ficha en Mantenimiento.

Una única firma confirma toda la operación. Solo se transmite y guarda el booleano de confirmación;
el dibujo permanece en el canvas y se limpia al confirmar. La pantalla final enlaza las cesiones
individuales resultantes. El inventario y los historiales especializados siguen siendo la fuente
para consultar cada elemento.

## Modelo y transacciones

Migración aditiva `20261013000600_material_operations.sql`, aplicada al Supabase independiente
de Vestuario. Se cotejó el historial remoto (la única diferencia antigua era una línea en blanco
final) y se verificó que los recuentos de personas, prendas, cesiones, actuaciones y carpetas
se conservaron al aplicar el esquema.

- `preview_material_operation`: revisión por persona, validación de identidad, selección,
  versiones, operatividad, posesión, fechas, reservas y avisos.
- `apply_material_operation`: una transacción PostgreSQL. Revisa de nuevo los datos bajo los
  bloqueos de planificación, música, persona, cesiones y prendas antes de modificar nada.
- Una cabecera en `material_operations` agrupa las confirmaciones especializadas. Los movimientos
  de prendas apuntan a ella mediante `material_operation_id`; las operaciones individuales de
  carpetas mediante `parent_operation_id`. Se conservan las auditorías originales.
- Se reutilizan `record_loan_movement` y `apply_folder_loan`; no se sustituyen los motores de
  Vestuario ni las reservas de Carpetas. Una entrega conjunta crea una cesión por prenda para
  mantener fechas independientes sin reescribir las cesiones antiguas.
- Las devoluciones de varias prendas de una cesión antigua se agrupan por cesión para comprobar
  su versión una vez y conservar el cierre parcial existente.
- `material_held` es una vista con `security_invoker` de la posesión real por persona, sin
  mezclarla con reservas futuras. Sus tablas conservan RLS. RPC solo para administradores activos.
- Idempotencia por petición, actor y contenido completo. El cliente mantiene la misma petición
  al reintentar tras pérdida de conexión. Si cambia la revisión se exige renovar la firma.
- Cualquier fallo revierte prendas, carpetas, cabecera, movimientos y auditoría conjuntamente.

Los avisos de futuras actuaciones de prendas se muestran para coordinar la devolución, sin
alterar la planificación existente. Carpetas conserva sus comprobaciones de solapes y posesión.
No se devuelven automáticamente elementos al vencer su fecha.

## Prueba manual

1. Abrir una persona y pulsar **Entregar o devolver material**.
2. Elegir dos prendas y una carpeta; poner fechas diferentes y dejar una sin fecha.
3. Revisar: comprobar códigos, persona, fechas y avisos. Confirmar debe estar deshabilitado
   hasta firmar. Tras confirmar, comprobar la posesión en los dos inventarios.
4. Volver al flujo en **Devolver** y seleccionar una prenda y la carpeta. Marcar la prenda
   pendiente de lavandería. Confirmar con una firma; la otra prenda debe seguir cedida.
5. Repetir con una carpeta reservada y comprobar que se cumple esa reserva.
6. Desconectar internet antes de revisar: la selección y observaciones deben conservarse.
   Si otro administrador cambia el material entre revisión y confirmación, revisar y firmar de nuevo.

## Validación

- Compilación de producción, pruebas unitarias y suite completa de PostgreSQL aislado.
- Pruebas específicas de firma, idempotencia por actor, fechas independientes, selección parcial,
  reserva cumplida, material ajeno, selección duplicada, payload cerrado y permisos.
- Fallos provocados durante escrituras de carpetas prueban la reversión completa de entrega y
  devolución mixtas. Se comprueba la devolución parcial de cesiones antiguas con varias prendas.
- Navegador simulado en escritorio/móvil: fechas independientes, offline, respuesta perdida,
  mismo UUID de reintento, borrador tras conflicto y firma renovada.
- Recorrido real en Supabase: entrega firmada de dos prendas y una carpeta, devolución de parte
  del material, estados e independencia de periodos; confirmaciones concurrentes sobre el mismo
  material. Regresión real del flujo previo de prendas, incluidos cambio y devolución parcial.
- Los fixtures tienen UUID y prefijos QA propios. No se crean obras de repertorio compartidas;
  la limpieza borra exclusivamente los registros de esas personas, prendas y carpetas sintéticas.

Resultados finales: 38 pruebas unitarias, 131 comprobaciones de base de datos y compilación de
producción sin advertencias. Última pasada de interfaz: 12 aprobadas (flujo conjunto y navegación
Carpetas). Pasada real/regresión: 12 aprobadas; 4 pruebas antiguas de Carpetas se omitieron porque
requieren un catálogo vacío y ya existe inventario musical. El nuevo recorrido real de fase 6
sí se ejecutó en ambos tamaños. Verificación remota final: migración idéntica y cero personas,
prendas, voces u operaciones sintéticas de fase 6 restantes.

# Fase 6 — Series y Semana Santa

Implementación autorizada tras aprobar las actuaciones y el ajuste de tarjetas. Versión 0.6.0.
No se implementan las fases 7–10.

## Alcance

- Series con nombre, agenda de actuaciones existentes o nuevas y preparación conjunta.
- Participación por persona mediante casillas; búsqueda de fichas y alta rápida de refuerzos.
- Periodos automáticos para actuaciones consecutivas; elección obligatoria mantener/dividir
  si existe una actuación intermedia no participada. La regla se valida también en PostgreSQL.
- Asignación manual por tipo y periodo completo, incluyendo huecos al mantener la prenda.
- Una entrega física firmada, vinculada a todas las actuaciones del bloque. Posesión compartida
  en su preparación, aviso de última actuación y devolución real, también parcial.
- Versión optimista, reintentos idempotentes, bloqueo transaccional compartido con actuaciones,
  auditoría y RLS ADMIN. Ninguna imagen o trazo de firma se almacena ni transmite.
- Tarjetas compactas y dos columnas cuando caben; navegación principal sin nuevas pestañas.

## Escenario de aceptación

Se ejecuta contra PostgreSQL aislado y contra Supabase real desde navegador. Datos sintéticos
con prefijo QA y UUID propios, eliminados al finalizar cada ejecución.

Seis actuaciones ficticias de una semana futura: Domingo de Ramos, Martes, Miércoles, Jueves,
Madrugá y Viernes. Las dos últimas comparten fecha, con horarios distintos. Diez refuerzos:

| Persona | Participación | Resultado |
| --- | --- | --- |
| 0 | Todas | Un periodo consecutivo |
| 1 | Domingo, Martes | Un periodo aunque hay un día libre |
| 2 | Domingo, Miércoles, Viernes | Divide en tres periodos |
| 3 | Miércoles, Jueves, Madrugá | Un periodo |
| 4 | Domingo | Un periodo |
| 5 | Martes a Viernes | Un periodo |
| 6 | Domingo, Martes, Madrugá, Viernes | Divide en dos periodos |
| 7 | Martes, Madrugá | Mantiene durante los huecos |
| 8 | Viernes | Un periodo |
| 9 | Domingo, Miércoles, Viernes | Mantiene; tras devolución, cambia a dividir |

La prueba de navegador crea una actuación y el décimo refuerzo desde la interfaz, fuerza la
pérdida de una respuesta al guardar y confirma que el reintento no duplica nada. Asigna una prenda
al periodo completo, entrega con firma y comprueba que la última actuación muestra la misma
posesión, sin una nueva entrega. Devuelve con firma, revisa el cierre real y cambia la decisión
a tres bloques. La concurrencia de dos administraciones simultáneas no sobrescribe el plan.

## Validación

- 16 pruebas unitarias aprobadas.
- 64 pruebas de base de datos aprobadas, incluyendo las regresiones de fases anteriores.
- 46 casos de navegador aprobados entre escritorio y móvil emulado: 22 controlados y 24 reales.
- Compilación correcta sin avisos de presupuesto: 497,38 kB iniciales; 123,35 kB estimados de transferencia.
- Comprobación de desbordamiento horizontal en 320, 390, 768 y 1280 px durante la preparación;
  capturas finales en escritorio de 1440 px y móvil de 390 px.
- Las rutas nuevas exigen autenticación. Acceso anónimo, escritura directa, versión obsoleta y
  comandos no admitidos rechazados; tablas nuevas con RLS. Retirar ADMIN revoca su lectura.
- Reservas en ambos sentidos entre actuaciones individuales y bloques, conflictos dentro de los
  huecos y reutilización de prendas en bloques separados comprobados en PostgreSQL.
- Uniformes distintos: unión de tipos, entrega conjunta y devolución parcial comprobadas.
- Migración `20261005000800_series.sql` aplicada y registrada en el Supabase independiente.
  Comprobación de igualdad literal entre la migración registrada y el archivo local.

Capturas locales excluidas de Git: `.local/screenshots/fase6-*`. La emulación no sustituye
la validación en Safari/iPhone y Android físicos, pendiente de una URL HTTPS accesible.

## Decisiones y límites

Completar la agenda antes de preparar participantes. Cambiar actuaciones, fechas o uniformes
con bloques preparados exige retirar antes esas participaciones; después se vuelve a preparar.
No se altera silenciosamente una decisión previa sobre huecos. La retirada se bloquea cuando
hay líneas entregadas del bloque pendientes de devolver. Cambiar la participación libera sus
reservas anteriores con aviso y auditoría; nunca crea una devolución ficticia.

Los bloques separados no pueden solaparse: hay que ajustar recogidas/devoluciones o mantener
una única cesión. Si una persona ya tenía una prenda, se respeta la posesión y la fecha de su
cesión existente; la planificación no la modifica retroactivamente. La devolución real puede
registrarse antes de lo previsto y las cesiones parciales permanecen abiertas.

Una serie admite 60 actuaciones y 200 participantes. El orden se basa en inicio e identificador
para empates exactos. No hay recomendador ni asignación automática en esta fase.

Tras el último ajuste del acceso a cancelar actuaciones, se repitieron los cuatro casos de series
(escritorio y móvil), todos aprobados. Se comprobó el aviso y que una cancelación rechazada no
modifica la actuación. Revisión final remota: cero series, bloques, actuaciones, uniformes, personas,
prendas, cesiones, auditorías o peticiones sintéticas restantes.

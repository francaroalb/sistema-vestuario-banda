# Refinamiento visual — octubre de 2026

Revisión inicial solicitada antes de continuar con fase 5. Mantiene los flujos, los modelos, las RPC,
la autenticación y la arquitectura existentes. La revisión de densidad posterior a fase 5 se documenta al final.

## Diagnóstico y dirección

La UI anterior mezclaba títulos serif y sans entre secciones, bordes corporativos gruesos,
superficies de muchos colores y botones con pesos visuales demasiado parecidos. Los campos,
badges y tarjetas repetían tamaños y espaciados locales sin una escala común.

La evolución conserva el granate `#8e1717`, el burdeos oscuro `#5d0c12`, el dorado `#c48113`,
el logo de la Banda, Manrope, Cormorant Garamond y la familia de iconos de línea existente.
Manrope organiza el trabajo; Cormorant se reserva para identidad y acceso. La barra inferior
continúa en burdeos. Cabecera y lateral de escritorio pasan a superficies claras.

## Sistema compartido

La fuente de tokens es `src/styles.scss`:

- Fondos cálidos neutros, superficies principal/secundaria, bordes sutiles y colores semánticos.
  Granate para acciones y cesiones; verde para disponibilidad; azul grisáceo para lavandería;
  rojo discreto para daños/errores; dorado moderado para detalles y advertencias.
- Escala de página, sección, tarjeta, cuerpo, etiquetas, metadatos y cifras. Números tabulares.
- Espaciado de base 4 px; padding de tarjetas 16/18 px según pantalla (ajustado tras fase 5).
- Radios 6/10/14/20 px; cápsulas reservadas para badges y contadores.
- Controles de 48 px y objetivos táctiles de al menos 44 px en botones principales.
- Sombras distintas para superficies, interacción y overlays; transiciones de 140/200 ms.
- Anchura general, de lectura y de formulario independientes.

`.btn-primary`, `.btn-secondary`, `.btn-quiet` y `.btn-danger` expresan la jerarquía de acciones.
Los campos y los selectores de personas/prendas comparten geometría, foco, validación y estados.
Las confirmaciones de archivo tienen tratamiento destructivo; reactivar conserva el primario.

## Aplicación en pantallas

- Inicio: entrega como acción principal, búsqueda secundaria, accesos agrupados y cifras legibles.
  En móvil, el total ocupa una fila y los cuatro indicadores operativos forman una cuadrícula.
- Inventario/personas/cesiones: tarjetas con encabezado, contenido y acciones separados; grids
  que aprovechan el escritorio. Se conservan los listados y los controles existentes.
- Fichas y formularios: ancho de lectura limitado, metadatos subordinados y espaciado consistente.
- Cesión: resumen general y, desde 1024 px, prendas e historial en columnas; en móvil, lectura
  vertical. Movimientos representados cronológicamente sin alterar su orden ni sus datos.
- Firma: área neutra, confirmación visual tras un trazo válido y estado de guardado atenuado.
- Diálogos y avisos: superficies discretas, separación de acciones y aparición breve.
- Acceso: identidad en un panel suave y formulario centrado, sin un gran bloque oscuro.

## Validación

Compilación sin avisos de presupuesto: carga inicial 495,84 kB; transferencia estimada 123,96 kB.
Revisión visual con datos ficticios de Inicio, Inventario, Personas, Cesiones, alta de prenda,
ficha de prenda, ficha de cesión y nueva entrega. Sin desbordamiento horizontal en 320, 390,
768, 1280 y 1440 px, en contextos de escritorio y móvil emulado.

También se revisaron acceso, diálogos, firma, foco de teclado y `prefers-reduced-motion`.
Las diez combinaciones principales de texto/fondo comprobadas superan 4,5:1 de contraste;
esto es una comprobación específica, no una auditoría completa de accesibilidad.

Las capturas locales usan exclusivamente datos ficticios y están en
`.local/screenshots/ui-before`, `ui-after` y `ui-states`, excluidas de Git.
La emulación móvil no sustituye la validación pendiente en Safari/iPhone y Android físicos.

Regresión funcional: 33 casos aprobados en la ejecución completa; el caso restante terminó sus
comprobaciones pero falló por timeout en `afterAll`, durante la limpieza remota. Se repitió ese
caso de inventario en escritorio y pasó, incluida la limpieza. Tras el último ajuste visual de
firma se repitió además el recorrido completo de entrega/devolución/cambio en escritorio y móvil:
ambos aprobados. Quedan cubiertos los 34 casos existentes sin fallos funcionales pendientes.
Comprobación remota final: cero registros sintéticos de personas, prendas, cesiones o auditoría.

Se verificó también que los cuerpos de las clases de los componentes modificados permanecen
idénticos: los cambios de TypeScript son exclusivamente de presentación/metadatos de estilos.


## Tarjetas compactas — revisión posterior a fase 5

Se reduce el espacio vertical y se aprovecha el ancho disponible sin ocultar contenido:

- Inventario: tipo y código junto a talla, estado y titular destacados.
- Personas: nombre y pertenencia en una cabecera horizontal; instrumento debajo.
- Cesiones: nombre y estado en paralelo, cantidad pendiente sobre fondo burdeos suave.
- Actuaciones: fechas en dos columnas cuando caben; cabeceras de participantes sobre
  fondo burdeos suave, acciones en línea y estados con color y texto.
- Fichas: datos agrupados en superficies suaves e historial y asignaciones en dos columnas.
- Nueva cesión: persona y prendas en paralelo en escritorio; lectura vertical en móvil.
- Inicio: accesos más compactos y cifras con fondos y colores semánticos.

Los botones de las tarjetas mantienen una altura mínima de 44 px. Las tarjetas crecen
con el contenido y los nombres largos se ajustan sin truncarse. La paleta sigue siendo
burdeos, dorado y colores semánticos; no se cambia la lógica de negocio.

Comparación con el mismo conjunto ficticio, en escritorio de 1440 px:

| Elemento | Antes | Después |
| --- | ---: | ---: |
| Tarjeta de persona | 180 px | 106 px |
| Tarjeta de prenda disponible (fila sin cesiones) | 195 px | 140 px |
| Tarjeta de cesión | 220 px | 157 px |
| Tarjeta de participante con asignación | 280 px | 159 px |
| Página de preparación, cuatro participantes | 2028 px | 1427 px |
| Página de nueva cesión | 1645 px | 1156 px |

En móvil de 390 px, la página de preparación pasa de 2921 a 2038 px.
Estas medidas dependen del contenido de prueba; no son alturas fijas del diseño.
Capturas y mediciones locales: `.local/screenshots/ui-compact-before` y
`.local/screenshots/ui-compact-after`, excluidas de Git.

Validación de esta revisión: compilación correcta sin avisos de presupuesto; 22 casos de
navegación/listados con respuestas controladas y 10 casos reales de actuaciones/cesiones
aprobados entre escritorio y móvil. Tras el último ajuste de cesiones se repitieron sus dos
casos de listado, ambos aprobados. Comprobación de desbordamiento horizontal en 320, 390,
768, 1280 y 1440 px para once pantallas; capturas de escritorio y móvil emulado revisadas.
Se comprobó que los cuerpos de las clases TypeScript modificadas no cambian. La revisión
visual en dispositivos físicos sigue pendiente.

## Rediseño del inicio tras fase 6

Inicio organizado en tres bloques: gestiones frecuentes, estado del vestuario y preparación.
La nueva cesión conserva el burdeos principal; devolver/cambiar y las búsquedas tienen una
jerarquía secundaria clara. Altas de prendas/personas en una fila discreta. Los recuentos se
agrupan en un solo panel con cifras y fondos semánticos; todos conservan sus filtros originales.
Actuaciones y Series comparten una franja dorada suave con accesos directos.

En escritorio, acciones e inventario se sitúan en paralelo; en móvil, las acciones y cifras
mantienen dos columnas. Se eliminan textos redundantes y se conserva el saludo breve.
No se añaden consultas ni se modifica la lógica de carga o el modelo de datos.

Validación: compilación sin avisos, 22 casos existentes de acceso/navegación aprobados y
revisión con datos ficticios en 320, 390, 768, 1280 y 1440 px sin desbordamiento horizontal.
Capturas locales en `.local/screenshots/ui-home-redesign`, excluidas de Git.
Se comprobaron también los ocho destinos de acciones, el inventario vacío y la recuperación
mediante Reintentar tras un error de carga, en escritorio y móvil emulado.

## Preparación compacta de series tras fase 8

Los participantes se presentan en una tira horizontal de tarjetas pequeñas: nombre,
instrumento y chaqueta asignada. Se puede desplazar con el dedo o navegar con flechas.
Solo se abre una ficha a la vez; pulsarla de nuevo o usar Plegar la cierra. La edición
de participación aparece dentro de esa ficha y conserva la confirmación antes de descartar
cambios pendientes. El nombre completo permanece disponible en la ficha y en la etiqueta
accesible de la tarjeta; los resúmenes largos se limitan a dos líneas.

Se ordenan primero las personas con incidencias, después quienes necesitan chaqueta,
después quienes necesitan otras prendas y finalmente quienes tienen todas las asignaciones
preparadas. El verde identifica preparados, el ámbar revisión y el borde burdeos la selección.
Preparado exige todas las prendas de todos los periodos, sin conflictos. Una devolución
prevista compatible conserva un aviso y no impide que la asignación esté preparada. Los filtros y la búsqueda por nombre o instrumento permiten localizar personas.

La agenda y la preparación asistida comienzan plegadas y comparten fila en escritorio.
Las actuaciones de cada periodo también se consultan al desplegar su agenda. Asignar una
prenda actualiza la ficha abierta sin sustituir toda la pantalla por un indicador de carga.
No cambia el modelo de datos ni las operaciones de asignación; los datos manuales se conservan.

Validación: 21 pruebas unitarias, compilación sin avisos de presupuesto y 12 pruebas de
navegador aprobadas (10 con Supabase real y 2 de interfaz con 30 participantes ficticios).
Tras los últimos ajustes se repitieron las dos pruebas de interfaz, también aprobadas.
Se comprobó desplazamiento táctil emulado, edición dentro de la ficha, protección de
borradores, orden tras asignar y ausencia de desbordamiento de página en 320, 390, 768,
1280 y 1440 px. Capturas revisadas en `.local/screenshots/series-compacta-desktop.png`
y `.local/screenshots/series-compacta-mobile.png`. Pendiente la valoración en dispositivo físico.

### Resumen horizontal de actuaciones

El desplegable Actuaciones usa tarjetas horizontales con desplazamiento táctil y flechas.
Cada tarjeta muestra fecha, uniforme, total de participantes (incluidos los refuerzos),
recuento de refuerzos y necesidades por tipo de prenda con progreso de asignación.
El estado Completado se muestra en verde solo cuando todas las prendas del uniforme de
esa actuación están asignadas sin conflictos. Las devoluciones previstas compatibles son avisos. Las asignaciones
pendientes o por revisar aparecen en ámbar; sin participantes y cancelada son estados neutros.
Los recuentos se calculan desde los bloques de asistencia, incluso cuando el servidor devuelve
las prendas solo para la primera actuación del bloque. No se cuentan prendas de otros uniformes.
Sin cambios de base de datos. Validación: 24 pruebas unitarias, compilación y 2 pruebas de
navegador (escritorio y móvil); agenda abierta sin desbordamiento de página entre 320 y 1440 px.
Capturas locales `series-agenda-desktop.png` y `series-agenda-mobile.png`.

### Navegación de actuaciones y tipografía de series

Actuaciones, Series y Uniformes comparten tres pestañas de navegación con sección activa
burdeos y `aria-current="page"`. Se conservan sus rutas, enlaces directos y protecciones
frente a cambios sin guardar. Cada listado mantiene su acción principal de creación.
Conflictos y avisos se consulta desde su apartado de seguimiento en Inicio; se elimina
el enlace suelto bajo el título de Actuaciones.

Los encabezados Preparación asistida y Actuaciones de una serie comparten Manrope, tamaño
`--text-sm`, peso 700, interlineado 1.5 y altura mínima 44 px. Flechas alineadas a la derecha;
los textos auxiliares y recuentos mantienen una jerarquía secundaria.
Validación: compilación y seis pruebas de navegador aprobadas entre escritorio y móvil,
con navegación entre pestañas, recarga, filtros, preparación y comparación de estilos
calculados. Se comprobó que las tres pestañas caben a 320 px sin desbordamiento.


### Reservas futuras dependientes de una devolución

Una asignación con estado PENDIENTE_DEVOLUCION cuenta como preparada: la fecha prevista
es compatible con la próxima entrega. Se muestra un aviso informativo con la persona que
posee la prenda, devolución prevista, nueva entrega y próximo uso; no se agrupa con los
conflictos ni con las prendas sin asignar. Las tarjetas compactas conservan una indicación
de devolución prevista y las actuaciones muestran el número de avisos.
Inicio utiliza «Avisos de próximos usos» cuando no hay conflictos; el panel distingue
«Aviso · próximo uso» y «Ver preparación» de las acciones para resolver conflictos.

La clasificación del servidor ya diferenciaba ambos casos. No cambian esquema, reservas,
cesiones ni permisos: devolución vencida, incompatible, sin fecha o decisión de mantener
siguen requiriendo revisión según las reglas existentes. La entrega física sigue exigiendo
la devolución real de una prenda que posee otra persona.
Validación: 25 pruebas unitarias, 8 casos de base de datos de conflictos y permanencia,
compilación y 2 pruebas de navegador en escritorio y móvil aprobadas.

### Prenda ya entregada frente a una nueva asignación

Las recomendaciones indican explícitamente cuando la prenda ya figura entregada a la misma
persona en una cesión activa. Elegirla vincula su uso a la actuación sin crear otra cesión.
La preparación individual y de series explica este estado y permite consultar Ver cesión.
Para una prenda disponible, elegir reserva y Entregar exige la confirmación de firma.
No se altera la posesión ni se devuelven prendas al quitar una asignación.
Validación: compilación y ocho casos de base de datos del recomendador aprobados, incluido
reutilizar una prenda propia sin generar una nueva cesión.

### Inicio: actuaciones del día y agenda

La última tarjeta pasa a Agenda y seguimiento, con tres accesos compactos a Actuaciones,
Series y Conflictos y avisos. Los enlaces comparten jerarquía y superficie; se apilan en móvil.
Antes de las gestiones habituales aparecen las actuaciones cuyo inicio cae en el día actual
de Europe/Madrid, excluyendo canceladas y ordenadas por hora. Cada tarjeta muestra hora,
nombre y uniforme, con acceso a la ficha individual de participantes para entregar y firmar,
también cuando la actuación pertenece a una serie. No realiza entregas ni asignaciones.

Consulta paginada de solo lectura con los permisos existentes. No hay tarjeta vacía cuando
no hay actuaciones hoy; los fallos ofrecen reintento. Al recuperar el foco se recarga la agenda,
y se detecta el cambio de día cada minuto mientras Inicio está abierto. Se respetan los días
de 23 y 25 horas por cambio de horario. Validación: 27 pruebas unitarias, compilación y pruebas
de navegador de agenda vacía, dos actuaciones, error/reintento, enlace directo y anchos de
320 a 1440 px en escritorio y móvil. Capturas locales `home-today-390.png` y `home-today-1440.png`.

### Inventario por tipos desplegables

La entrada a /inventario sin filtros muestra los tipos del catálogo plegados (Chaquetas,
Camisas, Pantalones y cualquier otro tipo existente). Solo se consulta el listado al abrir
un tipo; abrir otro cierra el anterior. La sección activa usa el filtro `tipo` de la URL,
conservando recarga, enlaces a fichas, regreso y paginación de 24 prendas.
La búsqueda sin tipo recorre todo el inventario; los accesos filtrados desde Inicio muestran
sus resultados directamente. Ver todo el inventario permite consultar el listado conjunto;
Limpiar filtros vuelve a la vista inicial plegada. Los controles tienen estado accesible
`aria-expanded` y el tipo activo se distingue con fondo burdeos suave.
Validación: compilación sin avisos y cuatro pruebas de navegador aprobadas en escritorio y
móvil, cubriendo carga bajo demanda, cambio/cierre de tipo, recarga, búsqueda, paginación,
recuperación de errores y ausencia de desbordamiento entre 320 y 1440 px.

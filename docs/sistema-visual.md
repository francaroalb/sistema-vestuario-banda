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

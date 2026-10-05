# Refinamiento visual — octubre de 2026

Revisión solicitada antes de continuar con fase 5. Mantiene los flujos, los modelos, las RPC,
la autenticación y la arquitectura existentes. No incorpora actuaciones ni otros módulos futuros.

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
- Espaciado de base 4 px; padding de tarjetas 20/24 px según pantalla.
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
- Cesión: resumen general y, desde 1200 px, prendas e historial en columnas; en móvil, lectura
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

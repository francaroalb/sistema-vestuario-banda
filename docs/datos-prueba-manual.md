# Datos para simulación manual

Lote DEMO-VESTUARIO-20261005. Cargado el 5 de octubre de 2026 en el Supabase de Vestuario.

Se han añadido 30 personas ficticias (20 de Banda y 10 refuerzos) y 94 prendas. Todos los registros llevan la referencia del lote en Observaciones. Los datos y cesiones anteriores se conservan.

Las personas nuevas empiezan sin histórico ni cesiones. El histórico se generará con las entregas y devoluciones que hagas desde la aplicación; así puedes comprobar el flujo completo y la firma.

## Inventario añadido

| Tipo | Cantidad | Tallas | Códigos |
| --- | ---: | --- | --- |
| Chaqueta | 40 | 40, 42, 44, 46, 48, 50, 52, 54, 56, 58; cuatro de cada talla | C10-40 a C49-58 |
| Pantalón | 30 | Las mismas tallas; tres de cada talla | P01-40 a P30-58 |
| Camisa | 24 | S, M, L, XL, XXL, 3XL; cuatro de cada talla | CA01-S a CA24-3XL |

Los identificadores de chaqueta continúan después de los existentes. La parte tras el guion siempre coincide con la talla.

| Talla de chaqueta | Códigos nuevos |
| --- | --- |
| 40 | C10-40, C11-40, C12-40, C13-40 |
| 42 | C14-42, C15-42, C16-42, C17-42 |
| 44 | C18-44, C19-44, C20-44, C21-44 |
| 46 | C22-46, C23-46, C24-46, C25-46 |
| 48 | C26-48, C27-48, C28-48, C29-48 |
| 50 | C30-50, C31-50, C32-50, C33-50 |
| 52 | C34-52, C35-52, C36-52, C37-52 |
| 54 | C38-54, C39-54, C40-54, C41-54 |
| 56 | C42-56, C43-56, C44-56, C45-56 |
| 58 | C46-58, C47-58, C48-58, C49-58 |

88 prendas disponibles. Casos especiales iniciales:

| Estado | Prendas |
| --- | --- |
| Pendiente de lavandería | C14-42, P09-44, CA06-M |
| Dañada | C29-48, P25-56, CA21-3XL |

## Personas ficticias

| Nombre | Grupo | Instrumento |
| --- | --- | --- |
| Antonio Martín | Banda | Clarinete |
| Ana García | Banda | Flauta |
| Manuel López | Banda | Trompeta |
| María Fernández | Banda | Saxofón alto |
| José Sánchez | Banda | Trombón |
| Carmen Ruiz | Banda | Oboe |
| Francisco Romero | Banda | Bombardino |
| Laura Navarro | Banda | Trompa |
| David Torres | Banda | Tuba |
| Lucía Moreno | Banda | Percusión |
| Javier Díaz | Banda | Saxofón tenor |
| Marta Ortega | Banda | Clarinete |
| Carlos Castro | Banda | Clarinete |
| Elena Molina | Banda | Flauta |
| Miguel Delgado | Banda | Trompeta |
| Paula Ramos | Banda | Saxofón alto |
| Rafael García | Banda | Trombón |
| Rocío López | Banda | Oboe |
| Alejandro Fernández | Banda | Bombardino |
| Cristina Sánchez | Banda | Trompa |
| Daniel Ruiz | Refuerzo | Tuba |
| Sara Romero | Refuerzo | Percusión |
| Sergio Navarro | Refuerzo | Saxofón tenor |
| Beatriz Torres | Refuerzo | Clarinete |
| Pablo Moreno | Refuerzo | Clarinete |
| Teresa Díaz | Refuerzo | Flauta |
| Pedro Ortega | Refuerzo | Trompeta |
| Isabel Castro | Refuerzo | Saxofón alto |
| Juan Molina | Refuerzo | Trombón |
| Luis Ramos | Refuerzo | Oboe |

## Recorridos sugeridos

1. **Entrega y devolución parcial.** Abre una cesión para Ana García con C26-48, P13-48 y CA09-L. Firma la entrega. Devuelve únicamente la camisa, marcándola para lavandería: la cesión debe continuar abierta con las otras dos prendas. Después devuelve las restantes.

2. **Histórico y recomendación.** Entrega y devuelve C26-48 a Ana García dos veces. Prepara una actuación cuyo uniforme incluya Chaqueta y añade a Ana: debería proponerse talla 48, con alternativas disponibles. Añade a Daniel Ruiz sin haberle cedido nada: debe aparecer sin histórico y permitir elegir manualmente. Para probar un empate, entrega y devuelve tallas distintas a otra persona el mismo número de veces.

3. **Actuaciones el mismo día.** Crea dos actuaciones futuras con horas distintas. Ajusta también los periodos de recogida y devolución: si se solapan, compartir prenda entre personas distintas debe avisar o impedir la reserva; si los periodos son compatibles, podrás reutilizarla. No basta con que no coincidan las horas del concierto.

4. **Serie con huecos.** Crea una serie con tres actuaciones futuras. Añade a Daniel Ruiz a la primera y tercera, y a Sara Romero a la segunda. Comprueba la elección Mantener/Dividir. Si Daniel conserva C30-50 durante el hueco, no debe poder reservarse esa misma prenda a Sara en el periodo intermedio.

5. **Mantener pese al impacto.** Entrega C34-52 a Pedro Ortega con devolución prevista anterior al periodo de una futura actuación. Asigna después esa prenda a Juan Molina para esa actuación: aparecerá la devolución pendiente. En la cesión de Pedro selecciona Mantiene la prenda, revisa el impacto y confirma. La reserva de Juan debe conservarse y aparecer como conflicto. Resuélvelo sustituyéndola por C35-52 o registrando la devolución real de Pedro.

6. **Estado físico.** Asigna C38-54 a una actuación futura y después márcala como Dañada desde Inventario. La reserva debe permanecer y generar una incidencia. Vuelve a Disponible después de simular su reparación, o sustituye la asignación por C39-54. Las prendas inicialmente dañadas o en lavandería permiten comprobar también su exclusión del recomendador.

Las tallas de estos ejemplos son elecciones de prueba, no medidas personales de las personas ficticias. Puedes utilizar los uniformes Invierno y Verano ya existentes o configurar uno según las prendas que quieras comprobar.

## Identificación del lote

La referencia está en Observaciones de todas las personas y prendas creadas. El manifiesto local con sus UUID se conserva en .local/manual-demo-manifest.json, excluido de Git. Permite identificar exactamente los registros del lote si más adelante solicitas limpiarlos. No se ha ejecutado ninguna limpieza ni programado un borrado automático.

## Historial para probar recomendaciones (5 de octubre de 2026)

Lote `DEMO-HISTORIAL-RECOMENDADOR-20261005`: tres cesiones de prueba cerradas por persona,
con tres usos de chaqueta y uno de camisa. Se simularon entrega y devolución; las notas
identifican explícitamente que no hubo entrega física ni firma real. Fechas de registro
actuales, sin inventar fechas históricas. No se modificaron cesiones abiertas ni reservas.

| Persona | Chaqueta de referencia | Camisa añadida |
| --- | --- | --- |
| Isabel Mora | 48 | M |
| Fran Caro | 48 | L |
| Pilar Alonso | 46 | S |
| Carmelo | 52 | XL |

El historial previo se conserva. El RPC del recomendador confirmó talla 48 para Isabel y
Fran, y 46 para Pilar en sus actuaciones futuras existentes. Carmelo todavía no participa
en una actuación futura: añadirlo a una para consultar su propuesta de talla 52.
El recomendador usa frecuencia de talla y disponibilidad para la fecha, no garantiza siempre
la misma chaqueta física. Manifiesto local excluido de Git:
`.local/recommendation-history-manifest.json` (12 cesiones cerradas, 16 prendas devueltas).

# Fase 7 — recomendaciones y preparación asistida

Fecha: 5 de octubre de 2026. Versión 0.7.0.

## Resultado funcional

En actuaciones individuales y series se puede abrir **Ver propuestas**, revisar el
reparto y confirmar **Aplicar N propuestas**. Las asignaciones existentes se conservan.
Las coincidencias claras se preparan en conjunto; los empates, tallas superiores,
falta de disponibilidad y personas sin histórico quedan para revisión manual.

El selector individual muestra la talla habitual por tipo, frecuencias de entregas,
mejor opción y alternativas. Se conserva el selector manual. Las propuestas utilizan
reglas deterministas, no IA, y no crean entregas ni devoluciones físicas.

## Reglas y límites

- La talla más frecuente proviene del histórico real de cesiones. Un empate se ordena
  por recencia, pero sigue siendo ambiguo y no se aplica en conjunto.
- Se comparan enteros positivos de 1 a 999 o tallas XXS a XXXL, incluyendo 2XL/3XL.
  Las demás etiquetas solo coinciden exactamente; no se convierten sistemas de tallaje.
- Nunca se recomienda una talla menor. La siguiente mayor disponible se identifica
  para comprobar manualmente cómo queda.
- Se comprueba todo el periodo de reserva, incluidos los huecos de series que conservan
  prendas. No se recomiendan prendas archivadas, dañadas, en lavandería o en poder de
  otra persona. Sí se puede reutilizar una prenda en poder del mismo destinatario.
- El reparto es determinista y evita solapamientos entre propuestas, sin optimización
  global. Una persona anterior en el orden puede recibir la única prenda de una talla.
- Límite de 200 líneas pendientes por vista previa; paginación de ocho propuestas.
- Al confirmar se recalcula el conjunto bajo bloqueos. Un cambio rechaza todo el lote
  y pide revisar de nuevo. Repetir la misma petición no duplica asignaciones.
- Las reservas anteriores con conflictos o devoluciones pendientes siguen visibles;
  esta fase no incorpora la resolución avanzada prevista para fase 8.

## Validación

- 16 pruebas unitarias de autorización, respuestas tardías y errores.
- 73 pruebas de base de datos, incluidas las nuevas reglas de tallaje, empates, falta
  de histórico, exclusiones físicas, posesión propia/ajena, concurrencia de propuestas,
  invalidación de lotes de dos personas, manipulación de la vista previa, permisos,
  idempotencia y series con huecos.
- Compilación de producción correcta; paquete inicial de 497,38 kB, sin advertencias
  de presupuesto.
- 48 pruebas de navegador validadas: 22 con respuestas controladas y 26 contra Supabase
  real. La ejecución general pasó 46; las dos de inventario se repitieron con éxito tras
  actualizar un selector del rediseño del inicio.
- Casos nuevos contra Supabase real: vista previa sin escrituras, recomendación
  individual, revisión sin histórico, pérdida de respuesta y reintento, conservación de
  asignaciones, propagación a serie, confirmaciones simultáneas y ausencia de nuevas cesiones.
- Comprobación de anchuras 320, 390, 768, 1280 y 1440 px, y navegación móvil emulada.
  Capturas locales en .local/screenshots/fase7-desktop.png y fase7-mobile.png.

La migración 20261005000900_recommendations.sql está registrada en el proyecto independiente
de Vestuario. Se mantienen RLS, acceso ADMIN y funcionamiento con conexión.
No se modifica Entradas, no se despliega y no se inicia la fase 8.

Verificación final: migración local/remota idéntica y cero registros temporales QA restantes
en series, bloques, actuaciones, uniformes, personas, prendas, cesiones, auditoría y peticiones.

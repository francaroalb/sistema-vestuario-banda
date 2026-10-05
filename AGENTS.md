# Gestión de trajes

Aplicación independiente de `../sistema-entradas-banda`. Usar Entradas solo como referencia; no modificarla.

## Trabajo por fases

- Fases 0 a 4 y refinamiento visual aprobados. Fase 5 y revisión de tarjetas aprobadas. Fase 6 y rediseño del inicio aprobados. Fase 7 aprobada. Fase 8 aprobada. Refinamientos posteriores aprobados. Fase 9 de productividad implementada; pendiente de validación del usuario.
- NO comenzar fase 10 ni funcionalidades posteriores sin autorización expresa del usuario.
- Actuaciones individuales, uniformes, refuerzos y asignaciones básicas disponibles. Series y preparación por periodos disponibles en fase 6; recomendador disponible en fase 7; conflictos y permanencia de prendas disponibles en fase 8. Importación CSV y duplicación de agendas disponibles en fase 9. Actividad reciente retirada por petición del usuario; se conserva la auditoría interna.
- Nombre visible: Gestión de trajes. Inicio operativo sin mensajes promocionales; navegación inferior burdeos, cabecera/lateral claros y logo de la Banda.
- Refinamiento visual autorizado antes de fase 5: seguir los tokens de `src/styles.scss` y `docs/sistema-visual.md`; no alterar flujos ni arquitectura por cambios de UI.
- Preferencia de UI: tarjetas compactas, datos y acciones en paralelo cuando caben; destacar nombres, códigos, tallas y estados con la paleta existente, sin ocultar contenido.
- Al acabar cada fase: explicar cambios, pruebas, decisiones y detenerse.

## Decisiones aprobadas

- Angular standalone, Signals, Supabase independiente, PostgreSQL/RLS, Cloudflare Pages, PWA.
- Un único rol ADMIN; sin registro público.
- Operaciones con conexión; no sincronización ni escrituras offline.
- Actuaciones futuras con fecha/hora de inicio y fin, zona Europe/Madrid. Disponibilidad por intervalos horarios, no por días completos.
- Estado físico, asignación futura y posesión real son conceptos separados.
- Perfiles y RLS mínimos adelantados a fase 1 con autorización expresa.
- Firma de futuras operaciones solo confirmada: nunca almacenar imagen.

## Desarrollo

- Ejecutar `nvm use` (Node 22.22.3) antes de instalar, compilar o probar.
- `npm start`: desarrollo en 4201. `npm run build && npm run preview`: PWA en 4301.
- `npm test`, `npm run test:db`, `npm run build`, `npm run test:e2e`.
- Tests reales: `REAL_AUTH=1 npm run test:e2e -- --grep 'Supabase real'` con credenciales locales.
- `.env`, `.local/`, `public/app-config.json`, resultados de pruebas y `dist/` se excluyen de Git.
- Nunca imprimir credenciales ni copiar credenciales o datos del proyecto de Entradas.
- La clave publicable del frontend no concede acceso por sí sola. RLS y permisos de PostgreSQL son obligatorios.
- No relajar RLS para que pase una prueba; corregir el flujo o los datos de prueba.

Consulta `docs/prompt-maestro.md`, `docs/arquitectura.md` y `README.md` antes de ampliar el proyecto.
Las decisiones posteriores aprobadas en arquitectura prevalecen sobre la propuesta inicial del prompt.

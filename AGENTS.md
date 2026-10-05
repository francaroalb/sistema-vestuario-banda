# Gestión de trajes

Aplicación independiente de `../sistema-entradas-banda`. Usar Entradas solo como referencia; no modificarla.

## Trabajo por fases

- Fases 0 y 1 aprobadas. Fase 2 autorizada: inventario y ajustes visuales solicitados.
- NO comenzar fase 3 ni funcionalidades posteriores sin autorización expresa del usuario.
- Actuaciones, Personas y Cesiones siguen como espacios reservados. Inventario es operativo en fase 2.
- Nombre visible: Gestión de trajes. Inicio operativo sin mensajes promocionales; navegación burdeos y logo de la Banda.
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

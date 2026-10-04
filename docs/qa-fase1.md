# Validación de fase 1 — 5 de octubre de 2026

## Resultado

- Compilación de producción correcta con Angular 22.2.1 y Node 22.22.3.
- Paquete inicial: 481,38 kB; transferencia estimada: 120,14 kB (sin contar recursos diferidos).
- 7 pruebas unitarias correctas.
- 5 escenarios RLS correctos en PostgreSQL aislado (PGlite).
- 12 pruebas de navegador correctas: 6 escritorio y 6 móvil emulado en Chrome.
- Login, persistencia, recarga, logout y PWA verificados contra Supabase real.
- Comprobación remota adicional: perfil propio legible, acceso anónimo rechazado y edición
  administrativa desde la clave publicable denegada.
- Contraseña incorrecta real devuelve `invalid_credentials` y el cliente traduce ese código.
- Registro público desactivado y perfil inicial ADMIN activo.
- Manifest e iconos servidos correctamente; service worker registrado; caché sin peticiones
  a Supabase ni configuración de conexión.
- Capturas de login/inicio revisadas en escritorio y móvil, sin desbordamiento horizontal.
- Credenciales locales excluidas de Git y sin secretos en los archivos versionados.
- Aplicación de Entradas sin cambios respecto al estado inicial.

## Alcance exacto

Las pruebas de errores y usuarios sin perfil utilizan respuestas controladas de Supabase.
Las pruebas de login real utilizan exclusivamente el proyecto independiente de Vestuario.
Los escenarios RLS locales simulan las identidades/roles de Auth y ejecutan la migración real.

La emulación móvil en Chrome **no es una prueba de Safari/iOS ni de Android físico**.
Instalación real en esos dispositivos, validación completa de accesibilidad y despliegue con
HTTPS/dominio quedan pendientes de la fase de QA/producción o una revisión expresamente autorizada.

No se han implementado tablas ni operaciones de inventario, personas, cesiones, actuaciones,
series, firma, recomendador ni conflictos. Las rutas son espacios reservados dentro del shell.

Comandos y pruebas manuales: consultar [README](../README.md).

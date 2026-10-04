# Vestuario BML

Aplicación privada de la Banda Municipal Ntra. Sra. del Valle de La Palma del Condado.

**Fase 1:** Angular 22.2.1, identidad visual BML, login real con Supabase, sesión persistente,
autorización ADMIN, logout, navegación responsive y base PWA. Las secciones de negocio todavía
no están implementadas. No se ha desplegado en Cloudflare ni se ha configurado el dominio.

## Arrancar en este equipo

```sh
cd /Users/francaroalbarran/Desktop/Proyectos/sistema-vestuario-banda
nvm use
npm ci
npm start
```

Abrir **http://localhost:4201**. El `.env` local ya está conectado al Supabase de Vestuario.
En este equipo se ha creado el administrador solicitado por el usuario. El inicio de sesión se
hace con su **correo**, no con el nombre visible. Las credenciales no están en Git; se conservan
en `.local/admin.json`, con permisos restringidos.

`npm ci` solo es necesario al preparar un checkout o cambiar el lockfile.
Si no utilizas nvm, instala una versión de Node compatible con `package.json`.

## Probar la fase 1

1. Abrir `/inventario` sin sesión: debe mostrar el login.
2. Enviar el formulario vacío: aparecen errores junto a los campos.
3. Probar una contraseña incorrecta: aparece un mensaje comprensible.
4. Entrar con la cuenta autorizada: se muestra el inicio y el nombre del administrador.
5. Recargar la página: la sesión se conserva y se verifica el perfil activo.
6. Recorrer las cinco secciones: las cuatro de negocio indican que están en preparación.
7. Pulsar **Salir**, recargar o volver atrás: no debe mostrarse contenido privado.
8. En herramientas de desarrollo, alternar móvil, tablet y escritorio: navegación inferior en
   móvil/tablet y lateral a partir de 1024 px. No debe existir scroll horizontal.
9. Desconectar la red una vez abierto el login: aviso visible y acceso deshabilitado.

## Probar la PWA

El service worker está desactivado en desarrollo. Para comprobar instalación y caché:

```sh
npm run build
npm run preview
```

Abrir **http://127.0.0.1:4301** en Chrome. Comprobar en Application:

- Manifest: nombre, iconos 192/512 y modo `standalone`.
- Service Workers: registro activo de `ngsw-worker.js`.
- Instalar desde la barra del navegador o el botón que aparezca en la aplicación.
- Reabrir desde el icono instalado y comprobar el login y la persistencia de sesión.
- Cache Storage contiene únicamente recursos estáticos, nunca Supabase ni `app-config.json`.

La PWA requiere internet para verificar el acceso y operar. En un arranque sin red se presenta
el acceso sin habilitar operaciones; no se guardan datos privados para uso offline.

Para instalar en un **iPhone o Android físico** se necesita una URL HTTPS accesible desde ese
dispositivo. `localhost` de este equipo no es una URL accesible desde el teléfono. La prueba
completa en Safari/iOS y Android físico se hará con esa URL, sin adelantar el despliegue final.
En iPhone: Safari → Compartir → Añadir a pantalla de inicio. En Android: menú de Chrome → Instalar.

## Configuración de Supabase

Proyecto independiente: `vestuario-bmlapalma`, región `eu-west-1`, organización Free.

[Abrir el proyecto en Supabase](https://supabase.com/dashboard/project/vbrtkmufrtfuanimmqyp)

En otro equipo:

```sh
cp .env.example .env
```

Completar `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. La clave debe ser publishable o anon.
El generador rechaza claves secretas/service_role. No se debe guardar ninguna credencial
administrativa en estas variables. `public/app-config.json` se genera antes de iniciar/compilar
y se excluye de Git; su contenido es configuración pública destinada al navegador.

El alta pública y el acceso anónimo de Auth están desactivados. Solo un usuario autenticado
con un perfil propio activo y rol ADMIN entra en la aplicación. RLS impide acceso anónimo y
los permisos SQL prohíben que el navegador cree, modifique o elimine administradores.

La migración `supabase/migrations/20261005000100_admin_access.sql` ya está aplicada en este
proyecto y registrada en `supabase_migrations.schema_migrations`. Incluye únicamente perfiles,
RLS y una función privada de autorización para las siguientes fases.

Para gestionar otro administrador desde Supabase:

1. Authentication → Users → Add user → Create new user; establecer correo y contraseña,
   y confirmar su correo administrativamente. No enviar una invitación si no se quiere correo.
2. Copiar su UUID y ejecutar como administrador en SQL Editor:

```sql
insert into public.admin_profiles (user_id, display_name)
values ('UUID_DEL_USUARIO', 'Nombre visible');
```

Para desactivarlo, conservar el registro y ejecutar:

```sql
update public.admin_profiles set active = false where user_id = 'UUID_DEL_USUARIO';
```

RLS aplica el cambio inmediatamente a nuevas consultas. La interfaz revalida el perfil al
navegar y al regresar a la pestaña. No se crea un sistema adicional de roles.

Las futuras migraciones se aplicarán con Supabase CLI enlazada **al proyecto de Vestuario**.
No ejecutar reset remoto ni enlazar al proyecto de Entradas.

## Verificaciones automatizadas

```sh
npm test
npm run test:db
npm run build
npm run test:e2e
```

- Unitarias: autorización, revocación, respuestas tardías, errores y destinos seguros.
- Base de datos: ejecuta la migración y RLS en PostgreSQL aislado con PGlite. Solo se simulan
  el esquema de identidad y los roles de Supabase; no reemplaza la comprobación remota.
- Navegador: Playwright con Google Chrome instalado; escritorio y móvil emulado. Simula
  respuestas de Supabase para errores, perfiles inactivos y navegación sin modificar cuentas reales.
- Las pruebas contra el proyecto real se activan explícitamente y leen `.local/admin.json`:

```sh
REAL_AUTH=1 npm run test:e2e -- --grep 'Supabase real'
```

El archivo local necesita `email`, `password` y `display_name`. No se guarda ningún estado de
sesión, traza ni contraseña en el repositorio. Las capturas se guardan en `.local/screenshots/`.

## Estructura y mantenimiento

- `src/app/core`: configuración, cliente tipado, autenticación, guards y conectividad.
- `src/app/shared/ui`: iconos y ayuda de instalación.
- `src/app/layout`: shell y navegación responsive.
- `src/app/features`: login, inicio vacío y espacios reservados.
- `src/styles.scss`: tokens heredados de Entradas, botones, campos, tarjetas y accesibilidad.
- `supabase/migrations`: cambios de base de datos versionados.

`npm run build:production` exige una configuración real. La preparación del despliegue
Cloudflare Pages y `trajes.bmlapalma.com` corresponde a la fase de producción.
No se publica nada automáticamente desde este proyecto.

Los logotipos y las tipografías conservan la identidad de Entradas. Los iconos PWA de Vestuario
se generan desde el SVG propio con `node scripts/generate-icons.mjs` (requiere Chrome).

Ver [decisiones de arquitectura](docs/arquitectura.md). **Esperar aprobación antes de fase 2.**

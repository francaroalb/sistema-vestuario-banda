# Gestión de trajes

Aplicación privada de la Banda Municipal Ntra. Sra. del Valle de La Palma del Condado.

**Fase 2 completada:** acceso privado, inicio operativo e inventario conectado a Supabase.
Permite crear, buscar, filtrar, consultar, editar, archivar y reactivar prendas individuales.
Incluye auditoría de cambios, protección contra códigos duplicados y ediciones simultáneas.
Personas, Cesiones y Actuaciones siguen pendientes de sus fases. No se ha desplegado en
Cloudflare ni se ha configurado el dominio.

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

## Probar la fase 2

1. Iniciar sesión con el correo autorizado. El inicio muestra **Nueva prenda**, **Buscar prenda**
   y los recuentos reales por estado físico.
2. Crear una Chaqueta con un código propio único, talla y observaciones. Código y talla admiten
   texto libre; se guardan sin espacios exteriores y en mayúsculas. No hay formato rígido de etiqueta.
3. Abrir su ficha y recargar: la información debe persistir.
4. Editar observaciones o cambiar entre Disponible, Pendiente de lavandería y Dañada.
5. Buscar por parte del código, desplegar **Filtros** y combinar tipo, talla exacta y estado.
   Al volver desde una ficha se conserva la búsqueda. Hay páginas de 24 prendas.
6. Archivar desde la ficha y confirmar. Desaparece de Activas; puede consultarse en Archivadas
   y reactivarse conservando su identidad e información. Su código sigue reservado.
7. Intentar crear otra prenda con ese código: debe explicar el duplicado y conservar el formulario.
8. Abrir una misma ficha en dos pestañas, editar y guardar en una, después guardar en la otra:
   debe avisar del conflicto sin sobrescribir ni perder el borrador. **Recargar ficha** pide confirmación.
9. Desconectar la red durante una edición: se conserva lo escrito y se deshabilita Guardar.
10. Revisar móvil, tablet y escritorio: navegación inferior burdeos en móvil y lateral en escritorio.
    Pulsar Salir y comprobar que las rutas privadas vuelven al login.

Los cambios realizados manualmente son reales. Para retirar una prenda de prueba, archívala.
Las pruebas automatizadas solo eliminan sus propios registros sintéticos identificados por UUID.

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

Las migraciones de `supabase/migrations/` están aplicadas y registradas en
`supabase_migrations.schema_migrations`: acceso ADMIN, inventario y respuesta HTTP 409 a
conflictos de edición. Las escrituras de inventario pasan por RPC transaccionales que verifican
el administrador y la versión. El navegador no puede borrar prendas ni modificar la auditoría.

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

El archivo local necesita `email`, `password`, `display_name` e `id`. No se guarda ningún estado de
sesión, traza ni contraseña en el repositorio. Las capturas se guardan en `.local/screenshots/`.
Las pruebas reales de inventario crean prendas temporales y eliminan exclusivamente sus UUID
al finalizar. Para esa limpieza requieren la sesión Supabase CLI de este equipo en el llavero
macOS; no extraen ni imprimen el token. Ejecutarlas solo en el proyecto independiente de Vestuario.

## Estructura y mantenimiento

- `src/app/core`: configuración, cliente tipado, autenticación, guards y conectividad.
- `src/app/shared/ui`: iconos y ayuda de instalación.
- `src/app/layout`: shell y navegación responsive.
- `src/app/features`: login, inicio con recuentos, inventario y espacios reservados.
- `src/styles.scss`: tokens heredados de Entradas, botones, campos, tarjetas y accesibilidad.
- `supabase/migrations`: cambios de base de datos versionados.

`npm run build:production` exige una configuración real. La preparación del despliegue
Cloudflare Pages y `trajes.bmlapalma.com` corresponde a la fase de producción.
No se publica nada automáticamente desde este proyecto.

Los logotipos y las tipografías conservan la identidad de Entradas. Los iconos PWA de Vestuario
se generan desde el SVG propio con `node scripts/generate-icons.mjs` (requiere Chrome).

Ver [decisiones de arquitectura](docs/arquitectura.md). **Esperar aprobación antes de fase 3.**
Ver [validación de fase 2](docs/qa-fase2.md).

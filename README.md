# Gestión de trajes

Aplicación privada de la Banda Municipal Ntra. Sra. del Valle de La Palma del Condado.

**Fase 8 implementada:** acceso privado, inventario, personas, cesiones con firma y preparación
individual de actuaciones. Incluye uniformes configurables, refuerzos y reservas por intervalos.
La asignación futura y la posesión real se muestran por separado. No se almacena ni transmite el dibujo de la firma.
Incluye series, participación conjunta y periodos de reserva con decisión mantener/dividir. Incluye recomendaciones por histórico, preparación asistida, conflictos y permanencia de prendas con revisión previa. No se ha desplegado en Cloudflare ni configurado el dominio.

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

## Probar la fase 3

1. Entrar y pulsar **Nueva persona** en Inicio o Personas.
2. Escribir nombre y apellidos; elegir **Refuerzo**. Añadir instrumento, teléfono y observaciones
   si se conocen, y guardar. Recargar la ficha para comprobar que los datos persisten.
3. Editar y cambiar a **Músico de la Banda**: debe mantenerse la misma ficha y dirección.
4. En Personas, buscar parte del nombre y combinar filtros de tipo e instrumento. Los filtros
   se conservan al entrar en una ficha y volver al listado. Las páginas contienen 24 personas.
5. Archivar desde la ficha. Ya no aparece en Activas; consultar Archivadas y reactivarla.
   Los datos y los cambios anteriores se conservan. Las fichas archivadas no son editables.
6. Abrir una ficha en dos pestañas y guardar cambios en ambas: la segunda debe avisar del
   conflicto y conservar el borrador. Recargar ficha solicita confirmación antes de descartarlo.
7. Con un formulario modificado, pulsar Cancelar: debe pedir confirmación. Sin conexión se
   deshabilita Guardar y se conserva el borrador en memoria mientras siga abierta la página.

Nombre y tipo son los datos necesarios. Instrumento, teléfono y observaciones son opcionales.
Los nombres no son únicos: se permiten homónimos, sin fusionar ni sobrescribir sus fichas.
Busca antes de crear para evitar altas repetidas de la misma persona.
No se introduce una talla habitual manual ni se inventa un historial de préstamos. El UUID
estable y la auditoría dejan preparado el histórico; las cesiones y movimientos de fase 4 lo utilizan.

## Probar la fase 4

1. Crear una persona y al menos tres prendas activas: dos del mismo tipo y otra adicional.
   Deben estar en estado Disponible y físicamente en la Banda.
2. Pulsar **Nueva cesión**, seleccionar la persona y dos prendas. La devolución prevista es
   opcional, siempre en hora de Madrid. Dejarla vacía crea una cesión sin fecha prevista.
3. Pulsar **Revisar y firmar**. Comprobar el resumen. Con firma vacía o un simple toque no
   se habilita Confirmar; dibujar con el dedo o el ratón. Limpiar permite repetir la firma.
4. Confirmar la entrega. En Inventario aparece quién tiene las prendas; su estado físico sigue
   siendo independiente. En Personas y en cada prenda aparecen accesos al histórico de cesiones.
5. Abrir la cesión → **Devolver prendas**. Seleccionar solo una, indicar Disponible, Pendiente de
   lavandería o Dañada, revisar y firmar. La cesión permanece activa mientras queden prendas pendientes.
6. Pulsar **Cambiar prenda**: seleccionar la prenda que devuelve, su estado y una disponible del
   mismo tipo que recibe. Una sola firma confirma devolución y entrega en la misma cesión.
7. Devolver la última prenda: la cesión pasa a Finalizada. Revisar sus movimientos con fechas,
   administrador, prendas y confirmación de firma.
8. Consultar Cesiones: Activas, Devolución vencida, Finalizadas o Todas. Buscar por el nombre
   registrado al entregar. Las fichas conservan código, tipo y talla originales del movimiento.
9. Probar dos sesiones entregando una misma prenda: solo una puede confirmar. Un formulario de
   devolución desactualizado debe pedir recargar. Sin internet se impide confirmar.

La firma es una comprobación presencial: el dibujo vive únicamente en el canvas y se descarta
al confirmar, volver a la selección o salir. Solo se guarda `signature_confirmed`, el responsable
y la fecha/hora. No se usa Storage ni se guardan trazos/base64. Cambiar la selección exige firmar de nuevo.
Si se pierde la respuesta de una operación, reintentar desde el mismo formulario recupera el movimiento
sin duplicarlo. No se puede archivar una persona o prenda con prendas físicamente pendientes.

Las horas de devolución se convierten en el servidor desde Europe/Madrid. Se rechazan fechas pasadas
y horas inexistentes o repetidas en el cambio horario para que la fecha prevista no resulte ambigua.

Estas operaciones son reales: para terminar una prueba manual hay que devolver sus prendas.

## Probar la fase 5

1. Entrar en **Actuaciones → Uniformes → Nuevo uniforme**. Poner un nombre y marcar los tipos
   requeridos, por ejemplo Chaqueta y Pantalón. No hay reglas fijas de verano/invierno.
2. Crear una **Nueva actuación**, elegir uniforme e indicar inicio y fin en hora de Madrid.
   Ajustar **Entrega prevista desde** y **Devolución prevista** para incluir la recogida anticipada
   y el tiempo de devolución. Por defecto coinciden con el horario de la actuación.
3. Abrir la preparación y pulsar **Añadir participante**. Buscar y seleccionar una persona existente.
   Si no existe, **No existe: crear refuerzo** requiere nombre e instrumento y la añade a Personas
   y a esta actuación dentro de la misma operación. Conserva su UUID e historial en futuras actuaciones.
4. Cada participante muestra una línea por tipo requerido. Pulsar **Asignar prenda**, buscar su
   código y elegir. Se muestran motivos concretos cuando una prenda no puede reservarse.
5. Consultar Inventario: aparece la reserva prevista; sigue físicamente en la Banda hasta la entrega.
   Las fichas de prendas y personas permiten consultar las asignaciones futuras y abrir su actuación.
6. Probar dos actuaciones el mismo día: sus periodos de prendas pueden ser adyacentes, pero no
   solaparse para una misma prenda. Se comprueba otra vez en servidor al guardar, incluso desde dos sesiones.
7. En preparación, pulsar **Entregar prendas**, revisar y firmar. La persona y las prendas proceden
   del plan; se puede quitar de esta entrega una prenda que aún no se recoge. Lo ya entregado cambia
   a **En su poder**. Una prenda que la persona ya tiene no exige otra entrega ni otra firma.
8. Pulsar **Devolver código** para registrar la devolución real, total o parcial, con el flujo de
   cesiones. Volver a la actuación muestra la nueva situación. Las reservas posteriores se conservan.
9. Editar horario o periodo vuelve a comprobar solapamientos. Cambiar el uniforme requiere quitar
   primero las asignaciones. Editar un uniforme no modifica los requisitos de actuaciones ya creadas.
10. **Cancelar actuación** libera sus reservas, conservando participantes, auditoría y cesiones reales.
    Se consulta en la vista Canceladas. No registra devoluciones ficticias.

Si una prenda está cedida a otra persona, solo admite reserva cuando su devolución prevista es futura
pero anterior o igual al inicio del periodo. Se avisa **Pendiente de devolución**: la entrega seguirá
bloqueada hasta recibirla realmente. Si cambian su estado físico, archivo o posesión, la preparación
muestra **Revisar disponibilidad**, conservando la asignación para decidir qué hacer.
Una recogida anticipada también comprueba las otras reservas desde el momento actual.

Si retiras a un participante y luego vuelves a añadirlo, sus prendas quedan pendientes de asignar.
Las antiguas reservas no se recuperan automáticamente; las cesiones y el historial se conservan.

La planificación no cambia retroactivamente la fecha prevista de una cesión real. Se conserva
la registrada al entregar. Quitar una asignación o participante tampoco cierra cesiones.
Las asignaciones de actuaciones individuales deben tener periodos separados. Para una cesión
continuada entre varias actuaciones, utiliza una serie y su preparación conjunta.
El recomendador y la resolución completa de conflictos no se adelantan.

## Probar la fase 6

1. Entrar en **Actuaciones → Series → Nueva serie**, por ejemplo «Semana Santa 2027».
2. Desplegar **Actuaciones** y completar primero la agenda. **Crear actuación para la serie**
   guarda y vincula la actuación en una sola operación. También puedes incorporar una existente
   sin participantes, no cancelada y que no pertenezca a otra serie.
3. Crear seis actuaciones: Domingo de Ramos, Martes, Miércoles, Jueves, Madrugá y Viernes.
   Madrugá y Viernes pueden compartir fecha con horarios distintos. El orden depende de la hora
   de inicio; si coinciden exactamente, se desempata por identificador.
4. Pulsar **Añadir participante**, buscar la ficha existente o crear un refuerzo con nombre e
   instrumento. Marcar las actuaciones en las que participa; **Marcar todas** agiliza el caso completo.
5. Si participa en actuaciones consecutivas, se crea un solo periodo automáticamente, aunque
   haya días libres entre ellas. Si falta a una actuación intermedia, hay que elegir **Mantener una
   única cesión** o **Dividir**. Sin elección explícita no se puede guardar.
6. Cada persona muestra sus periodos, actuaciones y tipos de prenda. **Asignar prenda** comprueba
   el intervalo entero, incluidos los huecos cuando conserva el vestuario. Una reserva incompatible
   en otro periodo o actuación impide seleccionarla y se revalida al guardar.
7. Desde el periodo, pulsar **Entregar prendas**, revisar el final previsto y firmar. Se crea una
   cesión física, con devolución prevista al final del periodo. Las actuaciones siguientes muestran
   **En su poder**, sin exigir entregas ni firmas repetidas. Si ya tenía físicamente la prenda, se
   reutiliza esa posesión sin cambiar retroactivamente su cesión ni su fecha de devolución.
8. En la última actuación aparece **Última actuación — devolución prevista al finalizar**.
   Registrar la devolución real desde **Devolver**; también se admiten devoluciones parciales.
   Ninguna fecha, desmarcado o cambio de asignación registra una devolución ficticia.
9. **Editar participación** vuelve a preguntar por los huecos. Al guardar, avisa de que sustituye
   sus periodos y quita las asignaciones anteriores; hay que prepararlas de nuevo. Desmarcar todas
   retira al participante. Los movimientos y sus datos anteriores permanecen en el historial/auditoría.
10. Probar dos pestañas: un plan obsoleto no sobrescribe el nuevo; hay que recargar. Sin conexión,
    el borrador permanece en la página y se deshabilitan las operaciones.

Para modificar la agenda, los horarios o cancelar una actuación con preparación conjunta, primero
retira las participaciones de la serie; después vuelve a prepararlas. Se bloquea esa retirada cuando
el periodo conserva líneas entregadas sin devolver. Esta decisión evita cambiar silenciosamente
las reservas o una elección previa sobre los huecos. Cambiar el nombre de la serie sí está permitido.

Si los periodos previstos de dos bloques separados se solapan, se pide ajustar los horarios de
recogida/devolución o mantener una única cesión. Cuando se necesitan uniformes distintos dentro de
un mismo periodo, se prepara la unión de sus tipos de prenda para conservarlos hasta el final.

Los listados muestran 24 series y 12 participantes por página. Cada serie admite 60 actuaciones
y 200 personas. Mantiene la navegación principal de cinco secciones y las tarjetas compactas.

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
conflictos de edición, más Personas, Cesiones, Actuaciones, Series y Recomendaciones. Las escrituras de inventario, personas, cesiones y planificación pasan
por RPC transaccionales que verifican el administrador y la versión. El navegador no puede borrar
prendas/personas ni modificar la auditoría.

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
Las pruebas reales de inventario, personas, cesiones y actuaciones crean registros temporales y eliminan exclusivamente sus UUID
al finalizar. La limpieza administrativa está centralizada en `tests/e2e/admin-query.ts`. Por defecto
utiliza la sesión Supabase CLI del llavero macOS; el token se usa internamente y no se imprime ni se guarda en el repositorio. Ejecutarlas solo en el proyecto independiente de Vestuario.

## Estructura y mantenimiento

- `src/app/core`: configuración, cliente tipado, autenticación, guards y conectividad.
- `src/app/shared/ui`: iconos y ayuda de instalación.
- `src/app/layout`: shell y navegación responsive.
- `src/app/features`: login, inicio operativo, inventario, personas, cesiones, actuaciones y uniformes.
- `src/styles.scss`: tokens heredados de Entradas, botones, campos, tarjetas y accesibilidad.
- `supabase/migrations`: cambios de base de datos versionados.

`npm run build:production` exige una configuración real. La preparación del despliegue
Cloudflare Pages y `trajes.bmlapalma.com` corresponde a la fase de producción.
No se publica nada automáticamente desde este proyecto.

Los logotipos y las tipografías conservan la identidad de Entradas. Los iconos PWA de Vestuario
se generan desde el SVG propio con `node scripts/generate-icons.mjs` (requiere Chrome).

Ver [decisiones de arquitectura](docs/arquitectura.md). **Esperar aprobación antes de fase 9.**
Ver [sistema visual y refinamiento de la interfaz](docs/sistema-visual.md).
Ver [validación de fase 2](docs/qa-fase2.md).

Ver [validación de fase 3](docs/qa-fase3.md).

Ver [validación de fase 4](docs/qa-fase4.md).

Ver [validación y decisiones de fase 5](docs/qa-fase5.md).

En este equipo, si el llavero tarda demasiado, está disponible la alternativa SQL local con TLS verificado:

```sh
REAL_AUTH=1 VESTUARIO_QA_SQL_RUNNER=.local/query-db.mjs npm run test:e2e
```

Este ejecutor y sus credenciales están excluidos de Git. La variable indica un ejecutor Node local
que recibe por stdin exclusivamente el SQL de limpieza de las pruebas. No se usa desde la aplicación.
También se puede proporcionar `VESTUARIO_QA_MANAGEMENT_TOKEN` temporalmente al proceso de QA para
usar la API de gestión sin acceder al llavero en cada limpieza. Ninguna de estas variables se copia al frontend.

Ver [validación y decisiones de fase 6](docs/qa-fase6.md).


## Probar la fase 7

En una actuación individual o una serie, pulsa **Ver propuestas** en **Preparación asistida**.
La vista previa muestra las asignaciones claras, los casos que necesitan revisión y las
asignaciones anteriores que se conservarán. **Aplicar N propuestas** confirma el conjunto.
No registra entregas ni devoluciones físicas.

Al pulsar **Asignar prenda** también aparece la recomendación de esa persona y tipo de prenda,
con su histórico y alternativas. Puedes elegir una propuesta o usar el selector manual.
Las personas sin histórico, los empates y las tallas superiores necesitan revisión manual.

Ver [reglas y validación de fase 7](docs/qa-fase7.md).


## Probar la fase 8

- **Inicio → Conflictos y avisos**: muestra los conflictos y las devoluciones previstas que
  conviene comprobar. También se puede entrar desde Actuaciones. Cada periodo de una serie
  se cuenta una vez, aunque incluya varias actuaciones.
- **Cesiones → Abrir una cesión → Registrar que mantiene prendas**: disponible en cesiones
  activas con devolución prevista. Selecciona las prendas y pulsa **Revisar impacto**.
  Puedes cancelar sin cambios o confirmar **Mantener igualmente** si afecta a otras reservas.
- La cesión continúa abierta y conserva su fecha prevista original. Se registra quién tomó
  la decisión, cuándo y qué prendas/asignaciones estaban afectadas. No se crea una devolución.
- Desde una incidencia puedes revisar la asignación, registrar una devolución real o revisar
  el estado de la prenda. Cambiar la prenda en una serie actualiza todo el bloque.
- Al devolver, reparar, completar la lavandería o sustituir una asignación, la incidencia
  desaparece si ya no hay otra causa. Pulsa **Actualizar** para consultar los últimos cambios.
  Las reservas nunca se eliminan automáticamente por un conflicto.

Ver [validación y decisiones de fase 8](docs/qa-fase8.md).

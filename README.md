# Nova Salud — Inventario, ventas y despliegue

Aplicación React/Vite con API Express, autenticación real y base de datos compatible con SQLite mediante el cliente oficial `@libsql/client`.

## Arquitectura

| Parte | Servicio | Configuración |
|---|---|---|
| Base de datos | Turso | Base remota compatible con libSQL/SQLite |
| Backend | Render Web Service | Carpeta `backend`, plan Free, sin disco |
| Frontend | Vercel | Carpeta `frontend`, framework Vite |

Los datos se guardan en Turso y permanecen cuando Render se reinicia o se vuelve a desplegar. En desarrollo también puedes usar un archivo SQLite local sin cuenta de Turso.

Turso dispone de un plan gratuito con cuotas. Render Free puede suspenderse por inactividad y tardar alrededor de un minuto en responder a la primera solicitud. El cliente espera hasta 90 segundos; si falla, espera y vuelve a intentar. Consulta los límites vigentes antes de elegir el plan.

**Vercel Hobby está limitado a uso personal no comercial.** Para una demostración personal puedes usarlo; para operar la intranet de una botica, utiliza un plan adecuado o el frontend estático en Render descrito más abajo. Render también recomienda sus servicios gratuitos para pruebas y prototipos, no para aplicaciones de producción que requieren disponibilidad continua.

## 1. Preparar el repositorio

Necesitas Node.js 22.18.x, npm, Git y cuentas en GitHub, Turso y los proveedores de hosting elegidos.

1. Revisa los cambios del proyecto y súbelos a tu repositorio de GitHub.
2. Incluye `backend/package-lock.json`, `render.yaml`, `frontend/vercel.json` y los archivos `.env.example`.
3. Los archivos `.env`, bases locales y contraseñas están excluidos de Git. No subas el token de Turso ni lo incluyas en variables que comiencen con `VITE_`: esas variables se publican en el navegador.

## 2. Crear la base de datos en Turso

1. Entra en [Turso](https://app.turso.tech/) y elige el plan gratuito si se ajusta a tu uso.
2. Crea una base llamada, por ejemplo, `nova-salud`, compatible con el SDK libSQL. Elige una región cercana a la región del backend de Render.
3. Copia la URL de conexión, con forma `libsql://tu-base-tu-organizacion.turso.io`.
4. Genera un token para esa base con permisos de lectura y escritura. Guarda su fecha de vencimiento para renovarlo a tiempo. El token de base de datos es distinto del token de administración de la cuenta.
5. No hace falta ejecutar SQL manualmente: el backend crea las tablas si no existen al conectarse. El inventario comienza vacío.

Si prefieres la CLI oficial de Turso, después de instalarla siguiendo su documentación:

```sh
turso auth login
turso db create nova-salud
turso db show nova-salud --url
turso db tokens create nova-salud
```

En Windows puedes usar el panel web; no necesitas instalar la CLI para continuar.

## 3. Crear el primer usuario desde tu computadora

Esto funciona incluso si tu plan gratuito de Render no ofrece acceso a una consola.

En una terminal, desde la raíz del repositorio:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Si ya tienes `.env`, edítalo en lugar de sobrescribirlo. Completa los siguientes valores con los datos reales de Turso:

```dotenv
TURSO_DATABASE_URL=libsql://TU-BASE.turso.io
TURSO_AUTH_TOKEN=TU-TOKEN-DE-BASE-DE-DATOS
FRONTEND_URL=http://localhost:5173
PORT=3001
ADMIN_USER=admin
ADMIN_NAME=Administrador
ADMIN_PASSWORD=TU-CONTRASENA-PRIVADA
```

Elige una contraseña de 12 a 128 caracteres. Si un valor contiene `#`, colócalo entre comillas en el archivo `.env`.

Ejecuta, dentro de `backend`:

```sh
npm run create-user
```

Este comando crea las tablas y el usuario **en Turso**, porque configuraste ambas variables `TURSO_*`. No crea una cuenta separada local. Después, elimina `ADMIN_PASSWORD` de `.env`. No configures `ADMIN_PASSWORD` como variable permanente en Render.

Para crear otro vendedor, cambia `ADMIN_USER`, `ADMIN_NAME` y `ADMIN_PASSWORD` y repite el comando. El comando solo crea cuentas nuevas; no reemplaza una contraseña existente. Todos los usuarios tienen acceso a inventario, reposición, ventas e historial; todavía no hay roles diferenciados ni recuperación de contraseña.

## 4. Publicar el backend en Render

En [Render](https://dashboard.render.com/):

1. Selecciona **New → Web Service** y conecta el repositorio de GitHub.
2. Elige la rama que contiene los cambios.
3. Configura:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Instance Type | Free |
| Health Check Path | `/health` |

Agrega estas variables de entorno:

| Variable | Valor |
|---|---|
| `NODE_VERSION` | `22.18.0` |
| `NODE_ENV` | `production` |
| `TURSO_DATABASE_URL` | La URL de tu base Turso |
| `TURSO_AUTH_TOKEN` | El token de lectura y escritura |
| `FRONTEND_URL` | `http://localhost:5173` temporalmente; después se cambia por el origen definitivo del frontend |

No agregues un disco ni configures `DATABASE_PATH` en Render. En producción, si falta la configuración de Turso, el servidor rechaza el arranque para evitar guardar datos en un archivo que se perdería.

Publica el servicio y espera a que esté activo. Guarda la dirección asignada, por ejemplo `https://nova-salud-api.onrender.com`. Abre `https://TU-API.onrender.com/health`: debe responder `{"ok":true}`.

También puedes desplegar mediante **New → Blueprint**, seleccionando el mismo repositorio. El archivo `render.yaml` ya define el backend Free y solicita las variables privadas. Elige el despliegue manual o Blueprint; no crees ambos para evitar dos servicios duplicados.

## 5. Publicar el frontend en Vercel

En [Vercel](https://vercel.com/), utiliza un plan compatible con el uso del proyecto:

1. Selecciona **Add New → Project** e importa el mismo repositorio.
2. Configura:

| Campo | Valor |
|---|---|
| Framework Preset | Vite |
| Root Directory | `frontend` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 22.x |

3. En Environment Variables, agrega para Production:

```dotenv
VITE_API_URL=https://TU-API.onrender.com/api
```

Usa la URL real de Render, incluye `/api` y no agregues una barra después. No agregues ninguna variable `TURSO_*` al frontend.

4. Publica el proyecto y copia su dirección definitiva, por ejemplo `https://nova-salud.vercel.app`.
5. En Render, cambia `FRONTEND_URL` por esa dirección, **sin** `/api`, rutas ni barra final; guarda y vuelve a desplegar el backend.
6. Abre el frontend e ingresa con el usuario creado en el paso 3.

`frontend/vercel.json` ya incluye la reescritura necesaria para abrir y recargar `/dashboard`. Si cambias `VITE_API_URL`, debes volver a compilar/desplegar el frontend: no se actualiza dentro de una compilación existente.

Para permitir también desarrollo local, configura en Render los orígenes separados por comas:

```dotenv
FRONTEND_URL=https://nova-salud.vercel.app,http://localhost:5173
```

Los despliegues Preview con otra dirección no están permitidos automáticamente. Agrega su origen exacto solo cuando lo necesites.

## 6. Alternativa: frontend estático en Render

Si eliges alojar también el frontend en Render:

1. Crea **New → Static Site** con el mismo repositorio.
2. Root Directory: `frontend`.
3. Build Command: `npm ci && npm run build`.
4. Publish Directory: `dist`.
5. Variable: `VITE_API_URL=https://TU-API.onrender.com/api`.
6. En **Redirects/Rewrites**, agrega Source `/*`, Destination `/index.html`, Action **Rewrite**.
7. Copia la URL del sitio estático a `FRONTEND_URL` del backend y vuelve a desplegarlo.

Esta alternativa también usa Turso y no necesita disco en Render. Revisa las cuotas y condiciones vigentes de los servicios gratuitos.

## 7. Verificar el despliegue

1. Comprueba que `/health` del backend responde correctamente.
2. Intenta entrar con una contraseña incorrecta: debe rechazarse.
3. Ingresa con la cuenta real, crea un producto y registra una venta.
4. Revisa el descuento de stock y el nombre del vendedor en el historial.
5. Reinicia o vuelve a desplegar el backend: productos, usuarios y ventas deben permanecer.
6. Recarga `/dashboard`: debe continuar funcionando mientras la sesión esté vigente.
7. Cierra sesión e intenta abrir `/dashboard`: debe llevarte al login.

## Desarrollo local sin Turso

En `backend/.env`, deja vacías `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`, elimina `NODE_ENV=production` si lo tenías y configura `DATABASE_PATH=./data/nova.sqlite`. Ejecuta `npm run create-user` con las credenciales locales y después `npm start`.

En otra terminal, desde la raíz:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

En `frontend/.env`: `VITE_API_URL=http://localhost:3001/api`. El frontend se abre normalmente en `http://localhost:5173`.

La base local y la base Turso son independientes. Cambiar la URL no importa datos previos automáticamente. Para pasar una base local con datos a Turso, utiliza su procedimiento de importación hacia una base nueva y verifica el contenido antes de cambiar la conexión.

## Seguridad y mantenimiento

- Contraseñas almacenadas con scrypt y sal aleatoria. Tokens aleatorios de sesión de 8 horas; en la base solo se almacena su hash SHA-256.
- El navegador guarda la sesión en `sessionStorage`, por pestaña. El cierre de sesión revoca el token en el servidor. Evita insertar HTML no confiable, porque un XSS podría acceder al token.
- Todas las rutas de negocio requieren autenticación. El servidor toma el vendedor del usuario autenticado.
- Venta y descuento de stock usan una transacción de escritura; si falla una operación, se revierte el conjunto. Los importes se guardan en centavos.
- Estadísticas del día calculadas con horario de Lima. Login limitado a 10 intentos fallidos por IP en 15 minutos.
- El backend confía en un salto de proxy en producción, adecuado para Render directo. Revisa esa configuración si agregas otro proxy.
- Renueva el token de Turso antes de su vencimiento, guarda el nuevo valor en Render y vuelve a desplegar.
- Configura copias de seguridad y prueba su restauración. La exportación `turso db export` puede corresponder a una instantánea que no incluya los últimos cambios; sigue la documentación oficial para sincronizar y verificar una copia actualizada. No subas respaldos con contraseñas y sesiones al repositorio.

## Problemas frecuentes

| Problema | Qué revisar |
|---|---|
| El backend no arranca | Ambas variables Turso, token vigente con escritura y conexión a la base |
| No acepta el usuario | Que `create-user` se ejecutó contra la misma base Turso de Render |
| Error CORS | `FRONTEND_URL` debe coincidir exactamente con el origen abierto en el navegador |
| El frontend llama a localhost | Configura `VITE_API_URL` en el proveedor y vuelve a desplegar el frontend |
| Primera petición muy lenta | Espera el arranque de Render Free; después reintenta si es necesario |
| Cambié de Turso a local y faltan datos | Son bases distintas; no existe sincronización automática |
| Error 429 al entrar | Espera hasta 15 minutos tras demasiados intentos fallidos desde la misma IP |
| El usuario ya existe | El comando crea cuentas; no cambia contraseñas existentes |

## Comprobaciones del proyecto

Dentro de `backend`: `npm test`. Las pruebas usan bases locales temporales, sin tocar Turso.

Dentro de `frontend`: `npm run build` y `npm run lint`.

La conexión remota real requiere que configures tu cuenta y credenciales; las pruebas locales no comprueban el acceso a una cuenta Turso.

## Documentación oficial

- [Turso: conexión desde JavaScript](https://docs.turso.tech/sdk/ts/quickstart)
- [Turso: precios y cuotas](https://turso.tech/pricing)
- [Turso: tokens de base de datos](https://docs.turso.tech/cli/db/tokens/create)
- [Turso: importación de datos](https://docs.turso.tech/cli/db/import)
- [Turso: exportación y limitaciones de las instantáneas](https://docs.turso.tech/cli/db/export)
- [Render: servicios gratuitos y limitaciones](https://render.com/docs/free)
- [Render: sitios estáticos](https://render.com/docs/static-sites)
- [Vercel: despliegue de Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: condiciones del plan Hobby](https://vercel.com/docs/plans/hobby)

## Reportes y descarga PDF

La pestaña Reportes consulta ventas por fechas (máximo 366 días, horario America/Lima), importes y unidades vendidas, venta promedio, desglose diario, Top 10 por unidades y ventas por vendedor. Incluye inventario actual, agotados, stock bajo y unidades para alcanzar el mínimo. El inventario es una fotografía actual: no se filtra por el periodo de ventas. Los valores a precio de venta no representan ganancias ni costos.

Descargar PDF genera un documento A4 con el periodo aplicado, fecha de generación, usuario solicitante y todas las tablas, incluyendo el inventario completo. Usa los datos disponibles al momento de descargar. Repite las cabeceras y numera las páginas en reportes largos; también permite exportar reportes sin ventas. No requiere instalar un navegador en Render ni guardar documentos en su disco.

Las rutas GET /api/reportes y GET /api/reportes/pdf requieren sesión. Ambas aceptan desde y hasta con formato YYYY-MM-DD; por defecto consultan el mes actual. Las pruebas verifican límites de fechas en Lima, totales, acceso, inventario y generación del PDF.

## Datos simulados para probar el sistema

En backend, ejecutar `npm run seed:demo` carga 30 productos marcados [DEMO], 3 vendedores con nombre (demo) y 240 ventas distribuidas en los últimos 60 días. Usa la conexión configurada: Turso si están definidas las variables TURSO_*, SQLite local en caso contrario. Las ventas descuentan el stock y conservan precios coherentes, con productos disponibles, agotados y de stock bajo. No borra ni actualiza los registros previos. La carga completa es una sola transacción y una marca en demo_cargas evita duplicados al repetir el comando.

Los vendedores ficticios tienen contraseñas aleatorias que no se muestran ni guardan en texto plano; utiliza tu cuenta habitual para ingresar. No ejecutes esta carga en una base con ventas reales: los datos demo aparecen en los mismos totales y reportes. No se ejecuta automáticamente al desplegar.

## Punto de venta con carrito

El diseño Búsqueda rápida reemplaza el selector único. Permite buscar por nombre sin distinguir tildes, agregar con Enter, filtrar disponibles o más vendidos, editar cantidades y quitar productos. El carrito se conserva por usuario en sessionStorage, en la misma pestaña, incluso al navegar a otros apartados o recargar. Vaciar requiere confirmación.

Una compra admite hasta 50 productos distintos y se registra como una operación de cobro con varias líneas. El servidor verifica precios y stock, calcula el total y guarda cabecera, artículos y descuento de existencias en una transacción. Si falla algo, revierte toda la compra. Un cambio de precio requiere actualizar y revisar el carrito antes de cobrar.

Métodos registrados: Efectivo, Yape / Plin y Tarjeta. El efectivo calcula el vuelto; los otros métodos registran un pago verificado manualmente por el vendedor. No hay integración con una pasarela ni cobro automático. No se solicitan datos de tarjeta.

Cada solicitud de cobro lleva una clave única persistida antes de enviarla. Ante una respuesta perdida, la compra queda pendiente y bloqueada para edición; Reintentar confirmación utiliza la misma clave y contenido, incluso después de recargar, para recuperar el resultado sin descontar stock otra vez. Si el servidor rechaza stock, precio o datos, el carrito vuelve a ser editable. No borres el almacenamiento de la pestaña mientras haya una confirmación pendiente.

Al iniciar el backend, una migración aditiva crea cobros y agrega ventas.cobroId. Las ventas existentes conservan sus registros, importes y stock; no se agrupan entre sí porque el modelo antiguo no registraba una compra con varios artículos. En el historial llevan serie H; las nuevas operaciones llevan serie V. Los reportes cuentan cada compra una sola vez y suman todas sus unidades e importes.

El historial muestra artículos, método de pago, importe recibido y vuelto cuando corresponde. Comprobante PDF está disponible al terminar la venta y desde Historial: descarga un documento interno, sin validez tributaria. No requiere disco en Render. Los registros históricos indican Sin registrar como método de pago; no se inventa esa información.

POST /api/ventas acepta items (productoId, cantidad, precioCentavos), metodoPago, recibidoCentavos y clave. GET /api/ventas devuelve operaciones agrupadas. GET /api/ventas/:id/comprobante descarga el comprobante autenticado; los identificadores son v-ID o h-ID. El formato de producto único anterior sigue aceptándose por compatibilidad, pero solo el nuevo contrato con clave garantiza reintentos sin duplicados.

Pruebas adicionales verifican el carrito, cambio, métodos, manipulación de importes, precios desactualizados, concurrencia, reversión completa, compatibilidad de la base previa y repetición de solicitudes después de un reinicio.


## Registro de abastecimiento y reposiciones

En **Inventario → Reponer stock** o **Alertas → Reponer Stock**, el usuario registra:

- Cantidad recibida, fecha de recepción y proveedor / razón social (obligatorios).
- Documento de referencia, costo unitario de compra y observaciones (opcionales).

El backend guarda en `reposiciones` el producto, proveedor, cantidades, stock anterior y posterior, fecha de recepción, fecha de registro y usuario responsable. El aumento de stock y su registro se confirman en una misma transacción. Una clave por solicitud evita duplicar ingresos al reintentar una operación cuya respuesta se perdió. El formulario conserva esa solicitud en la sesión del navegador hasta confirmar el resultado.

El **Historial de abastecimiento** del Inventario muestra los últimos 100 ingresos y permite desplegar sus detalles. Las reposiciones anteriores a esta función no se reconstruyen; las existencias actuales se conservan. El proveedor se guarda como texto en cada ingreso y no requiere un catálogo previo. El costo es informativo y no modifica el precio de venta ni incorpora cálculos de utilidad a los reportes.

La tabla se crea automáticamente al iniciar el backend actualizado, tanto en SQLite local como en Turso. No es necesario reiniciar ni borrar la base de datos. Para publicar esta función se deben desplegar los cambios del backend y del frontend.

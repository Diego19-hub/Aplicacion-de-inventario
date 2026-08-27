# Aplicación de inventario

Aplicación SaaS de inventario con frontend React, API Express y PostgreSQL.

## Estado y problema que resuelve

La aplicación permite administrar categorías, productos con SKU y existencias por ubicación. Incluye cuentas, sesiones y un historial inmutable de movimientos.

La arquitectura v2 usa una sola base PostgreSQL para muchos negocios. Los datos del dominio se separan con `business_id`; las pertenencias y permisos viven en `business_members`. `super_admin` es un rol global independiente de los roles de cada negocio.

## Funcionalidades verificadas

- Listado, creación, edición y eliminación protegida de categorías mediante React y API JSON. La categoría predeterminada del negocio permite crear productos sin elegir otra categoría.
- Listado, creación, edición, archivado y restauración de productos mediante React y API JSON. El listado admite búsqueda por nombre o SKU, filtro por categoría y paginación dentro del negocio activo. El SKU es único por negocio, editable y se genera automáticamente si se omite al crear.
- Solo el owner puede archivar y restaurar productos. El archivado conserva SKU y datos actuales; el historial completo de archivos/restauraciones se incorporará con la futura auditoría y movimientos de inventario.
- El stock se conserva para lectura rápida y cambia exclusivamente mediante movimientos inmutables transaccionales; costos y valoración contable quedan pendientes de decisión.
- Registro, inicio y cierre de sesión con bcrypt y sesiones PostgreSQL.
- Roles globales `user` y `super_admin`; los permisos cotidianos dependen de la membresía activa (`owner`, `manager` o `viewer`).
- El owner del negocio activo administra miembros e invitaciones; estas usan un token de un solo uso almacenado exclusivamente como hash SHA-256 y vencen a los 30 días.
- Validación de formularios, CSRF en mutaciones de la API, Helmet y rate limiting para autenticación.

## Stack y arquitectura

- Node.js, JavaScript ESM, Express 5, React, Vite y CSS propio.
- PostgreSQL con `pg`, `express-session`, `connect-pg-simple`, bcrypt, `csrf-sync` y `express-validator`.
- Helmet y `express-rate-limit` para defensas HTTP.

```text
client/ React → /api JSON → routes/apiRouter → controllers/api* → db/*Queries → PostgreSQL
```

- `client/`: aplicación React con Vite.
- `routes/apiRouter.js`: endpoints JSON de la aplicación.
- `controllers/api*.js`: flujo HTTP de la API.
- `middleware/`: validación, errores, autorización y seguridad.
- `db/`: pool, consultas y scripts SQL.
- `client/dist`: frontend compilado servido por Express en producción.

## Instalación local

Requiere Node.js, npm y PostgreSQL.

```bash
git clone <URL_DEL_REPOSITORIO>
cd Aplicacion-de-inventario
npm install
npm run client:install
```

Crea `.env` local (nunca lo subas a Git):

```env
DATABASE_URL=postgresql://usuario_local:password_local@localhost:5432/inventario_local
# Alternativa en despliegue:
# POSTGRES_URL=postgresql://usuario_despliegue:password_despliegue@host:5432/inventario
SESSION_SECRET=una_cadena_larga_aleatoria_de_ejemplo
PORT=3000
NODE_ENV=development
```

Para una base local de desarrollo puedes cargar datos de ejemplo:

```bash
npm run db:seed
npm run dev
```

En otra terminal, inicia Vite para el frontend React:

```bash
npm run dev:client
```

En desarrollo:

- Express sigue en `http://localhost:3000`.
- Vite sigue en `http://localhost:5173`.
- Vite reenvía `/api` a Express.
- La interfaz se abre desde Vite; Express mantiene la API y sesiones.

## Scripts

| Script | Descripción |
| --- | --- |
| `npm start` | Inicia Express con Node. |
| `npm run dev` | Inicia Express en modo watch. |
| `npm run dev:client` | Inicia Vite para React en `localhost:5173`. |
| `npm run client:install` | Instala dependencias del frontend React. |
| `npm run client:build` | Compila `client/` hacia `client/dist`. |
| `npm run build` | Alias raíz para compilar el frontend React. |
| `npm run db:seed` | Carga datos de ejemplo. |
| `npm run db:bootstrap` | Inicializa una base PostgreSQL vacía con esquema, migraciones e historial. |
| `npm run db:migrations:status` | Muestra el estado del historial de migraciones. |
| `npm run db:migrations:baseline` | Registra 001–010 como baseline en una base ya preparada. |
| `npm run db:migrations:up` | Aplica migraciones pendientes mediante el runner. |

## Despliegue conjunto

En producción, Express sirve el contenido compilado de `client/dist` y mantiene
sin cambios:

- `/api` para la API JSON.
- la sesión `httpOnly`, CSRF, Helmet y rate limiting.

Las rutas SPA del frontend React se resuelven con `index.html`:

- `/app` y cualquier ruta bajo `/app/*`
- `/login`
- `/register`
- `/select-business`
- `/invitations/*`

La ruta `/` redirige a `/app`. Las rutas desconocidas de frontend cargan React
para mostrar su 404 interno. Las rutas desconocidas bajo `/api/*` responden
JSON.

Flujo recomendado para producción:

```bash
npm install
npm run client:install
npm run build
NODE_ENV=production npm start
```

## Base de datos

Tablas actuales: `businesses`, `business_members`, `business_invitations`, `categories`, `items`, `inventory_movements`, `business_locations`, `inventory_balances`, `suppliers`, `users` y `user_sessions` (creada por el almacén de sesiones). `items.stock` conserva el total agregado; cada movimiento inmutable pertenece a una ubicación activa y actualiza su balance local y el total en una transacción. Cada negocio tiene una ubicación principal `MAIN`.

### Inicializar una base vacía

`npm run db:bootstrap` prepara una base PostgreSQL vacía para un primer despliegue. El comando usa únicamente `DATABASE_URL` o `POSTGRES_URL`; no se ejecuta al iniciar la aplicación y requiere confirmación explícita del nombre de la base.

Variables requeridas:

```env
DATABASE_URL=postgresql://usuario:password@host:5432/inventario
DATABASE_BOOTSTRAP_CONFIRM=inventario
BOOTSTRAP_SUPER_ADMIN_USERNAME=admin
BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_SUPER_ADMIN_PASSWORD=una_password_larga
```

Uso:

```bash
npm run db:bootstrap
```

El bootstrap rechaza bases no vacías o con `schema_migrations` existente. Si pasa las defensas, aplica `db/auth-schema.sql`, `db/schema.sql` y las migraciones `001` a `015` en orden; después registra los checksums SHA-256 actuales en `schema_migrations`. La operación evita imprimir URL, usuario, contraseña o hash. Si ocurre un error durante la preparación transaccional, PostgreSQL revierte el esquema creado en esa ejecución.

## Seguridad y autorización

Las contraseñas se hashean con bcrypt. Las sesiones se guardan en PostgreSQL, se regeneran al autenticar y usan cookie `httpOnly`, `sameSite=lax` y `secure` en producción. CSRF se aplica después de `express.urlencoded()` y de la sesión, y cada formulario POST incluye `_csrf`.

La autorización es de servidor: los botones ocultos no conceden permisos. Cada acción de inventario y de miembros valida la membresía activa y el negocio activo; los recursos administrativos se consultan siempre dentro de su `business_id`.

## Inicio de sesión con Google

El login tradicional continúa disponible y el botón `Continuar con Google` usa OAuth 2.0/OpenID Connect con PKCE, `state`, `nonce` y validación del emisor, audiencia, firma y expiración del ID token.

Para habilitarlo localmente:

1. Crea un proyecto en Google Cloud y configura OAuth consent screen.
2. Crea un OAuth Client ID de tipo Web application.
3. Agrega `http://localhost:3000/api/auth/google/callback` como redirect URI autorizado.
4. Configura `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_CALLBACK_URL` desde `.env.example`.
5. En desarrollo el callback redirige a `http://localhost:5173`; en producción configura `FRONTEND_URL` con la URL pública HTTPS del frontend.

En producción registra la URL HTTPS real y configura las mismas variables en Dokploy/VPS. El secreto nunca debe comenzar con `VITE_` ni enviarse al frontend.

## Vercel y Supabase

`app.js` exporta la aplicación y evita abrir un puerto cuando existe `VERCEL`, por lo que está preparado para Vercel. En producción también sirve `client/dist` como frontend unificado. El pool acepta `DATABASE_URL` o `POSTGRES_URL`, compatibles con una base de Supabase.

No hay configuración de Vercel ni Supabase versionada. Antes de producción deben verificarse variables de entorno, migraciones, sesiones, backups y políticas de acceso.

## Roadmap

1. Estabilizar y documentar el MVP.
2. Diseñar el esquema multiempresa y migraciones.
3. Incorporar negocios, membresías y roles por negocio.
4. Añadir SKU, movimientos, sucursales, reportes y alertas.
5. Endurecer pruebas y operación del frontend React + API Express.
6. Completar y probar el módulo de Clientes y Cobranza.

Consulta [TASKS.md](TASKS.md) para el backlog y [AGENTS.md](AGENTS.md) para reglas de trabajo.

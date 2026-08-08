# Aplicación de inventario

MVP de inventario de productos de boxeo hecho con Express, EJS y PostgreSQL. Gestiona un solo inventario; la versión 2 preparará un SaaS multiempresa.

## Estado y problema que resuelve

La aplicación permite administrar categorías, productos con SKU y existencias por ubicación. Incluye cuentas, sesiones y un historial inmutable de movimientos.

La visión v2 es una sola base PostgreSQL para muchos negocios. Los datos del dominio se separarán con `business_id`; las pertenencias y permisos estarán en `business_members`. `super_admin` será un rol global independiente de los roles de cada negocio.

## Funcionalidades verificadas

- Listado, creación, edición y eliminación de categorías y productos mediante rutas, controladores y EJS. El listado admite búsqueda por nombre o SKU, filtro por categoría y paginación dentro del negocio activo. El SKU es único por negocio, editable y se genera automáticamente si se omite al crear.
- Solo el owner puede archivar y restaurar productos. El archivado conserva SKU y datos actuales; el historial completo de archivos/restauraciones se incorporará con la futura auditoría y movimientos de inventario.
- El stock se conserva para lectura rápida y cambia exclusivamente mediante movimientos inmutables transaccionales; costos y valoración contable quedan pendientes de decisión.
- Registro, inicio y cierre de sesión con bcrypt y sesiones PostgreSQL.
- Roles globales `user` y `super_admin`; los permisos cotidianos dependen de la membresía activa (`owner`, `manager` o `viewer`).
- El owner del negocio activo administra miembros e invitaciones; estas usan un token de un solo uso almacenado exclusivamente como hash SHA-256 y vencen a los 30 días.
- Validación de formularios, CSRF en los siete formularios POST, Helmet y rate limiting para autenticación.

## Stack y arquitectura

- Node.js, JavaScript ESM, Express 5, EJS y CSS propio.
- PostgreSQL con `pg`, `express-session`, `connect-pg-simple`, bcrypt, `csrf-sync` y `express-validator`.
- Helmet y `express-rate-limit` para defensas HTTP.

```text
routes → controllers → db/queries → PostgreSQL
                 ↓
              views EJS
```

- `routes/`: endpoints y middleware.
- `controllers/`: flujo HTTP y renderizado.
- `middleware/`: validación, errores, autorización y seguridad.
- `db/`: pool, consultas y scripts SQL.
- `views/`: plantillas EJS; `public/`: CSS.

Astro, React y Tailwind son decisiones pendientes, no tecnologías confirmadas.

## Instalación local

Requiere Node.js, npm y PostgreSQL.

```bash
git clone <URL_DEL_REPOSITORIO>
cd Aplicacion-de-inventario
npm install
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

Revisa y aplica los esquemas SQL antes de ejecutar datos de ejemplo:

```bash
npm run db:seed
npm run dev
```

## Scripts

| Script | Descripción |
| --- | --- |
| `npm start` | Inicia Express con Node. |
| `npm run dev` | Inicia Express en modo watch. |
| `npm run db:seed` | Carga datos de ejemplo. |

## Base de datos

Tablas actuales: `businesses`, `business_members`, `business_invitations`, `categories`, `items`, `inventory_movements`, `business_locations`, `inventory_balances`, `suppliers`, `users` y `user_sessions` (creada por el almacén de sesiones). `items.stock` conserva el total agregado; cada movimiento inmutable pertenece a una ubicación activa y actualiza su balance local y el total en una transacción. Cada negocio tiene una ubicación principal `MAIN`.

## Seguridad y autorización

Las contraseñas se hashean con bcrypt. Las sesiones se guardan en PostgreSQL, se regeneran al autenticar y usan cookie `httpOnly`, `sameSite=lax` y `secure` en producción. CSRF se aplica después de `express.urlencoded()` y de la sesión, y cada formulario POST incluye `_csrf`.

La autorización es de servidor: los botones ocultos no conceden permisos. Cada acción de inventario y de miembros valida la membresía activa y el negocio activo; los recursos administrativos se consultan siempre dentro de su `business_id`.

## Vercel y Supabase

`app.js` exporta la aplicación y evita abrir un puerto cuando existe `VERCEL`, por lo que está preparado para Vercel. El pool acepta `DATABASE_URL` o `POSTGRES_URL`, compatibles con una base de Supabase.

No hay configuración de Vercel ni Supabase versionada. Antes de producción deben verificarse variables de entorno, migraciones, sesiones, backups y políticas de acceso.

## Roadmap

1. Estabilizar y documentar el MVP.
2. Diseñar el esquema multiempresa y migraciones.
3. Incorporar negocios, membresías y roles por negocio.
4. Añadir SKU, movimientos, sucursales, reportes y alertas.
5. Decidir entre mantener EJS o adoptar React/Astro.

Consulta [TASKS.md](TASKS.md) para el backlog y [AGENTS.md](AGENTS.md) para reglas de trabajo.

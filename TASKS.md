# Backlog: inventario SaaS v2

Estados: `[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado.

## Decisiones preliminares

- Una sola base PostgreSQL para múltiples negocios, separada mediante `business_id`.
- Rol global `super_admin` y roles por negocio en `business_members`.
- ID interno único para productos y SKU visible único dentro de cada negocio.
- El stock cambia por movimientos, no por edición directa.
- La migración a Astro no está aprobada.
- Los roles empresariales definitivos son `viewer`, `manager` y `owner`; `super_admin` es únicamente un rol global.
- El archivado de productos será una tarea futura exclusiva para `owner`; la eliminación actual se conserva hasta entonces.

## Fase 0 — Estabilizar y documentar el MVP actual

- [x] Documentar arquitectura, stack, seguridad y estado real. Criterio: README y AGENTS describen solo código verificado. Dependencia: ninguna.
- [x] Verificar CSRF actual. Criterio: `csrf-sync` instalado, middleware tras parser y sesión, siete POST con `_csrf`. Dependencia: sesiones Express.
- [x] Corregir `db/schema.sql`. Criterio: contiene únicamente SQL válido y se ejecuta correctamente contra la base local. Dependencia: ninguna.
- [x] Alinear autorización de categorías con la política MVP. Criterio: crear, editar y eliminar categorías exige `requireAdmin` del lado servidor. Dependencia: middleware de autenticación.
- [x] Retirar diagnósticos no necesarios en producción. Criterio: se eliminó el log temporal de `SESSION_SECRET` y se conservó la validación de configuración. Dependencia: ninguna.

## Fase 1 — Diseñar el modelo multiempresa

### Reglas aprobadas

- [x] Definir creación de negocios. Solo `super_admin` puede crear, suspender, archivar y cambiar al propietario principal.
- [x] Definir propiedad. Cada negocio tiene un propietario principal y una cuenta puede pertenecer a varios negocios.
- [x] Definir incorporación de empleados. El propietario invita usuarios con roles empresariales.
- [x] Definir vigencia de invitaciones. Las invitaciones expiran 30 días después de su creación.
- [x] Definir acceso inicial. El registro público crea una cuenta, pero no concede acceso a ningún inventario.
- [x] Definir configuración predeterminada. Moneda `MXN` y zona horaria `America/Mexico_City`.
- [x] Definir suspensión. Los negocios suspendidos conservan sus datos, pero no permiten modificaciones.

### Diseño técnico

- [x] Diseñar `businesses`, `business_members` y `business_invitations`. Criterio: relaciones, restricciones, roles, estados, índices, RLS y migraciones revisadas y probadas localmente. Dependencia: reglas empresariales aprobadas.
- [x] Definir alcance por `business_id`. Criterio: categorías, productos y consultas del inventario quedan aislados por negocio activo. Dependencia: middleware de negocio activo y adaptación de consultas.
- [x] Planificar migración del MVP. Criterio: migración y rollback probados en una base local desechable, sin modificar producción. Dependencia: esquema multiempresa revisado.

## Fase 2 — Negocios, membresías y roles

- [x] Panel inicial de negocios. Criterio: solo `super_admin` crea, consulta, edita, suspende y reactiva negocios sin adquirir membresía empresarial. Dependencia: Fase 1.
- [x] Membresías y roles por negocio. Criterio: usuario solo accede a negocios activos donde es miembro activo; el rol se valida en servidor. Dependencia: `business_members`.
- [x] Verificar negocio activo en rutas. Criterio: el middleware valida la membresía en cada solicitud y las consultas incluyen `business_id`. Dependencia: membresías.

## Fase 3 — Productos, SKU, búsqueda, filtros y listado general

- [x] Migrar productos y categorías a `business_id`. Criterio: todas las consultas CRUD incluyen el negocio activo y los recursos ajenos responden 404. Dependencia: Fase 2.
- [~] Añadir SKU único por negocio. Criterio: migración y aplicación implementadas; pendiente probar up/down en PostgreSQL local y automatizar escenarios de concurrencia. Dependencia: productos multiempresa.
- [x] Búsqueda, filtros y paginación. Criterio: filtra por nombre, SKU y categoría sin mezclar negocios; usa conteo y consulta paginada en SQL. Dependencia: índices.
- [x] Simplificar roles empresariales a `viewer`, `manager` y `owner`. Criterio: esquema, middleware, invitaciones y vistas utilizan únicamente estos tres roles.
- [x] Implementar archivado de productos exclusivo para `owner`. Criterio: permite archivar, consultar, filtrar y restaurar productos sin borrarlos físicamente. Dependencia: modelo de archivado y auditoría definidos.

## Fase 4 — Movimientos de inventario y existencias

- [x] Tabla inmutable de movimientos. Criterio: guarda cantidad, motivo, usuario, fecha y negocio. Dependencia: Fase 3.
- [x] Existencias transaccionales. Criterio: no se edita stock directo ni se permite negativo sin regla explícita. Dependencia: movimientos.
- [x] Auditoría. Criterio: se conoce quién creó cada movimiento. Dependencia: membresías.

## Fase 5 — Proveedores, sucursales y transferencias

- [x] Proveedores por negocio. Criterio: CRUD aislado por `business_id`, estados y listado paginado. Dependencia: Fase 2.
- [x] Sucursales y existencias por ubicación. Criterio: stock asociado a ubicación, conciliado con el total del producto. Dependencia: Fase 4.
- [x] Transferencias atómicas. Criterio: crean salida y entrada en una transacción. Dependencia: sucursales y movimientos.

## Fase 6 — Reportes, alertas y exportaciones

- [x] Reportes de existencias y movimientos. Criterio: filtros por negocio, fecha y sucursal. Dependencia: Fases 3–5.
- [x] Alertas de stock bajo. Criterio: umbral configurable y aislado por negocio. Dependencia: existencias.
- [x] Exportaciones. Criterio: solo incluye datos autorizados del negocio activo. Dependencia: autorización multiempresa.

## Fase 7 — Experiencia de usuario y diseño

- [x] Selector de negocio y estados de permiso. Criterio: la interfaz identifica el negocio activo y muestra únicamente las acciones permitidas por rol. Dependencia: Fase 2.
- [ ] Accesibilidad y formularios. Criterio: errores claros, teclado y diseño adaptable. Dependencia: flujos estabilizados.

## Fase 8 — Decidir frontend entre EJS, React y Astro

- [ ] Evaluar EJS, React y Astro. Criterio: decisión documentada con coste, autenticación y plan de migración. Dependencia: requisitos UX.
- [!] Migración a Astro. Criterio: no iniciar hasta aprobación explícita. Dependencia: evaluación aprobada.

## Fase 9 — Pruebas, seguridad y producción

- [~] Pruebas de rutas, autorización y aislamiento. Criterio: módulo de miembros e invitaciones implementado; falta automatizar los flujos de roles, negocio múltiple y sesión manipulada. Dependencia: Fase 2.
- [ ] Revisar migraciones, índices y consultas. Criterio: seguridad y rendimiento revisados antes de producción. Dependencia: esquema final.
- [ ] Preparar Vercel/Supabase. Criterio: entorno, migraciones, sesiones, backups y monitoreo verificados fuera de producción. Dependencia: pruebas completas.

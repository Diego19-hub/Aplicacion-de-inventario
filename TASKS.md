# Backlog: inventario SaaS v2

Estados: `[ ]` pendiente · `[~]` en progreso · `[x]` completado · `[!]` bloqueado.

## Decisiones preliminares

- Una sola base PostgreSQL para múltiples negocios, separada mediante `business_id`.
- Rol global `super_admin` y roles por negocio en `business_members`.
- ID interno único para productos y SKU visible único dentro de cada negocio.
- El stock cambia por movimientos, no por edición directa.
- La migración a Astro no está aprobada.

## Fase 0 — Estabilizar y documentar el MVP actual

- [x] Documentar arquitectura, stack, seguridad y estado real. Criterio: README y AGENTS describen solo código verificado. Dependencia: ninguna.
- [x] Verificar CSRF actual. Criterio: `csrf-sync` instalado, middleware tras parser y sesión, siete POST con `_csrf`. Dependencia: sesiones Express.
- [x] Corregir `db/schema.sql`. Criterio: contiene únicamente SQL válido y se ejecuta correctamente contra la base local. Dependencia: ninguna.
- [x] Alinear autorización de categorías con la política MVP. Criterio: crear, editar y eliminar categorías exige `requireAdmin` del lado servidor. Dependencia: middleware de autenticación.
- [x] Retirar diagnósticos no necesarios en producción. Criterio: se eliminó el log temporal de `SESSION_SECRET` y se conservó la validación de configuración. Dependencia: ninguna.

## Fase 1 — Diseñar el modelo multiempresa

- [ ] Diseñar `businesses` y `business_members`. Criterio: relaciones, restricciones, índices y migraciones revisadas. Dependencia: Fase 0.
- [ ] Definir alcance por `business_id`. Criterio: cada tabla y consulta de dominio queda aislada por negocio. Dependencia: modelo de negocios.
- [ ] Planificar migración del MVP. Criterio: respaldo y migración local revisados. Dependencia: esquema válido.

## Fase 2 — Negocios, membresías y roles

- [ ] CRUD de negocios. Criterio: solo `super_admin` administra todos los negocios. Dependencia: Fase 1.
- [ ] Membresías y roles por negocio. Criterio: usuario solo accede a negocios donde es miembro. Dependencia: `business_members`.
- [ ] Verificar negocio activo en rutas. Criterio: URLs manipuladas no permiten acceso cruzado. Dependencia: membresías.

## Fase 3 — Productos, SKU, búsqueda, filtros y listado general

- [ ] Migrar productos y categorías a `business_id`. Criterio: consultas y restricciones aíslan datos. Dependencia: Fase 2.
- [ ] Añadir SKU único por negocio. Criterio: índice compuesto `(business_id, sku)` y validación. Dependencia: productos multiempresa.
- [ ] Búsqueda, filtros y paginación. Criterio: filtra por nombre, SKU y categoría sin mezclar negocios. Dependencia: índices.

## Fase 4 — Movimientos de inventario y existencias

- [ ] Tabla inmutable de movimientos. Criterio: guarda cantidad, motivo, usuario, fecha y negocio. Dependencia: Fase 3.
- [ ] Existencias transaccionales. Criterio: no se edita stock directo ni se permite negativo sin regla explícita. Dependencia: movimientos.
- [ ] Auditoría. Criterio: se conoce quién creó cada movimiento. Dependencia: membresías.

## Fase 5 — Proveedores, sucursales y transferencias

- [ ] Proveedores por negocio. Criterio: CRUD aislado por `business_id`. Dependencia: Fase 2.
- [ ] Sucursales y existencias por ubicación. Criterio: stock asociado a sucursal. Dependencia: Fase 4.
- [ ] Transferencias atómicas. Criterio: crean salida y entrada en una transacción. Dependencia: sucursales y movimientos.

## Fase 6 — Reportes, alertas y exportaciones

- [ ] Reportes de existencias y movimientos. Criterio: filtros por negocio, fecha y sucursal. Dependencia: Fases 3–5.
- [ ] Alertas de stock bajo. Criterio: umbral configurable y aislado por negocio. Dependencia: existencias.
- [ ] Exportaciones. Criterio: solo incluye datos autorizados del negocio activo. Dependencia: autorización multiempresa.

## Fase 7 — Experiencia de usuario y diseño

- [ ] Selector de negocio y estados de permiso. Criterio: interfaz identifica negocio activo y acciones permitidas. Dependencia: Fase 2.
- [ ] Accesibilidad y formularios. Criterio: errores claros, teclado y diseño adaptable. Dependencia: flujos estabilizados.

## Fase 8 — Decidir frontend entre EJS, React y Astro

- [ ] Evaluar EJS, React y Astro. Criterio: decisión documentada con coste, autenticación y plan de migración. Dependencia: requisitos UX.
- [!] Migración a Astro. Criterio: no iniciar hasta aprobación explícita. Dependencia: evaluación aprobada.

## Fase 9 — Pruebas, seguridad y producción

- [ ] Pruebas de rutas, autorización y aislamiento. Criterio: acceso cruzado falla y flujos permitidos pasan. Dependencia: Fase 2.
- [ ] Revisar migraciones, índices y consultas. Criterio: seguridad y rendimiento revisados antes de producción. Dependencia: esquema final.
- [ ] Preparar Vercel/Supabase. Criterio: entorno, migraciones, sesiones, backups y monitoreo verificados fuera de producción. Dependencia: pruebas completas.

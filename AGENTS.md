# Guía para agentes

## Objetivo

Mantener el MVP de inventario y evolucionarlo a un SaaS multiempresa seguro: una base PostgreSQL, separación por `business_id`, rol global `super_admin` y roles por negocio en `business_members`.

## Arquitectura y convenciones

- Stack actual: Express, EJS y PostgreSQL con JavaScript ESM (`import`/`export`).
- Flujo: `routes → controllers → db/queries → PostgreSQL`; controllers renderizan vistas EJS.
- `routes/` conecta middleware y controllers; `controllers/` no contiene SQL; `db/` centraliza consultas; `views/` solo presenta datos escapados.
- Manejar handlers asíncronos con `try/catch` y `next(error)`; usar `AppError` para errores HTTP operacionales.
- Usar siempre consultas parametrizadas (`$1`, `$2`); nunca interpolar entradas en SQL.

## Validación, errores y autorización

- Validar y normalizar toda entrada antes de persistirla; al fallar, re-renderizar formularios con errores seguros.
- Aplicar autorización en servidor para cada acción sensible. Los botones ocultos no son autorización.
- En el modelo multiempresa, comprobar siempre que el usuario pertenece al negocio solicitado antes de leer o modificar datos.

## Seguridad

- No exponer, imprimir ni versionar secretos, tokens o credenciales; mantener `.env` ignorado.
- Mantener CSRF en todos los POST, sesiones seguras, bcrypt, Helmet, rate limiting y validación.
- No debilitar cookies, CSRF o autorización para resolver un error local.
- No exponer claves de Supabase ni `service_role` en clientes públicos.

## Base de datos

- Modificar el esquema mediante migraciones SQL revisables.
- No editar destructivamente producción, ejecutar reset, borrado masivo o migraciones productivas sin autorización explícita.
- En v2, usar `business_id` en datos de dominio. El producto tendrá ID interno único y SKU único dentro de su negocio.
- El stock cambiará por movimientos de inventario, no por edición directa.

## Pruebas y Git

- Antes de cerrar una tarea: ejecutar sintaxis, pruebas disponibles, revisión de rutas afectadas y `git diff`.
- Informar verificaciones y límites; no afirmar que producción fue probada si no lo fue.
- Hacer cambios pequeños y enfocados; no mezclar tareas ni alterar trabajo previo del usuario.
- No hacer commit, push, reset destructivo ni cambios de producción sin autorización.
- Actualizar `README.md` y `TASKS.md` cuando una decisión cambie el proyecto.
- Trabajar una sola tarea de `TASKS.md` a la vez y actualizar su estado al terminar.

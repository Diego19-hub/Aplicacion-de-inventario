# Diseño multiempresa: borrador de migración

Estado: borrador técnico para revisión. No se aplica todavía a Express, Supabase, producción ni `inventory_boxing`.

## Modelo y relaciones

```text
users ──< businesses (created_by)
users ──< business_members >── businesses
users ──< business_invitations (invited_by) >── businesses
businesses ──< categories ──< items
```

`users.platform_role` expresa privilegios globales: `user` o `super_admin`. `business_members.role` expresa permisos en un negocio: `owner`, `admin`, `manager`, `employee` o `viewer`. No se usará el rol global para decidir permisos cotidianos dentro de un negocio.

### Tablas propuestas

- `businesses`: nombre, `slug` único, datos legales opcionales, moneda `MXN`, zona `America/Mexico_City`, estado `active`/`suspended`/`archived`, creador y marcas de tiempo.
- `business_members`: asociación única `(business_id, user_id)`, rol, estado `active`/`suspended`/`removed`, fechas de ingreso y creación. Un índice parcial garantiza como máximo un `owner` activo por negocio.
- `business_invitations`: correo en minúsculas, rol ofrecido sin `owner`, hash de token, invitador, estado `pending`/`accepted`/`revoked`/`expired`, vencimiento de 30 días y fecha de aceptación.

Las tres tablas nuevas habilitan RLS sin `FORCE ROW LEVEL SECURITY` y no tienen políticas públicas en esta fase. Si los roles `anon` o `authenticated` existen, la migración revoca sus privilegios sobre estas tablas. La aplicación seguirá usando conexión PostgreSQL privada; las políticas RLS por negocio se diseñarán junto con una futura exposición de Data API.

## Reglas de acceso y estados

- Solo `super_admin` puede crear, suspender, archivar o cambiar el propietario principal de un negocio.
- Un negocio suspendido o archivado conserva sus datos. Un middleware futuro deberá negar mutaciones antes de llegar a controllers o consultas.
- Solo `owner` invita miembros y modifica roles empresariales. Un `owner` no puede crear otro `owner`; solo `super_admin` puede transferir la propiedad principal.
- El registro público crea `users` con `platform_role = 'user'`; no crea membresías ni concede acceso a inventarios.
- Los tokens de invitación se generan con aleatoriedad criptográfica, son de un solo uso y solo se persiste su hash SHA-256.
- Una invitación se acepta solo con `status = 'pending'`, `expires_at > CURRENT_TIMESTAMP` y correo igual al de la cuenta autenticada.
- Al listar, crear o aceptar invitaciones, la aplicación marcará de forma diferida las vencidas como `expired`; la primera versión no requiere un job.

## Negocio activo y aislamiento

El negocio activo se elegirá mediante un selector y se guardará en `req.session.activeBusinessId`. Ese valor nunca será suficiente: cada solicitud comprobará membresía `active` y estado del negocio antes de autorizar o consultar. Cada ruta de dominio recibirá el negocio activo desde middleware y cada consulta incluirá `WHERE business_id = $n`.

No basta con filtrar por ID en la URL: al cargar una categoría, producto o relación, la consulta debe incluir tanto el ID del recurso como `business_id`. Las mutaciones deben incluir el mismo alcance y comprobar que la categoría referida pertenece al negocio. La migración añade la FK compuesta `(items.business_id, items.category_id) → categories(business_id, id)` para bloquear referencias cruzadas incluso si una consulta futura contiene un error.

La migración habilita RLS solo en `businesses`, `business_members` y `business_invitations`; no cambia el estado RLS de `categories` ni `items`. Si se expone la base a la Data API de Supabase en el futuro, deberán diseñarse políticas RLS por negocio antes de conceder acceso a roles públicos.

## Migración de datos existentes

1. Validar que existan `users`, `categories`, `items`, `users.role` y al menos un administrador actual.
2. Renombrar `users.role` a `platform_role`, ampliar el tipo y convertir cada `admin` existente a `super_admin` sin depender de IDs.
3. Crear `Boxing Inventory` (`boxing-inventory`) con el `super_admin` de menor ID como creador y propietario inicial. Si no hay administrador, abortar con mensaje claro.
4. Crear las tablas de negocios, membresías e invitaciones.
5. Añadir `business_id` nullable a categorías y productos, asociar cada fila al negocio inicial y comprobar que no queden nulos.
6. Convertir las columnas a `NOT NULL`, reemplazar la unicidad global de categoría por `(business_id, lower(name))` y añadir claves foráneas directas y compuestas.
7. Conservar IDs, nombres, precios, existencias, relaciones y fechas existentes.

El borrador `up` es transaccional y usa límites de bloqueo y de consulta para el MVP actual. Para bases grandes se requerirá una estrategia por etapas porque `ALTER TABLE`, índices no concurrentes y validaciones pueden adquirir bloqueos.

## Restricciones e índices

- `businesses.slug` es único, minúsculo y con formato de slug.
- `business_members (business_id, user_id)` es único; el índice parcial de owner evita dos propietarios activos.
- `business_invitations.token_hash` es único; `(business_id, email_normalized)` es único mientras el estado sea `pending`.
- Todas las claves foráneas tienen índices que favorecen joins y borrados restringidos: creador, usuario miembro, invitador y negocio/categoría de producto.
- `categories (business_id, lower(name))` evita nombres duplicados normalizados dentro del mismo negocio.
- La FK compuesta de `items` garantiza que categoría y producto compartan negocio.

## Rollback

`001_multitenancy_down.sql` es destructivo por definición. Solo permite revertir si existe exactamente el negocio inicial, una única membresía owner inicial y cero invitaciones. Se niega ante varios negocios, membresías adicionales o datos que no caben en el modelo anterior. No se ejecutará contra producción sin una revisión adicional.

## Riesgos e incompatibilidades actuales

- `db/schema.sql` define `categories.name` como único global y no tiene `business_id`; las consultas actuales tampoco lo filtran. Por eso no se modifica ese archivo ni Express en esta tarea.
- El rol actual `users.role` solo admite `user` y `admin`; `super_admin` no cabe en `VARCHAR(10)`, por lo que la migración lo amplía antes de convertir datos.
- Las rutas actuales editan `items.stock` directamente; esto contradice el modelo futuro de movimientos y queda fuera del alcance de esta migración.
- La aplicación actual no guarda un negocio activo ni comprueba membresías; aplicar el SQL sin la siguiente fase no crea aislamiento efectivo por sí solo.
- El índice parcial de invitaciones requiere transicionar invitaciones vencidas a `expired` antes de reemitirlas; no se incluye un job en este alcance.
- Un trigger PostgreSQL actualiza `businesses.updated_at`; no usa `SECURITY DEFINER`.
- Con RLS habilitado y sin políticas, una futura cuenta privada que no sea propietaria de las tablas necesitará políticas o una estrategia de rol antes de acceder a ellas.

## Orden futuro

1. Revisar el SQL y ejecutar una migración local desechable.
2. Añadir middleware de negocio activo, pertenencia y estado del negocio.
3. Cambiar cada consulta de categoría y producto para requerir `business_id`.
4. Ajustar controllers, rutas, formularios y pruebas de autorización cruzada.
5. Diseñar SKU y movimientos de inventario en migraciones separadas.
6. Evaluar RLS si Supabase Data API queda expuesta.

## Decisiones pendientes

- Política de suspensión/archivo para sesiones ya activas.
- Aplicación concreta de las reglas de delegación y transferencia en rutas y servicios.
- Manejo de reintentos, revocación y rotación de tokens de invitación.
- Estrategia de migración por etapas para bases de datos con mucho tráfico.

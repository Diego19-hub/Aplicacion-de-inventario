# Contrato de la futura API JSON

Este documento define el contrato aprobado para la transición gradual a una
API JSON. No implementa rutas nuevas ni modifica el comportamiento actual de
las vistas EJS.

## Fundamentos y arquitectura

- React, Vite y React Router serán el frontend nuevo.
- Express seguirá siendo el backend y las vistas EJS continuarán funcionando
  durante la migración.
- La API usará el prefijo `/api`.
- React y Express se desplegarán inicialmente bajo el mismo origen.
- La autenticación seguirá usando `express-session` y una cookie `httpOnly`.
  No se usará JWT; React nunca recibe ni almacena el ID de sesión.
- El negocio activo seguirá en `req.session.activeBusinessId`.
- Express calcula el usuario, los permisos y el negocio activo. React no envía
  roles confiables.
- Todas las consultas de dominio continúan aisladas por `business_id`. Un
  recurso ajeno debe responder como inexistente (`404`).
- La API inicial no requiere CORS. Si en el futuro React y Express usan
  dominios distintos, CORS deberá permitir una lista explícita de orígenes y
  revisar la política de cookies; nunca se usará `*` con credenciales.

## Formato JSON común

Una respuesta correcta envuelve su resultado en `data`:

```json
{
  "data": {}
}
```

Una respuesta de error usa un código estable y un mensaje legible:

```json
{
  "error": {
    "code": "CODIGO_ESTABLE",
    "message": "Mensaje legible"
  }
}
```

Cuando haya errores de validación, se añade `fields`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisa los campos enviados.",
    "fields": [
      {
        "field": "email",
        "message": "Introduce un correo electrónico válido."
      }
    ]
  }
}
```

`fields` se omite cuando no hay errores de validación. Las respuestas nunca
incluyen trazas, SQL, contraseñas, `password_hash`, hashes de invitación,
secretos de sesión ni detalles internos.

## Estados HTTP

| Estado | Uso |
| --- | --- |
| `200` | Consulta o mutación correcta. |
| `201` | Recurso creado. |
| `204` | Éxito sin cuerpo cuando corresponda. |
| `400` | Entrada o parámetros inválidos. |
| `401` | Sesión no autenticada o credenciales incorrectas. |
| `403` | Usuario autenticado sin permiso o CSRF inválido. |
| `404` | Recurso inexistente o perteneciente a otro negocio. |
| `409` | Conflicto de unicidad o de estado. |
| `429` | Límite de solicitudes. |
| `500` | Error interno sin detalles sensibles. |

La API no redirige al login: devuelve `401`. Las rutas EJS existentes pueden
conservar sus redirecciones actuales.

## CSRF y cookie de sesión

```http
GET /api/csrf-token
```

Respuesta:

```json
{
  "data": {
    "csrfToken": "token"
  }
}
```

- Las mutaciones envían el token en `X-CSRF-Token`.
- La cookie de sesión se envía automáticamente por compartir origen.
- `GET`, `HEAD` y `OPTIONS` no requieren token.
- `POST`, `PUT`, `PATCH` y `DELETE` requieren token.
- El token no se guarda en `localStorage`.
- Un token inválido devuelve `403` con `CSRF_INVALID`.

## Sesión

### `GET /api/session`

No requiere autenticación ni negocio activo. Sin sesión devuelve `200`:

```json
{
  "data": {
    "authenticated": false,
    "user": null,
    "activeBusiness": null,
    "membership": null,
    "permissions": {
      "canManageInventory": false,
      "canDeleteInventory": false,
      "isSuperAdmin": false
    }
  }
}
```

Con sesión autenticada, `user` incluye `id`, `username`, `email` y
`platformRole`. `activeBusiness` contiene el negocio activo o `null`;
`membership` incluye `role` y `status`, o `null`. `permissions` siempre se
calcula en Express:

- `canManageInventory`: roles `owner` o `manager` de la membresía activa.
- `canDeleteInventory`: solo `owner`.
- `isSuperAdmin`: `platformRole === "super_admin"`.

## Dashboard

### `GET /api/dashboard`

Requiere una sesión autenticada y un negocio activo con membresía y estado
activos. Devuelve `summary`, hasta cinco `recentMovements` y `stockByLocation`
solo del negocio activo. La respuesta usa `Cache-Control: no-store`.

- Sin sesión: `401 AUTH_REQUIRED`.
- Sin negocio activo válido: `409 ACTIVE_BUSINESS_REQUIRED`.

## Productos

### `GET /api/products`

Requiere sesión y negocio activo válidos. Lista únicamente productos activos
del negocio activo con paginación SQL de 12 elementos, ordenada por nombre e
ID. Acepta `q`, `category` y `page`; una categoría ajena o inválida devuelve
una lista vacía sin revelar datos. Responde `products`, `categories`, filtros
y paginación, con `Cache-Control: no-store`.

### `GET /api/products/:productId`

Requiere sesión y negocio activo válidos. Devuelve solo un producto activo del
negocio actual, sus balances por ubicación y hasta cinco movimientos recientes.
El ID debe ser entero positivo (`400 VALIDATION_ERROR`); un producto
inexistente, archivado o ajeno devuelve `404 PRODUCT_NOT_FOUND`. La respuesta
usa `Cache-Control: no-store`.

### `GET /api/products/form-options`

Requiere una sesión, negocio activo y rol `owner` o `manager`. Devuelve las
categorías del negocio ordenadas por nombre e ID, junto con la configuración
informativa de SKU automático. No crea una categoría predeterminada.

### `POST /api/products`

Requiere una sesión, negocio activo y rol `owner` o `manager`; `viewer`
recibe `403 FORBIDDEN`. Recibe `name`, `description`, `brand`, `price`,
`categoryId` y `sku`. Un SKU vacío se genera de forma transaccional según la
categoría; uno manual se normaliza a mayúsculas. El producto inicia activo y
con stock cero. `stock` no se acepta porque las existencias se gestionan por
movimientos. Una categoría ajena es un error de validación y un SKU duplicado
responde `409 SKU_ALREADY_EXISTS` asociado al campo `sku`.

### `GET /api/products/:productId/edit`

Requiere sesión, negocio activo y rol `owner` o `manager`. Devuelve los campos
editables de un producto activo del negocio junto con sus categorías. Un ID
inválido responde `400 VALIDATION_ERROR`; un producto ajeno, archivado o
inexistente responde `404 PRODUCT_NOT_FOUND`.

### `PUT /api/products/:productId`

Requiere sesión, negocio activo y rol `owner` o `manager`. Actualiza solamente
`name`, `description`, `brand`, `price`, `categoryId` y un SKU manual
obligatorio. La categoría debe pertenecer al negocio y el `UPDATE` limita por
producto, negocio y estado activo. `stock`, `status`, los metadatos de archivo
y `businessId` se rechazan como errores de validación; las existencias nunca se
modifican. SKU duplicado responde `409 SKU_ALREADY_EXISTS`.

### `POST /api/products/:productId/archive`

Requiere sesión, negocio activo, CSRF y rol `owner`. Recibe `reason`, un texto
recortado de 5 a 500 caracteres. Actualiza únicamente un producto activo del
negocio para conservar SKU, stock, balances y movimientos; productos ajenos,
inexistentes o ya archivados responden `404 PRODUCT_NOT_FOUND`. Manager y
viewer reciben `403 FORBIDDEN`.

### Productos archivados

`GET /api/products/archived`, `GET /api/products/:productId/archived` y
`POST /api/products/:productId/restore` requieren sesión, negocio activo y
rol `owner`; manager y viewer reciben `403 FORBIDDEN`. El listado acepta
`q`, `category` y `page`, muestra únicamente productos archivados del negocio
y pagina en SQL con 12 elementos. El detalle incluye datos de archivo,
balances y movimientos recientes. Restaurar exige CSRF, limita por producto,
negocio y estado archivado, conserva SKU, stock, balances y movimientos, y
limpia solamente los metadatos de archivo. Un producto activo, ajeno o
inexistente responde `404 PRODUCT_NOT_FOUND`.

## Autenticación

### `POST /api/auth/register`

Entrada:

```json
{
  "username": "diego",
  "email": "diego@example.com",
  "password": "contraseña"
}
```

Éxito `201`: devuelve un usuario seguro, los negocios disponibles y
`requiresBusinessSelection`. Nunca devuelve `password_hash`.

Errores: `400` por validación, `409` por usuario o correo duplicado y `429`
por límite de solicitudes.

### `POST /api/auth/login`

Entrada:

```json
{
  "identifier": "diego",
  "password": "contraseña"
}
```

Éxito `200`: regenera la sesión y devuelve usuario seguro, negocios
disponibles, el negocio activo si solo hay uno y `requiresBusinessSelection`.

Credenciales incorrectas: `401` con un mensaje genérico que no revela si la
cuenta existe. El límite de solicitudes devuelve `429`.

### `POST /api/auth/logout`

Requiere CSRF. Destruye la sesión, limpia la cookie y responde `204` sin
cuerpo.

## Negocios y selección activa

### `GET /api/businesses`

Requiere autenticación. Devuelve solo membresías activas de negocios activos;
el rol global `super_admin` no concede por sí mismo una membresía. Cada
negocio incluye `id`, `name`, `slug`, `role` y `membershipStatus`.

### `PUT /api/session/active-business`

Requiere autenticación y CSRF.

Entrada:

```json
{
  "businessId": 1
}
```

Solo acepta un negocio activo donde el usuario posee una membresía activa.
Guarda `activeBusinessId` en la sesión y responde `200` con el negocio, la
membresía y los permisos calculados por el servidor.

- ID inválido: `400`.
- Negocio inexistente, ajeno, suspendido o membresía inactiva: `404`, sin
  revelar información adicional.

## Códigos estables mínimos

| Código | Significado |
| --- | --- |
| `VALIDATION_ERROR` | Entrada o parámetros no válidos. |
| `AUTH_REQUIRED` | No hay sesión autenticada. |
| `INVALID_CREDENTIALS` | Credenciales incorrectas. |
| `FORBIDDEN` | Sesión válida sin permiso. |
| `CSRF_INVALID` | Token CSRF ausente o inválido. |
| `RESOURCE_NOT_FOUND` | Recurso inexistente o ajeno al negocio. |
| `CONFLICT` | Conflicto de unicidad o estado. |
| `RATE_LIMITED` | Límite de solicitudes alcanzado. |
| `INTERNAL_ERROR` | Error interno sin detalles sensibles. |

## Reglas de serialización y seguridad

- Los IDs numéricos se serializan como números.
- Las fechas se serializan como ISO 8601 en UTC.
- Los valores monetarios provenientes de PostgreSQL `NUMERIC` se serializan
  como strings decimales para evitar pérdida de precisión.
- No se confía en roles enviados por React.
- Permisos y negocio activo se calculan siempre en Express.

## Fuera de alcance

Este contrato no documenta todavía endpoints de productos, categorías,
movimientos, proveedores, ubicaciones, transferencias, alertas, reportes,
miembros, invitaciones ni superadministración.

## Decisiones pendientes

- Duración y renovación de sesión.
- Estrategia de despliegue: Render frente a Railway.
- Momento exacto para retirar EJS.

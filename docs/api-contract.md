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

## Superadministración

Los endpoints administrativos requieren una sesión con
`platformRole: super_admin`, pero no requieren negocio activo. La API nunca
redirige: una sesión ausente recibe `401 AUTH_REQUIRED` y un usuario que no es
superadministrador recibe `403 SUPER_ADMIN_REQUIRED`. Todas las respuestas usan
`Cache-Control: no-store` y solo serializan datos operativos necesarios.

### `GET /api/admin/dashboard`

Devuelve métricas globales de negocios, usuarios, membresías y productos, más
hasta cinco negocios recientes (`id`, nombre, slug, estado y fecha de creación).
No acepta filtros ni realiza mutaciones.

### `GET /api/admin/businesses`

Lista negocios de toda la plataforma. Acepta `q` (hasta 100 caracteres, busca
parcialmente por nombre, slug, razón social o identificación fiscal), `status`
(`active`, `suspended` o `archived`) y `page`. Un estado desconocido equivale a
todos los estados; una página inválida se normaliza a 1 y una página excesiva se
ajusta a la última. Devuelve 20 filas por página y el conteo utiliza los mismos
filtros que los resultados.

Cada negocio devuelve `id`, `name`, `slug`, `legalName`, `taxId`, `currency`,
`timezone`, `status`, fechas y los conteos `activeMembers` y
`activeProducts`. No devuelve datos de sesión ni IDs de usuarios creadores.

### `GET /api/admin/businesses/:businessId`

`businessId` debe ser un entero positivo; de lo contrario responde `400
VALIDATION_ERROR`. Si no existe el negocio, responde `404 BUSINESS_NOT_FOUND`.
Devuelve la información general segura, métricas de miembros, productos activos
y archivados, ubicaciones activas, stock total, transferencias y umbrales;
también las membresías (usuario, correo, rol, estado y fechas) y hasta cinco
movimientos recientes seguros. No acepta mutaciones.

### `GET /api/admin/businesses/form-options`

Devuelve las personas que pueden seleccionarse como propietarias al crear un
negocio: `id`, `username` y `email`. No incluye hashes, roles internos ni
datos de sesión.

### `POST /api/admin/businesses`

Requiere CSRF. Recibe `name`, `slug`, `currency`, `timezone` y `ownerUserId`,
todos obligatorios; `legalName` y `taxId` son opcionales y una cadena vacía se
normaliza a `null`. El slug se normaliza a minúsculas y debe usar letras
minúsculas, números y guiones; la moneda se normaliza a mayúsculas. El usuario
propietario debe existir y ser un ID entero positivo.

Una única transacción crea un negocio `active`, una membresía `owner` activa,
la ubicación principal activa `Sucursal principal` / `MAIN` y la categoría
predeterminada `Sin categoría`; un fallo en cualquiera de esos pasos revierte
la creación completa. Campos protegidos como `id`, `status`, `createdBy`,
fechas y membresías se rechazan. Un slug duplicado responde `409
BUSINESS_ALREADY_EXISTS`; propietario inexistente o campos inválidos responden
`400 VALIDATION_ERROR`.

### `GET /api/admin/businesses/:businessId/edit`

Devuelve únicamente los campos editables del negocio (`name`, `slug`,
`legalName`, `taxId`, `currency` y `timezone`). Un ID inválido responde `400
VALIDATION_ERROR` y uno inexistente `404 BUSINESS_NOT_FOUND`.

### `PUT /api/admin/businesses/:businessId`

Requiere CSRF y permite actualizar solamente `name`, `slug`, `legalName`,
`taxId`, `currency` y `timezone`, con la misma normalización de creación. No
permite modificar estado, propietario, creador, fechas, membresías ni la
ubicación principal. Un slug duplicado responde `409 BUSINESS_ALREADY_EXISTS`;
un ID inválido responde `400 VALIDATION_ERROR` y uno inexistente `404
BUSINESS_NOT_FOUND`. Las respuestas sin sesión o sin rol de plataforma
corresponden a `401 AUTH_REQUIRED` y `403 SUPER_ADMIN_REQUIRED`.

### `GET /api/admin/businesses/:businessId/change-owner/options`

Devuelve el contexto necesario para transferir la propiedad de un negocio sin
requerir negocio activo. `businessId` debe ser un entero positivo; un ID
inválido responde `400 VALIDATION_ERROR` y uno inexistente responde `404
BUSINESS_NOT_FOUND`.

Acepta `q` opcional, recortado a 100 caracteres, para buscar personas
registradas por `username` o `email`. La respuesta incluye:

- `business`: `id`, `name`, `slug`, `status`, `currency`, `timezone`,
  `createdAt` y `updatedAt`.
- `owner`: `id`, `username` y `email` de la persona propietaria activa actual.
- `users`: hasta 20 cuentas registradas que pueden seleccionarse como nueva
  persona propietaria, con `id`, `username`, `email` y, si ya existe, su
  membresía actual (`role`, `status`) en ese negocio.

Este endpoint no muta datos. Un negocio archivado puede consultarse para la
pantalla, pero la transferencia posterior será rechazada.

### `POST /api/admin/businesses/:businessId/change-owner`

Requiere CSRF, sesión autenticada y `platformRole === "super_admin"`. No
requiere negocio activo ni membresía. El cuerpo aceptado es únicamente:

```json
{
  "newOwnerUserId": 123
}
```

`newOwnerUserId` debe ser un entero positivo. Cualquier otro campo protegido se
rechaza con `400 VALIDATION_ERROR`.

La transferencia se ejecuta en una sola transacción con bloqueo del negocio y
de sus membresías. Las reglas aplicadas son:

- Solo negocios `active` o `suspended` pueden transferirse.
- Un negocio `archived` responde `409 BUSINESS_INVALID_STATE`.
- La persona propietaria anterior pasa a `manager` activa.
- La nueva persona propietaria pasa a `owner` activa.
- Si ya existe una membresía `active`, `suspended` o `removed`, se reutiliza y
  reactiva.
- Si no existe membresía, se crea.
- La garantía diferible instalada por la migración 012 debe dejar exactamente
  un `owner` activo al confirmar la transacción.

Errores esperados:

- `400 VALIDATION_ERROR` para `businessId` o `newOwnerUserId` inválidos, o
  campos adicionales.
- `401 AUTH_REQUIRED` sin sesión.
- `403 SUPER_ADMIN_REQUIRED` para usuarios sin rol global suficiente.
- `404 BUSINESS_NOT_FOUND` si el negocio no existe.
- `404 USER_NOT_FOUND` si la persona seleccionada no existe.
- `409 OWNER_ALREADY_ASSIGNED` si se intenta transferir al mismo owner actual.
- `409 BUSINESS_INVALID_STATE` si el negocio no está en un estado transferible.

### Transiciones de estado de negocios

`POST /api/admin/businesses/:businessId/suspend`, `/reactivate` y `/archive`
requieren CSRF y `super_admin`; no requieren negocio activo ni membresía. No
aceptan un estado ni campos arbitrarios en el cuerpo: el destino se determina
por la ruta.

- `suspend`: únicamente `active` a `suspended`.
- `reactivate`: únicamente `suspended` a `active`.
- `archive`: `active` o `suspended` a `archived`.

Cada transición bloquea la fila del negocio y valida su estado dentro de una
transacción. Actualiza únicamente `businesses.status` y `updated_at`; no borra
datos ni modifica membresías, invitaciones, productos, ubicaciones, balances,
movimientos, transferencias o umbrales. Un negocio suspendido o archivado deja
de ser seleccionable como negocio activo por sus miembros; las sesiones no se
borran y reactivarlo no lo selecciona automáticamente ni reactiva membresías.

ID inválido responde `400 VALIDATION_ERROR`, sesión ausente `401
AUTH_REQUIRED`, rol insuficiente `403 SUPER_ADMIN_REQUIRED` y negocio
inexistente `404 BUSINESS_NOT_FOUND`. Las transiciones repetidas o incompatibles
responden `409` con `BUSINESS_ALREADY_SUSPENDED`, `BUSINESS_ALREADY_ACTIVE`,
`BUSINESS_ALREADY_ARCHIVED` o `BUSINESS_INVALID_TRANSITION`.

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
categorías del negocio ordenadas con la predeterminada primero, junto con la
configuración informativa de SKU automático. Cada categoría incluye `isDefault`;
la categoría predeterminada del negocio es `Sin categoría`.

### `POST /api/products`

Requiere una sesión, negocio activo y rol `owner` o `manager`; `viewer`
recibe `403 FORBIDDEN`. Recibe `name`, `description`, `brand`, `price`,
`categoryId` opcional y `sku`. Si `categoryId` falta, está vacío o es `null`,
se usa la categoría predeterminada del negocio. Un SKU vacío se genera de forma
transaccional según la categoría resuelta; uno manual se normaliza a
mayúsculas. El producto inicia activo y con stock cero. `stock` no se acepta
porque las existencias se gestionan por movimientos. Una categoría ajena es un
error de validación y un SKU duplicado responde `409 SKU_ALREADY_EXISTS`
asociado al campo `sku`.

### `GET /api/products/:productId/edit`

Requiere sesión, negocio activo y rol `owner` o `manager`. Devuelve los campos
editables de un producto activo del negocio junto con sus categorías. Un ID
inválido responde `400 VALIDATION_ERROR`; un producto ajeno, archivado o
inexistente responde `404 PRODUCT_NOT_FOUND`.

### `PUT /api/products/:productId`

Requiere sesión, negocio activo y rol `owner` o `manager`. Actualiza solamente
`name`, `description`, `brand`, `price`, `categoryId` opcional y un SKU manual
obligatorio. Si `categoryId` falta, está vacío o es `null`, se asigna la
categoría predeterminada del negocio. La categoría indicada debe pertenecer al
negocio y el `UPDATE` limita por producto, negocio y estado activo. `stock`,
`status`, los metadatos de archivo y `businessId` se rechazan como errores de
validación; las existencias nunca se modifican. SKU duplicado responde `409
SKU_ALREADY_EXISTS`.

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

### `GET /api/products/:productId/movements`

Requiere sesión, negocio activo y una membresía `owner`, `manager` o `viewer`.
Devuelve el historial paginado de un producto activo del negocio con filtros
`location`, `type` y `page`. Usa 20 filas, orden `created_at DESC, id DESC` y
consulta SQL paginada. Una ubicación inválida o ajena devuelve cero filas; un
tipo desconocido se normaliza a todos los tipos. Producto ajeno, archivado o
inexistente responde `404 PRODUCT_NOT_FOUND`.

### Movimientos manuales de producto

`GET /api/products/:productId/movements/form-options` y
`POST /api/products/:productId/movements` requieren sesión, negocio activo y
rol `owner` o `manager`; viewer recibe `403 FORBIDDEN`. Las opciones muestran
ubicaciones activas y su saldo local. El POST requiere CSRF y admite `entry`,
`exit` y `adjustment`: entrada y salida usan unidades que ingresan o salen;
para ajuste, `quantity` representa el saldo local final deseado. La operación
reutiliza la transacción de inventario para crear el ledger y actualizar balance
e inventario total. Stock local insuficiente responde `409 INSUFFICIENT_STOCK`.

### Transferencias entre ubicaciones

`GET /api/transfers/form-options` requiere sesión, negocio activo y rol
`owner` o `manager`. Devuelve productos activos, ubicaciones activas y los
balances existentes del negocio para mostrar de forma informativa el saldo
local; no expone `business_id`. Acepta `product` opcional para preseleccionar
un producto activo del negocio. Un producto inexistente, archivado o ajeno no
se selecciona.

`POST /api/transfers` requiere sesión, negocio activo, rol `owner` o
`manager` y CSRF. Recibe `productId`, `fromLocationId`, `toLocationId`,
`quantity`, `reason` y `reference` opcional. Producto ajeno, inexistente o
archivado responde `404 PRODUCT_NOT_FOUND`; ubicaciones inválidas, inactivas
o ajenas devuelven un error de validación sin revelar datos. Origen y destino
deben ser distintos y el saldo local de origen debe cubrir la cantidad; de lo
contrario responde `409 INSUFFICIENT_STOCK`.

La creación reutiliza una única transacción: bloquea producto y balances en
orden estable, crea el balance destino si falta, registra una cabecera y
exactamente un `transfer_out` y un `transfer_in`, actualiza ambos balances y
mantiene intacto `items.stock`. Cualquier fallo revierte la cabecera, ledger y
balances. Viewer recibe `403 FORBIDDEN`.

`GET /api/transfers` requiere sesión y negocio activo; owner, manager y viewer
pueden consultar. Acepta `q`, `location` y `page`, usa paginación SQL de 20
filas y orden `created_at DESC, id DESC`. La búsqueda parcial incluye producto,
SKU y referencia. Una ubicación inválida o ajena devuelve cero resultados; el
conteo y las filas comparten los mismos filtros aislados por `business_id`.

`GET /api/transfers/:transferId` requiere los mismos permisos. Un ID inválido
responde `400 VALIDATION_ERROR`; una transferencia inexistente o ajena responde
`404 TRANSFER_NOT_FOUND`. Incluye cabecera, producto, ubicaciones, usuario y
los dos movimientos vinculados. Antes de responder confirma que existe
exactamente un `transfer_out` y un `transfer_in` coherentes con la cabecera; si
el historial fuese inconsistente devuelve un error interno genérico sin exponer
detalles de PostgreSQL.

### Categorías

`GET /api/categories` requiere sesión y negocio activo; owner, manager y
viewer pueden consultar. Acepta `q` y `page`, busca parcialmente por nombre sin
distinguir mayúsculas y pagina 20 categorías en PostgreSQL con orden
`LOWER(name), id`. Conteo y resultados comparten filtros por `business_id`.
Cada categoría incluye productos activos, productos archivados y existencias
totales solo de los activos, además de `isDefault` para identificar la
categoría predeterminada.

`GET /api/categories/:categoryId` requiere los mismos permisos. Un ID inválido
responde `400 VALIDATION_ERROR`; una categoría inexistente o ajena responde
`404 CATEGORY_NOT_FOUND`. Devuelve las mismas métricas y únicamente los
productos activos ordenados por nombre e ID. En esta primera consulta el
listado de productos del detalle no se pagina.

`POST /api/categories` requiere sesión, negocio activo, CSRF y rol `owner` o
`manager`; viewer recibe `403 FORBIDDEN`. Recibe `name` y `description`
opcional, recortada y normalizada a cadena vacía cuando no se indica. Nombre
duplicado en el mismo negocio, sin distinguir mayúsculas, responde `409
CATEGORY_ALREADY_EXISTS` asociado a `name`; los campos internos se rechazan
como `400 VALIDATION_ERROR`.

`GET /api/categories/:categoryId/edit` y `PUT /api/categories/:categoryId`
requieren los mismos permisos de gestión; el `PUT` requiere CSRF. Ambos limitan
la categoría por ID y `business_id`; una categoría ajena o inexistente responde
`404 CATEGORY_NOT_FOUND`. La actualización conserva los productos asociados y
el propio nombre no cuenta como duplicado.

`DELETE /api/categories/:categoryId` requiere sesión, negocio activo, CSRF y
rol `owner`; manager y viewer reciben `403 FORBIDDEN`. Limita la eliminación por
ID y `business_id`; una categoría ajena o inexistente responde `404
CATEGORY_NOT_FOUND`. Si contiene productos activos o archivados responde `409
CATEGORY_IN_USE` y no modifica productos. La FK mantiene la protección final
frente a una inserción concurrente. Una categoría vacía responde `204` sin
cuerpo. La categoría predeterminada del negocio puede renombrarse, pero no
eliminarse; su eliminación responde `409 DEFAULT_CATEGORY_PROTECTED`.

### Ubicaciones

`GET /api/locations` requiere sesión y negocio activo; owner, manager y viewer
pueden consultar. Acepta `q`, `status` (`active`, `inactive` o `all`) y `page`.
El estado predeterminado y los valores desconocidos son `active`; la búsqueda
parcial usa nombre o código. Cuenta y pagina 20 filas en PostgreSQL con los
mismos filtros obligatorios por `business_id`, ordenando principal, nombre e
ID. Cada fila incluye métricas agregadas de balances: stock almacenado y
productos con stock positivo.

`GET /api/locations/:locationId` requiere los mismos permisos. Un ID inválido
responde `400 VALIDATION_ERROR`; una ubicación inexistente o ajena responde
`404 LOCATION_NOT_FOUND`. Devuelve sus datos, métricas, productos con stock
positivo (incluidos archivados) y hasta cinco movimientos recientes. Todos los
joins se limitan por `business_id`; la respuesta usa `Cache-Control: no-store`.

`POST /api/locations` requiere sesión, negocio activo, CSRF y rol `owner`;
manager y viewer reciben `403 FORBIDDEN`. Recibe `name`, `code`,
`locationType` (`branch` o `warehouse`) y `address`, `phone`, `notes`
opcionales. El código se normaliza a mayúsculas y los opcionales vacíos a
`null`. Crea una ubicación activa no principal sin balances. Un nombre o código
duplicado en el negocio responde `409 LOCATION_ALREADY_EXISTS` asociado al
campo; los campos internos se rechazan como `400 VALIDATION_ERROR`.

`GET /api/locations/:locationId/edit` y `PUT /api/locations/:locationId`
requieren los mismos permisos; el `PUT` requiere CSRF. Ambos limitan por ID y
`business_id`, devuelven `404 LOCATION_NOT_FOUND` para recursos ajenos o
inexistentes y exponen solo los campos editables. La actualización no altera
estado, condición principal, balances, movimientos ni transferencias.

`POST /api/locations/:locationId/make-default`, `POST
/api/locations/:locationId/deactivate` y `POST
/api/locations/:locationId/reactivate` requieren sesión, negocio activo, CSRF
y rol `owner`; manager y viewer reciben `403 FORBIDDEN`. Las transiciones se
limitan por ID y `business_id` y devuelven `400 VALIDATION_ERROR` para un ID
inválido o `404 LOCATION_NOT_FOUND` para una ubicación ajena o inexistente.

Convertir en principal bloquea las ubicaciones del negocio en una transacción,
retira primero la condición anterior y establece la nueva; una ubicación
inactiva devuelve `409 LOCATION_INACTIVE` y una principal actual `409
LOCATION_ALREADY_DEFAULT`. Desactivar bloquea la ubicación antes de comprobar
balances: la principal devuelve `409 DEFAULT_LOCATION_REQUIRED`, una ubicación
con stock positivo `409 LOCATION_HAS_STOCK` y una ya inactiva `409
LOCATION_ALREADY_INACTIVE`. Reactivar una ubicación activa devuelve `409
LOCATION_ALREADY_ACTIVE`; no la convierte en principal. Ninguna transición
modifica balances, movimientos ni transferencias.

### Proveedores

`GET /api/suppliers` requiere sesión y negocio activo; owner, manager y viewer
pueden consultar. Acepta `q`, `status` (`active`, `inactive` o `all`) y `page`.
El estado predeterminado y los valores desconocidos son `active`; busca sin
distinguir mayúsculas por nombre, razón social, RFC, contacto y correo. El
conteo y las filas comparten filtros obligatorios por `business_id`, paginan 20
proveedores en PostgreSQL y ordenan por nombre e ID.

`GET /api/suppliers/:supplierId` requiere los mismos permisos. Un ID inválido
responde `400 VALIDATION_ERROR`; un proveedor inexistente o ajeno responde
`404 SUPPLIER_NOT_FOUND`. Devuelve únicamente datos empresariales seguros:
nombre, razón social, RFC, contacto, correo, teléfono, dirección, notas,
estado y fechas de creación/actualización, sin `business_id`.

`POST /api/suppliers` requiere sesión, negocio activo, CSRF y rol `owner` o
`manager`; viewer recibe `403 FORBIDDEN`. Acepta nombre comercial, razón
social, RFC o identificador fiscal, contacto, correo, teléfono, dirección y
notas. Los valores opcionales vacíos se guardan como `null`, el RFC conserva
la normalización a mayúsculas y el correo se normaliza a minúsculas. El
proveedor inicia activo; los campos internos, incluido estado y fechas, se
rechazan como `400 VALIDATION_ERROR`. Un nombre duplicado en el mismo negocio,
sin distinguir mayúsculas, responde `409 SUPPLIER_ALREADY_EXISTS` asociado a
`name`.

`GET /api/suppliers/:supplierId/edit` y `PUT /api/suppliers/:supplierId`
requieren los mismos permisos de gestión; el `PUT` requiere CSRF. Ambos
limitan el proveedor por ID y `business_id`, devuelven `404 SUPPLIER_NOT_FOUND`
para recursos ajenos o inexistentes y exponen o actualizan únicamente los
campos editables. La actualización no altera estado ni fechas directamente;
el trigger existente actualiza `updated_at`.

`POST /api/suppliers/:supplierId/deactivate` y `POST
/api/suppliers/:supplierId/reactivate` requieren sesión, negocio activo, CSRF
y rol `owner` o `manager`; viewer recibe `403 FORBIDDEN`. Ambas mutaciones
limitan por ID, `business_id` y el estado esperado, conservan los datos
empresariales y dejan que el trigger actualice `updated_at`. Un proveedor ajeno
o inexistente responde `404 SUPPLIER_NOT_FOUND`; un ID inválido responde `400
VALIDATION_ERROR`. Desactivar uno ya inactivo responde `409
SUPPLIER_ALREADY_INACTIVE`; reactivar uno ya activo responde `409
SUPPLIER_ALREADY_ACTIVE`.

### Alertas de existencias

`GET /api/alerts/stock` requiere sesión, negocio activo y cualquier rol de
membresía activo. Devuelve alertas paginadas de 20 filas exclusivamente para
productos y ubicaciones activos que tengan un umbral configurado y un saldo
local menor o igual al mínimo; un balance ausente equivale a cero. Acepta `q`,
`category`, `location`, `status` (`all`, `out_of_stock`, `low_stock`) y
`page`. IDs inválidos o ajenos devuelven cero filas sin revelar recursos. Los
resultados y su conteo comparten filtros, se aíslan por `business_id` y se
ordenan por agotados, stock, producto, ubicación e IDs. La respuesta indica si
owner/manager podrán gestionar umbrales en una fase posterior.

### Reporte de existencias

`GET /api/reports/inventory` requiere sesión, negocio activo y rol owner,
manager o viewer. Acepta `q`, `category`, `location`, `productStatus`,
`stockRows` y `page`; usa 25 filas y paginación SQL. Owner puede elegir
productos `active`, `archived` o `all`; manager/viewer siempre reciben
`active`, incluso si manipulan la URL. Categoría o ubicación inválida o ajena
produce cero filas. El conteo y las filas comparten filtros, cada join exige
el negocio activo y un balance ausente equivale a cero. La respuesta devuelve
productos, ubicaciones, existencias local/total, opciones de filtros y
paginación sin exponer `business_id`.

`GET /api/reports/movements` requiere los mismos permisos y acepta `q`,
`dateFrom`, `dateTo`, `location`, `user`, `movementType` y `page`. Las fechas
usan `YYYY-MM-DD`, el fin es inclusivo y un rango inválido devuelve `400
VALIDATION_ERROR`. Owner puede incluir movimientos de archivados; manager y
viewer reciben solo activos. Opciones ajenas producen cero filas y resultados/
conteo comparten filtros por negocio, orden `created_at DESC, id DESC` y
paginación SQL.

`GET /api/reports/inventory.csv` requiere owner, manager o viewer y acepta los
mismos filtros del reporte de existencias excepto `page`, que se ignora. Owner
puede exportar archivados; manager/viewer se limitan a activos. Descarga
`existencias.csv` con `Content-Type: text/csv; charset=utf-8`; errores se
responden como JSON y los filtros ajenos generan encabezados sin filas.

`GET /api/reports/movements.csv` requiere los mismos roles y acepta `q`,
`dateFrom`, `dateTo`, `location`, `user` y `movementType`; `page` se ignora.
Owner puede exportar archivados, mientras manager/viewer reciben solo activos.
Fechas inválidas o rangos invertidos devuelven `400 VALIDATION_ERROR`. Descarga
`movimientos.csv` como `text/csv; charset=utf-8`; los errores se devuelven JSON.

`GET /api/products/:productId/thresholds` requiere owner o manager y devuelve
el producto activo junto con sus ubicaciones activas, saldo local y umbral por
ubicación. `PUT` y `DELETE` sobre `/api/products/:productId/thresholds/:locationId`
requieren además CSRF. El mínimo acepta enteros de 0 a 1,000,000; cero es
válido y con stock cero sigue siendo `out_of_stock`. Crear/actualizar conserva
el creador original, no altera balances ni movimientos y devuelve `200`.
Eliminar devuelve `204`, o `404 THRESHOLD_NOT_FOUND` si no existe. Viewer
recibe `403 FORBIDDEN`; producto archivado, ajeno o inexistente devuelve
`404 PRODUCT_NOT_FOUND`.

### Miembros e invitaciones

`GET /api/members` requiere sesión, negocio activo y rol `owner`; manager y
viewer reciben `403 FORBIDDEN`. Devuelve las membresías y las invitaciones del
negocio activo, además del total de membresías activas y de invitaciones
pendientes vigentes. Las filas se restringen por `business_id`, no contienen
hashes, roles globales ni datos de sesión, y usan `Cache-Control: no-store`.

Las membresías incluyen usuario seguro, rol, estado, fechas e indicador del
usuario actual; se ordenan por owner, membresías activas, nombre e ID. Las
invitaciones incluyen correo normalizado, rol ofrecido, estado, fechas e
invitador seguro; se ordenan con las pendientes primero. `isExpired` se calcula
en la consulta únicamente para una invitación `pending` cuyo vencimiento ya
ocurrió, sin modificar su estado. El resumen cuenta solo las pendientes que no
han vencido.

`POST /api/members/invitations` requiere sesión, negocio activo, CSRF y rol
`owner`; manager y viewer reciben `403 FORBIDDEN`. Recibe `email` y
`offeredRole` (`manager` o `viewer`), normaliza el correo y rechaza campos
internos. Un correo con membresía activa en el negocio responde `409
INVITATION_MEMBER_ALREADY_ACTIVE`. Crea un token aleatorio criptográfico, guarda
solo su SHA-256 y devuelve una única vez `acceptancePath`, una ruta relativa
compatible con la aceptación EJS existente; el hash nunca se expone. Antes de
crear, la transacción marca como `expired` una pendiente ya vencida y revoca la
pendiente vigente previa del mismo correo, para dejar solo una pendiente. Si la
creación falla, la transacción conserva la invitación anterior.

`POST /api/members/invitations/:invitationId/revoke` requiere los mismos
permisos y CSRF. Limita el `UPDATE` por ID, `business_id` y estado `pending`, y
cambia solamente el estado a `revoked`. Un ID inválido devuelve `400
VALIDATION_ERROR`, una invitación ajena o inexistente devuelve `404
INVITATION_NOT_FOUND`, y una aceptada, vencida o ya revocada devuelve `409
INVITATION_NOT_PENDING` sin cambios.

`PUT /api/members/:membershipId/role`, `POST /api/members/:membershipId/suspend`,
`/reactivate` y `/remove` requieren sesión, negocio activo, CSRF y rol `owner`.
Solo administran membresías `manager` o `viewer` del negocio activo. Cambiar
rol acepta únicamente esos dos roles y no altera estado ni fechas; se permite
para membresías activas o suspendidas. Suspender pasa de `active` a
`suspended`; reactivar pasa de `suspended` o `removed` a `active` sin crear una
fila nueva; remover marca `active` o `suspended` como `removed`. El owner queda
protegido con `409 OWNER_PROTECTED`; los estados repetidos devuelven
`MEMBER_ROLE_UNCHANGED`, `MEMBER_ALREADY_SUSPENDED`, `MEMBER_ALREADY_ACTIVE` o
`MEMBER_ALREADY_REMOVED`. Un miembro ajeno o inexistente devuelve `404
MEMBER_NOT_FOUND` y entradas inválidas `400 VALIDATION_ERROR`.

### Consulta y aceptación pública de invitaciones

`GET /api/invitations/:token` no requiere sesión y no modifica la invitación.
Busca exclusivamente el SHA-256 del token y devuelve solo el correo invitado,
rol ofrecido, vencimiento y nombre/slug del negocio cuando la invitación sigue
`pending`. Una pendiente vencida conserva la respuesta `200` con
`isExpired: true`; un token inválido, revocado o aceptado devuelve `404
INVITATION_NOT_FOUND`. La respuesta también indica si hay sesión y si su correo
normalizado coincide. Nunca expone IDs, hashes ni datos del invitador.

`POST /api/invitations/:token/accept` requiere sesión autenticada y CSRF. Bajo
bloqueo transaccional comprueba que la invitación siga pendiente, vigente y
dirigida al correo de la sesión, reactiva o crea únicamente una membresía
`manager` o `viewer` conforme a la regla existente y marca la invitación como
aceptada en un solo uso. Devuelve `401 AUTH_REQUIRED` sin sesión, `403
INVITATION_EMAIL_MISMATCH` por correo distinto, `410 INVITATION_EXPIRED` si
venció y `404 INVITATION_NOT_FOUND` si ya no está disponible. Al completarse,
selecciona el negocio en la sesión y devuelve el negocio, membresía y permisos
seguros.

`acceptancePath` continúa siendo una ruta relativa (`/invitations/:token`). En
desarrollo Vite no la redirige a Express, para que abra la ruta React en el
origen actual; la ruta EJS homónima permanece disponible al abrir Express de
forma directa. Así no se codifican puertos en los componentes y el despliegue
final de mismo origen conserva el enlace.

## Autenticación

### `POST /api/auth/register`

Entrada:

```json
{
  "username": "diego",
  "email": "diego@example.com",
  "password": "contraseña",
  "passwordConfirmation": "contraseña"
}
```

Es público y requiere CSRF. Conserva las reglas de usuario de 3 a 30
caracteres con letras, números o guion bajo, correo normalizado y contraseña
de 8 a 64 caracteres (máximo 72 bytes UTF-8), junto con confirmación idéntica.
Rechaza roles, membresías y otros campos internos. Éxito `201` crea solo una
cuenta global con rol de plataforma `user`, regenera la sesión y devuelve el
usuario seguro, negocios vacíos, negocio y membresía nulos, permisos nulos y
`requiresBusinessSelection: false`. Nunca devuelve `password_hash` ni crea
membresías.

Errores: `400 VALIDATION_ERROR` por validación, `409
USERNAME_ALREADY_EXISTS`, `EMAIL_ALREADY_EXISTS` o `REGISTRATION_CONFLICT` con
errores por campo si uno o ambos valores ya existen, y `429 RATE_LIMITED` por
el límite de solicitudes. Las carreras contra índices únicos se convierten en
el mismo conflicto seguro.

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

Este contrato no cubre todavía todos los flujos de transición de las vistas
EJS ni mutaciones administrativas de negocios.

## Decisiones pendientes

- Duración y renovación de sesión.
- Estrategia de despliegue: Render frente a Railway.
- Momento exacto para retirar EJS.

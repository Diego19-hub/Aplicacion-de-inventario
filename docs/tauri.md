# Aplicación de escritorio con Tauri

La aplicación reutiliza el frontend de `client/` y su salida `client/dist/`. No crea una base de datos local ni almacena contraseñas, tokens o información sensible dentro de Tauri.

## Requisitos

- Node.js y npm.
- Rust estable instalado mediante `rustup`.
- Windows: Microsoft C++ Build Tools y WebView2.
- macOS: Xcode Command Line Tools.

## URL del backend

El frontend acepta `VITE_API_URL` para la aplicación de escritorio:

```bash
VITE_API_URL=https://api.ejemplo.com
```

Si se deja vacía, la aplicación web conserva sus rutas relativas `/api` y el proxy de Vite hacia `http://localhost:3000`.

## Desarrollo y empaquetado

```bash
npm run tauri:dev
npm run build
npm run tauri:build
```

`tauri:build` genera el instalador NSIS para Windows o DMG para macOS, según el sistema operativo y las herramientas disponibles.

La configuración solo habilita la ventana principal y no añade permisos para leer archivos, ejecutar comandos ni acceder a credenciales.

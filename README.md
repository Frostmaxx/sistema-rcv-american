# Sistema RCV

Sistema web para la gestión de seguros de Responsabilidad Civil Vehicular.

## Características

- **Gestión de Pólizas:** Emisión, renovación y control de vencimientos.
- **Impresión de Documentos:** Generación de comprobantes tipo Carta y Carnet (estilo licencia) con códigos QR de validación.
- **Gestión de Clientes y Usuarios:** Administración completa de asegurados y usuarios del sistema.
- **Dashboard:** Panel de control con métricas clave y accesos directos.
- **Seguridad:** Autenticación mediante JWT y roles de usuario.

## Requisitos

- Node.js (v18 o superior)
- MySQL 8+ o MariaDB 11+
- Navegador web moderno

## Instalación

1. Clonar el repositorio o descargar los archivos.
2. Abrir una terminal en la carpeta del proyecto.
3. Instalar las dependencias:
   ```bash
   npm install
   ```

## Configuración

1. Copiar `.env.example` a `.env` y configurar las credenciales de MySQL/MariaDB, el secreto `JWT_SECRET` y el puerto (por defecto `4000`):
   ```bash
   cp .env.example .env
   ```
2. Crear la base de datos configurada en `DB_NAME` (por defecto `rcv_db`); al iniciar el servidor se crean automáticamente las tablas necesarias y el usuario administrador inicial si la tabla `users` está vacía.

## Ejecución

Para iniciar el servidor:

```bash
npm start
```

Comandos útiles adicionales:

```bash
npm test                 # Ejecutar pruebas unitarias y de integración
npm run backup           # Generar respaldo SQL en backups/ (retención de 14 días)
npm run restore-superadmin  # Reparar tabla users y restaurar el superadmin de emergencia
```

El sistema estará disponible en: [http://localhost:4000](http://localhost:4000)
Endpoint de monitoreo: `GET /api/health`

## Superadmin de Emergencia

Las variables `EMERGENCY_SUPERADMIN_USER` y `EMERGENCY_SUPERADMIN_PASSWORD` (o `EMERGENCY_SUPERADMIN_PASSWORD_HASH`) en `.env` garantizan una cuenta `superadmin` protegida contra eliminación/degradación y capaz de restaurar la tabla `users` automáticamente en caso de pérdida o corrupción.

## Despliegue en Hosting desde GitHub

1. **Base de datos SQL (MySQL 8+ / MariaDB 10.6+):**
   - Crea una base de datos vacía en tu panel (cPanel/phpMyAdmin, Plesk, Railway, etc.) y anota `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` (o `DATABASE_URL`).
   - Opcionalmente importa [db/schema.sql](db/schema.sql) (o un respaldo SQL propio si migras datos existentes); al iniciar, `server.js` también crea automáticamente tablas e índices faltantes.
2. **Variables de entorno en el hosting (`.env` o panel del proveedor):**
   - `NODE_ENV=production`
   - `JWT_SECRET` (clave aleatoria larga de 32+ caracteres)
   - `CORS_ORIGIN=https://tudominio.com`
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (o `DATABASE_URL` + `DB_SSL=true` si tu proveedor exige SSL)
   - `EMERGENCY_SUPERADMIN_USER`, `EMERGENCY_SUPERADMIN_EMAIL` y `EMERGENCY_SUPERADMIN_PASSWORD` (o `EMERGENCY_SUPERADMIN_PASSWORD_HASH`)
3. **Instalación y arranque en Shared Hosting con Node.js (cPanel / Plesk / DirectAdmin / Hostinger):**
   - Clona el repositorio desde **Git™ Version Control** (rama `main`) en una carpeta del hosting (ej. `/home/usuario/sistema-rcv`).
   - En **Setup Node.js App** (Phusion Passenger):
     - **Node.js version:** `18` o `20` (LTS).
     - **Application mode:** `Production`.
     - **Application root:** carpeta donde clonaste el repo.
     - **Application URL:** dominio o subdominio raíz (ej. `rcv.tudominio.com`).
     - **Application startup file:** `app.js` o `server.js` (ambos funcionan).
   - Presiona **Run NPM Install** (o ejecuta `npm install --omit=dev`; todas las dependencias son JS puro, sin compilación nativa).
   - Carga las variables de entorno en el panel de la app Node.js (o en un archivo `.env` dentro del *Application root*) y reinicia la aplicación.
   - Verifica el arranque entrando a `https://tudominio.com/api/health` (`{"status":"ok","db":"connected"}`).

## Estructura del Proyecto

- `public/`: Frontend (HTML, CSS, JS, imágenes).
- `routes/`: API Backend (Express, incluyendo `/api/audit`).
- `db/`: Capa de base de datos (MySQL / MariaDB, índices y bitácora).
- `middleware/`: Autenticación, roles y cabeceras de seguridad / CORS.
- `utils/`: Utilidades compartidas (coberturas, firmas QR HMAC, rate limiter, auditoría y recuperación).
- `scripts/`: Herramientas CLI de respaldo y recuperación.
- `tests/`: Suite de pruebas con `node --test`.

# Sistema RCV

Sistema web para la gestión de seguros de Responsabilidad Civil Vehicular.

## Características

- **Gestión de Pólizas:** Emisión, renovación y control de vencimientos.
- **Impresión de Documentos:** Generación de comprobantes tipo Carta y Carnet (estilo licencia) con códigos QR de validación.
- **Gestión de Clientes y Usuarios:** Administración completa de asegurados y usuarios del sistema.
- **Dashboard:** Panel de control con métricas clave y accesos directos.
- **Seguridad:** Autenticación mediante JWT y roles de usuario.

## Requisitos

- Node.js (v14 o superior)
- Navegador web moderno

## Instalación

1. Clonar el repositorio o descargar los archivos.
2. Abrir una terminal en la carpeta del proyecto.
3. Instalar las dependencias:
   ```bash
   npm install
   ```

## Configuración

1. El sistema utiliza una base de datos SQLite local (`db/rcv.db`), que se inicializa automáticamente si no existe.
2. (Opcional) Configurar las variables de entorno en un archivo `.env` si se requiere personalizar el puerto o secretos (por defecto usa puerto 3000).

## Ejecución

Para iniciar el servidor:

```bash
npm start
```

O para desarrollo (si tienes nodemon o similar):

```bash
npm run dev
```

El sistema estará disponible en: [http://localhost:3000](http://localhost:3000)

## Estructura del Proyecto

- `public/`: Frontend (HTML, CSS, JS, imágenes).
- `routes/`: API Backend (Express).
- `db/`: Capa de base de datos (SQLite).
- `middleware/`: Lógica intermedia (Autenticación).

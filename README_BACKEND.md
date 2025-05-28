# Backend - Registro de Actividades

Este backend está desarrollado en **Node.js** usando **Express** y conecta con Firebase Admin SDK para crear, listar, eliminar y actualizar usuarios.

## 🚀 Instrucciones para subirlo a Render

1. Sube la carpeta a un nuevo repositorio de GitHub (por ejemplo: `registro-actividades-backend`)
2. Ve a [https://render.com](https://render.com) y crea una cuenta gratuita.
3. Crea un nuevo servicio tipo **Web Service**.
4. Conecta tu repositorio.
5. En configuración:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Node Version**: 18 o superior
6. Antes de hacer deploy:
   - Ve a la pestaña **Environment** y agrega una variable:
     - KEY: `GOOGLE_APPLICATION_CREDENTIALS`
     - VALUE: `firebase-service-account.json`
7. Sube tu archivo `firebase-service-account.json` desde la pestaña **Files**.

## Endpoints disponibles

- `POST /create-user`
- `GET /list-users`
- `DELETE /delete-user/:uid`
- `PUT /update-password`

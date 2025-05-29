// 📁 backend/index.js

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require("body-parser");
HEAD
const serviceAccount = require("./firebase-service-account.json");

// ✅ Leer la clave desde variable de entorno (Render)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// ✅ Crear usuario
app.post('/create-user', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send({ error: 'Faltan email o password' });

  try {
    const user = await admin.auth().createUser({ email, password });
    res.status(200).send({ uid: user.uid });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// ✅ Listar usuarios
app.get('/list-users', async (req, res) => {
  try {
    const list = await admin.auth().listUsers(1000);
    const usuarios = list.users.map(u => ({
      uid: u.uid,
      email: u.email
    }));
    res.status(200).send({ users: usuarios });
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ✅ Eliminar usuario
app.post('/delete-user', async (req, res) => {
  const { uid } = req.body;
  try {
    await admin.auth().deleteUser(uid);
    res.status(200).send({ message: 'Usuario eliminado' });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// ✅ Actualizar contraseña
app.post('/update-password', async (req, res) => {
  const { uid, password } = req.body;
  if (!uid || !password) {
    return res.status(400).send({ error: 'Faltan datos: uid o contraseña' });
  }

  try {
    await admin.auth().updateUser(uid, { password });
    res.status(200).send({ message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// ✅ Ruta raíz
app.get("/", (req, res) => {
  res.send("Backend de Daehan Shipping activo");
});

// ✅ Usar el puerto dinámico de Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});

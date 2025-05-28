const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// ⚠️ Leer clave de Firebase desde variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Ruta raíz para verificar funcionamiento
app.get("/", (req, res) => {
  res.send("🚀 API de Daehan Shipping funcionando");
});

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
    res.status(200).send(usuarios);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// ✅ Eliminar usuario
app.delete('/delete-user/:uid', async (req, res) => {
  const { uid } = req.params;
  try {
    await admin.auth().deleteUser(uid);
    res.status(200).send({ message: 'Usuario eliminado' });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// ✅ Actualizar contraseña
app.put('/update-password', async (req, res) => {
  const { uid, newPassword } = req.body;
  if (!uid || !newPassword) {
    return res.status(400).send({ error: 'Faltan datos: uid o nueva contraseña' });
  }

  try {
    await admin.auth().updateUser(uid, { password: newPassword });
    res.status(200).send({ message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor Express escuchando en http://localhost:${PORT}`);
});

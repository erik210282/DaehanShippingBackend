// 📁 backend/index.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const supabase = require("./supabase");

const app = express();
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// 🔒 Middleware de validación de API Key
const validarApiKey = (req, res, next) => {
  const clave = req.headers["x-api-key"];
  if (!clave || clave !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({ error: "No autorizado" });
  }
  next();
};

// ✅ Crear usuario
app.post("/create-user", validarApiKey, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Faltan email o password" });

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json({ uid: data.user.id });
  } catch (error) {
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

// ✅ Listar usuarios
app.get("/list-users", validarApiKey, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) return res.status(500).json({ error: error.message });

    const usuarios = data.users.map((u) => ({
      uid: u.id,
      email: u.email,
    }));

    res.status(200).json({ users: usuarios });
  } catch {
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

// ✅ Eliminar usuario
app.post("/delete-user", validarApiKey, async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "Falta el uid" });

  try {
    const { error } = await supabase.auth.admin.deleteUser(uid);
    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: "Usuario eliminado" });
  } catch {
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

// ✅ Actualizar contraseña
app.post("/update-password", validarApiKey, async (req, res) => {
  const { uid, password } = req.body;
  if (!uid || !password) {
    return res.status(400).json({ error: "Faltan datos: uid o contraseña" });
  }

  try {
    const { error } = await supabase.auth.admin.updateUserById(uid, {
      password,
    });

    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: "Contraseña actualizada" });
  } catch {
    res.status(500).json({ error: "Error al actualizar contraseña" });
  }
});

// ✅ Ruta pública
app.get("/", (req, res) => {
  res.send("Backend de Daehan Shipping activo");
});

// ✅ Puerto
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});

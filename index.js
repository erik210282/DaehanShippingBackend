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

// ✅ Crear usuario con rol/activo/display_name y upsert en profiles
app.post("/create-user", validarApiKey, async (req, res) => {
  const { email, password, display_name = "", role = "operador", is_active = true } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Faltan email o password" });

  try {
    // 1) Crear usuario en Auth con metadatos (útil si luego usas un trigger)
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name, role, is_active },
    });
    if (createErr) return res.status(400).json({ error: createErr.message });

    const uid = created.user.id;

    // 2) Crear/actualizar fila en profiles (garantiza que LoginScreen encuentre el perfil)
    const { error: upsertErr } = await supabase
      .from("profiles")
      .upsert({ id: uid, display_name, role, is_active }, { onConflict: "id" });
    if (upsertErr) return res.status(400).json({ error: upsertErr.message });

    return res.status(200).json({ uid });
  } catch (error) {
    console.error("❌ Error al crear usuario:", error);
    return res.status(500).json({ error: "Error al crear usuario" });
  }
});

// ✅ Listar usuarios + merge con profiles (role, is_active, display_name)
app.get("/list-users", validarApiKey, async (req, res) => {
  try {
    const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
    if (authErr) return res.status(500).json({ error: authErr.message });

    const users = authData.users || [];
    const uids = users.map((u) => u.id);

    let profiles = [];
    if (uids.length > 0) {
      const { data: profData, error: profErr } = await supabase
        .from("profiles")
        .select("id, role, is_active, display_name")
        .in("id", uids);
      if (profErr) return res.status(500).json({ error: profErr.message });
      profiles = profData || [];
    }

    const merged = users.map((u) => {
      const p = profiles.find((x) => x.id === u.id);
      return {
        uid: u.id,
        email: u.email,
        role: p?.role ?? "operador",
        is_active: p?.is_active ?? true,
        display_name: p?.display_name ?? "",
      };
    });

    res.status(200).json({ users: merged });
  } catch (error) {
    console.error("❌ Error al listar usuarios:", error);
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


// ✅ Actualizar rol y/o activo en profiles
app.post("/update-user-role", validarApiKey, async (req, res) => {
  const { uid, role, is_active } = req.body;
  if (!uid) return res.status(400).json({ error: "UID requerido" });

  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(role ? { role } : {}),
        ...(typeof is_active === "boolean" ? { is_active } : {}),
      })
      .eq("id", uid);

    if (error) return res.status(400).json({ error: error.message });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("❌ Error al actualizar rol/activo:", error);
    res.status(500).json({ error: "Error al actualizar rol/activo" });
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

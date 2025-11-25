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

  // ✅ Crear usuario con rol/activo/nombre y registrar en operadores
  app.post("/create-user", validarApiKey, async (req, res) => {
    const {
      email,
      password,
      nombre = "",
      role = "",
      is_active = true,
    } = req.body;

    if (!email || !password || !nombre) {
      return res.status(400).json({ error: "Faltan email, password o nombre" });
    }

    try {
      // 1) Crear usuario en Auth con metadatos opcionales
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, role, is_active, full_name: nombre },
      });
      if (createErr) {
        console.error("❌ Error Supabase Auth createUser:", createErr);
        return res.status(400).json({
          error: createErr.message || "Auth error",
          details: createErr,     
        });
      }

      const uid = created.user.id;

      // 2) Insertar registro en la tabla operadores (tabla maestra)
      const { error: opErr } = await supabase
        .from("operadores")
        .insert([
          {
            uid,
            nombre,
            email,
            role,
            activo: is_active,
          },
        ]);

      if (opErr) {
        console.error("❌ Error al insertar en operadores:", opErr);
        await supabase.auth.admin.deleteUser(uid);
        return res.status(400).json({
          error: opErr.message || "DB error",
          details: opErr,
        });
      }

      return res.status(200).json({ uid });
    } catch (error) {
      console.error("❌ Error general al crear usuario:", error);
      return res.status(500).json({ error: "Error al crear usuario" });
    }
  });

  // ✅ Listar usuarios usando Auth + tabla operadores (nombre, role, activo, email)
  app.get("/list-users", validarApiKey, async (req, res) => {
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) {
        console.error("❌ Error listUsers Auth:", authErr);
        return res.status(500).json({ error: authErr.message });
      }

      const users = authData.users || [];
      const uids = users.map((u) => u.id);

      let operadores = [];
      if (uids.length > 0) {
        const { data: opsData, error: opsErr } = await supabase
          .from("operadores")
          .select("uid, nombre, email, role, activo")
          .in("uid", uids);

        if (opsErr) {
          console.error("❌ Error consultando operadores:", opsErr);
          return res.status(500).json({ error: opsErr.message });
        }

        operadores = opsData || [];
      }

      const merged = users.map((u) => {
        const op = operadores.find((x) => x.uid === u.id);
        return {
          uid: u.id,
          email: op?.email ?? u.email,
          role: op?.role ?? "operador",
          is_active: op?.activo ?? true,
          nombre: op?.nombre ?? "",
        };
      });

      res.status(200).json({ users: merged });
    } catch (error) {
      console.error("❌ Error al listar usuarios:", error);
      res.status(500).json({ error: "Error al listar usuarios" });
    }
  });

  // ✅ Eliminar usuario: operadores + Auth
  app.post("/delete-user", validarApiKey, async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "Falta el uid" });

    try {
      // 1) Borrar de operadores
      const { error: opErr } = await supabase
        .from("operadores")
        .delete()
        .eq("uid", uid);

      if (opErr) {
        console.error("❌ Error borrando en operadores:", opErr);
        // seguimos, intentamos borrar en Auth de todos modos
      }

      // 2) Borrar en Auth
      const { error: authErr } = await supabase.auth.admin.deleteUser(uid);
      if (authErr) {
        console.error("❌ Error borrando en Auth:", authErr);
        return res.status(400).json({ error: authErr.message });
      }

      res.status(200).json({ message: "Usuario eliminado" });
    } catch (error) {
      console.error("❌ Error general al eliminar usuario:", error);
      res.status(500).json({ error: "Error al eliminar usuario" });
    }
  });

  // ✅ Actualizar rol y/o activo en operadores
  app.post("/update-user-role", validarApiKey, async (req, res) => {
    const { uid, role, is_active } = req.body;
    if (!uid) return res.status(400).json({ error: "UID requerido" });

    try {
      const campos = {
        ...(role ? { role } : {}),
        ...(typeof is_active === "boolean" ? { activo: is_active } : {}),
      };

      if (Object.keys(campos).length === 0) {
        return res.status(400).json({ error: "Nada que actualizar" });
      }

      const { error } = await supabase
        .from("operadores")
        .update(campos)
        .eq("uid", uid);

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

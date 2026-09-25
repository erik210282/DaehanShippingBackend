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

const validarSupervisor = async (req, res, next) => {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Sesión requerida" });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Sesión inválida" });
  const { data: profile } = await supabase.from("operadores")
    .select("role, activo").eq("uid", user.id).maybeSingle();
  if (profile?.role !== "supervisor" || profile.activo !== true) {
    return res.status(403).json({ error: "Supervisor activo requerido" });
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
        await supabase.auth.admin.deleteUser(uid);
        return res.status(400).json({
          error: opErr.message || "DB error",
          details: opErr,
        });
      }

      if (!is_active) {
        const { error: banErr } = await supabase.auth.admin.updateUserById(uid, {
          ban_duration: "876000h",
        });
        if (banErr) {
          await supabase.from("operadores").delete().eq("uid", uid);
          await supabase.auth.admin.deleteUser(uid);
          return res.status(400).json({ error: banErr.message });
        }
      }

      return res.status(200).json({ uid });
    } catch (error) {
      return res.status(500).json({ error: "Error al crear usuario" });
    }
  });

  // ✅ Listar usuarios usando Auth + tabla operadores (nombre, role, activo, email)
  app.get("/list-users", validarApiKey, async (req, res) => {
    try {
      const { data: authData, error: authErr } = await supabase.auth.admin.listUsers();
      if (authErr) {
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
      res.status(500).json({ error: "Error al listar usuarios" });
    }
  });

  // ✅ Eliminar usuario: SOLO si no tiene registros; si tiene, obligar a inactivarlo
  app.post("/delete-user", validarApiKey, async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "Falta el uid" });

    try {
      // 0) Verificar si tiene registros en actividades / tareas
        const { count: actsCount, error: actsErr } = await supabase
        .from("actividades_realizadas")
        .select("id", { count: "exact", head: true })
        .eq("uid_operador", uid);

      const { count: tareasCount, error: tareasErr } = await supabase
        .from("tareas_pendientes")
        .select("id", { count: "exact", head: true })
        .eq("uid_operador", uid);

      if (actsErr || tareasErr) {
        // 🧱 Cualquier problema al verificar = tratar como que tiene registros
        return res.status(400).json({ error: "user_has_linked_records" });
      }

      if ((actsCount ?? 0) > 0 || (tareasCount ?? 0) > 0) {
        // Tiene registros; NO permitir borrar
        return res.status(400).json({ error: "user_has_linked_records" });
      }

      // 1) Borrar de operadores
      const { error: opErr } = await supabase
        .from("operadores")
        .delete()
        .eq("uid", uid);

      if (opErr) {
        return res.status(400).json({ error: opErr.message });
      }

      // 2) Borrar en Auth
      const { error: authErr } = await supabase.auth.admin.deleteUser(uid);
      if (authErr) {
        return res.status(400).json({ error: authErr.message });
      }

      res.status(200).json({ message: "Usuario eliminado" });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar usuario" });
    }
  });

  // ✅ Actualizar rol y/o activo en operadores
  app.post("/update-user-role", validarApiKey, validarSupervisor, async (req, res) => {
    const { uid, role, is_active } = req.body;
    if (!uid) return res.status(400).json({ error: "UID requerido" });

    try {
      const { data: previous, error: readError } = await supabase.from("operadores")
        .select("activo").eq("uid", uid).maybeSingle();
      if (readError || !previous) return res.status(404).json({ error: "Operador no encontrado" });

      const campos = {
        ...(role ? { role } : {}),
        ...(typeof is_active === "boolean" ? { activo: is_active } : {}),
      };

      if (Object.keys(campos).length === 0) {
        return res.status(400).json({ error: "Nada que actualizar" });
      }

      if (typeof is_active === "boolean") {
        const { error: authError } = await supabase.auth.admin.updateUserById(uid, {
          ban_duration: is_active ? "none" : "876000h",
        });
        if (authError) return res.status(400).json({ error: authError.message });
      }

      const { error } = await supabase
        .from("operadores")
        .update(campos)
        .eq("uid", uid);

      if (error) {
        if (typeof is_active === "boolean") {
          await supabase.auth.admin.updateUserById(uid, {
            ban_duration: previous.activo ? "none" : "876000h",
          });
        }
        return res.status(400).json({ error: error.message });
      }
      res.status(200).json({ ok: true });
    } catch (error) {
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
  });

  // Accounts disabled before this endpoint was introduced must also be banned
  // in Auth. Reconcile in the background on each deployment without changing
  // their historical operator rows.
  (async () => {
    const { data, error } = await supabase.from("operadores")
      .select("uid").eq("activo", false).not("uid", "is", null);
    if (error) return;
    for (const operator of data || []) {
      try {
        const { error: banError } = await supabase.auth.admin.updateUserById(operator.uid, { ban_duration: "876000h" });
        if (banError) console.error("Could not synchronize inactive Auth account", banError.message);
      } catch (error) { console.error("Could not synchronize inactive Auth account", error.message); }
    }
  })();

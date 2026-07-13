import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import supabase from "../db/supabase.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/register
router.post("/register", async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name) {
      return res
        .status(400)
        .json({ error: "Todos los campos son obligatorios" });
    }

    // Check if user exists
    const { data: existing } = await supabase
      .from("cons_users")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      return res.status(409).json({ error: "El correo ya está registrado" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const { data: user, error } = await supabase
      .from("cons_users")
      .insert({ email, password_hash, full_name })
      .select("id, email, full_name, created_at")
      .single();

    if (error) throw error;

    // Create personal organization
    const { data: org } = await supabase
      .from("cons_organizations")
      .insert({ name: `${full_name}`, owner_id: user.id })
      .select("id")
      .single();

    // Add user as owner of their org
    await supabase
      .from("cons_organization_members")
      .insert({ organization_id: org.id, user_id: user.id, role: "owner" });

    const token = jwt.sign(
      { id: user.id, email: user.email, organization_id: org.id },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    res.status(201).json({ user, token, organization_id: org.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const { data: user, error } = await supabase
      .from("cons_users")
      .select("id, email, full_name, password_hash, avatar_url, is_active")
      .eq("email", email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    // Check if user is active
    if (user.is_active === false) {
      return res.status(403).json({ error: "Tu cuenta ha sido desactivada. Contacta al administrador." });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from("cons_organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        organization_id: membership?.organization_id,
      },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    const { password_hash, is_active, ...safeUser } = user;
    const isSuperAdmin = membership?.organization_id === process.env.MASTER_ORG_ID
    res.json({
      user: safeUser,
      token,
      organization_id: membership?.organization_id,
      is_super_admin: isSuperAdmin,
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/change-password
router.put("/change-password", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No autorizado" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Contraseña actual y nueva son obligatorias" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    const { data: user } = await supabase
      .from("cons_users")
      .select("id, password_hash")
      .eq("id", decoded.id)
      .single();

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "La contraseña actual es incorrecta" });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const { error } = await supabase
      .from("cons_users")
      .update({ password_hash: newHash })
      .eq("id", decoded.id);

    if (error) throw error;
    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Token inválido" });
    }
    next(err);
  }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "El correo es obligatorio" });

    const { data: user } = await supabase
      .from("cons_users")
      .select("id, email, full_name")
      .eq("email", email)
      .single();

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña" });

    // Generate a reset token (JWT with short expiry)
    const resetToken = jwt.sign(
      { id: user.id, email: user.email, purpose: "password_reset" },
      JWT_SECRET,
      { expiresIn: "1h" },
    );

    // Store reset token in DB
    await supabase
      .from("cons_users")
      .update({ reset_token: resetToken, reset_token_expires: new Date(Date.now() + 3600000).toISOString() })
      .eq("id", user.id);

    // TODO: Send email with reset link (for now, log it)
    const resetUrl = `${process.env.FRONTEND_URL || 'https://construgest-web-git-main-benjamins-projects-1d0caeba.vercel.app'}/login?reset_token=${resetToken}`;
    console.log(`[Password Reset] User: ${user.email}, URL: ${resetUrl}`);

    res.json({ message: "Si el correo existe, recibirás un enlace para restablecer tu contraseña" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token: resetToken, new_password } = req.body;
    if (!resetToken || !new_password) {
      return res.status(400).json({ error: "Token y nueva contraseña son obligatorios" });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres" });
    }

    let decoded;
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: "El enlace ha expirado o no es válido" });
    }

    if (decoded.purpose !== "password_reset") {
      return res.status(400).json({ error: "Token no válido para restablecer contraseña" });
    }

    // Verify token matches stored one
    const { data: user } = await supabase
      .from("cons_users")
      .select("id, reset_token")
      .eq("id", decoded.id)
      .single();

    if (!user || user.reset_token !== resetToken) {
      return res.status(400).json({ error: "El enlace ya fue usado o no es válido" });
    }

    const newHash = await bcrypt.hash(new_password, 12);
    const { error } = await supabase
      .from("cons_users")
      .update({ password_hash: newHash, reset_token: null, reset_token_expires: null })
      .eq("id", decoded.id);

    if (error) throw error;
    res.json({ message: "Contraseña restablecida correctamente" });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No autorizado" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { data: user } = await supabase
      .from("cons_users")
      .select("id, email, full_name, avatar_url, created_at")
      .eq("id", decoded.id)
      .single();

    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const isSuperAdmin = decoded.organization_id === process.env.MASTER_ORG_ID
    res.json({ user, organization_id: decoded.organization_id, is_super_admin: isSuperAdmin });
  } catch (err) {
    return res.status(401).json({ error: "Token inválido" });
  }
});

export default router;

import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { poolPromise } from "../db.js";
import { verifyAuth, verifyRole } from "../middleware/auth.js";
import {
  clearResetToken,
  createResetToken,
  verifyResetToken,
} from "../services/passwordResetStore.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// ---------- LOGIN ----------
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Username", username)
      .query("SELECT * FROM Users WHERE Username = @Username");

    if (result.recordset.length === 0)
      return res.status(400).json({ message: "User not found" });

    const user = result.recordset[0];
    const valid = await bcrypt.compare(password, user.PasswordHash);
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { username, role: user.Role },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, role: user.Role });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- REGISTER ----------
router.post("/register", async (req, res) => {
  const { username, password } = req.body;
  const role = "requester"; // ✅ force default role

  try {
    const hash = await bcrypt.hash(password, 10);
    const pool = await poolPromise;

    await pool
      .request()
      .input("Username", username)
      .input("PasswordHash", hash)
      .input("Role", role)
      .query(
        "INSERT INTO Users (Username, PasswordHash, Role) VALUES (@Username, @PasswordHash, @Role)"
      );

    res.json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- USER MANAGEMENT (Admin only) ----------
router.get("/users", verifyRole(["admin"]), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query("SELECT Username, Role FROM Users ORDER BY Username ASC");

    res.json(result.recordset);
  } catch (err) {
    console.error("List users error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:username", verifyRole(["admin"]), async (req, res) => {
  const { username } = req.params;
  const { role } = req.body;
  const allowedRoles = ["requester", "confirmer", "admin"];

  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Invalid role provided." });
  }

  try {
    const pool = await poolPromise;
    const updateResult = await pool
      .request()
      .input("Role", role)
      .input("Username", username)
      .query("UPDATE Users SET Role = @Role WHERE Username = @Username");

    if (updateResult.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const refreshed = await pool
      .request()
      .input("Username", username)
      .query("SELECT Username, Role FROM Users WHERE Username = @Username");

    res.json(refreshed.recordset[0]);
  } catch (err) {
    console.error("Update role error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- CHANGE PASSWORD (Authenticated users) ----------
router.post("/change-password", verifyAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Current and new passwords are required." });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ message: "New password must be at least 8 characters long." });
  }

  try {
    const pool = await poolPromise;
    const userResult = await pool
      .request()
      .input("Username", req.user.username)
      .query("SELECT PasswordHash FROM Users WHERE Username = @Username");

    if (userResult.recordset.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = userResult.recordset[0];
    const matches = await bcrypt.compare(currentPassword, user.PasswordHash);
    if (!matches) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    const samePassword = await bcrypt.compare(newPassword, user.PasswordHash);
    if (samePassword) {
      return res
        .status(400)
        .json({ message: "Please choose a password you haven't used." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool
      .request()
      .input("PasswordHash", hash)
      .input("Username", req.user.username)
      .query("UPDATE Users SET PasswordHash = @PasswordHash WHERE Username = @Username");

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Change password error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- FORGOT / RESET PASSWORD ----------
router.post("/forgot-password", async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ message: "Username is required." });
  }

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Username", username)
      .query("SELECT Username FROM Users WHERE Username = @Username");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "We couldn't find that user." });
    }

    const code = createResetToken(username);
    console.log(`Password reset code for ${username}: ${code}`);

    res.json({
      message:
        "We generated a reset code. Enter it with your new password to finish resetting.",
      resetCode: code, // surfaced for now because email delivery is not configured
      expiresInMinutes: 10,
    });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { username, code, newPassword } = req.body;
  if (!username || !code || !newPassword) {
    return res.status(400).json({
      message: "Username, reset code and new password are required.",
    });
  }

  if (newPassword.length < 8) {
    return res
      .status(400)
      .json({ message: "New password must be at least 8 characters long." });
  }

  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("Username", username)
      .query("SELECT PasswordHash FROM Users WHERE Username = @Username");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "We couldn't find that user." });
    }

    const isValid = verifyResetToken(username, code);
    if (!isValid) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset code." });
    }

    const existing = result.recordset[0];
    const samePassword = await bcrypt.compare(newPassword, existing.PasswordHash);
    if (samePassword) {
      return res
        .status(400)
        .json({ message: "Please choose a password you haven't used." });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool
      .request()
      .input("PasswordHash", hash)
      .input("Username", username)
      .query("UPDATE Users SET PasswordHash = @PasswordHash WHERE Username = @Username");

    clearResetToken(username);

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

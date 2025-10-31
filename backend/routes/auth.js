import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { poolPromise } from "../db.js";
import { verifyRole } from "../middleware/auth.js";
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

export default router;

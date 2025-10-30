import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

/**
 * Verify JWT and restrict route to specific roles.
 */
export function verifyRole(roles = []) {
  return (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Missing token" });

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (!roles.includes(user.role))
        return res.status(403).json({ message: "Forbidden" });

      req.user = user;
      next();
    } catch (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(401).json({ message: "Invalid token" });
    }
  };
}

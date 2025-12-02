import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const parseUserFromToken = (req) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return null;
  }
};

/**
 * Verify JWT and attach decoded user to the request.
 */
export function verifyAuth(req, res, next) {
  const user = parseUserFromToken(req);
  if (!user) return res.status(401).json({ message: "Invalid or missing token" });
  req.user = user;
  return next();
}

/**
 * Verify JWT and restrict route to specific roles.
 */
export function verifyRole(roles = []) {
  return (req, res, next) => {
    const user = parseUserFromToken(req);
    if (!user) return res.status(401).json({ message: "Invalid or missing token" });
    if (!roles.includes(user.role))
      return res.status(403).json({ message: "Forbidden" });

    req.user = user;
    next();
  };
}

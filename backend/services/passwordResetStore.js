import crypto from "crypto";

const resetTokens = new Map();

const normalize = (username) => (username || "").trim().toLowerCase();

export const createResetToken = (username, ttlMs = 10 * 60 * 1000) => {
  const key = normalize(username);
  if (!key) throw new Error("Username is required to create reset token");

  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = Date.now() + ttlMs;
  resetTokens.set(key, { code, expiresAt });
  return code;
};

export const verifyResetToken = (username, code) => {
  const key = normalize(username);
  const entry = resetTokens.get(key);
  if (!entry) return false;

  if (Date.now() > entry.expiresAt) {
    resetTokens.delete(key);
    return false;
  }

  return entry.code === String(code).trim();
};

export const clearResetToken = (username) => {
  const key = normalize(username);
  resetTokens.delete(key);
};

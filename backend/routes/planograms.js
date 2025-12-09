import fs from "fs";
import express from "express";
import sql from "mssql";
import multer from "multer";
import path from "path";
import { verifyRole } from "../middleware/auth.js";
import { planogramPoolPromise } from "../db_planogram.js";
import {
  ensurePlanogramPhotoDirSync,
  ensurePlanogramSchema,
  getPlanogramPhotoDir,
  mapPlanogramRecord,
} from "../services/planograms.js";

const router = express.Router();
const allowedRoles = ["admin", "planogram"];

const normalizeText = (value, maxLength = 20) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
};

const normalizeInternalId = (value) => {
  const normalized = normalizeText(value, 6);
  if (!normalized) return null;
  const digitsOnly = normalized.replace(/\D/g, "");
  if (!digitsOnly) return normalized;
  return digitsOnly.padStart(6, "0").slice(-6);
};

const toDecimal = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Number(numeric.toFixed(2));
};

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

ensurePlanogramPhotoDirSync();
const photoDir = getPlanogramPhotoDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photoDir),
  filename: (req, file, cb) => {
    const safeInternalId =
      normalizeText(
        req.params.internalId || req.body.internalId || "planogram"
      )?.replace(/[^a-zA-Z0-9_-]/g, "_") || "planogram";
    const safeSifra =
      normalizeText(
        req.params.sifraArt || req.body.sifraArt || "article"
      )?.replace(/[^a-zA-Z0-9_-]/g, "_") || "article";
    const extension = path.extname(file.originalname || "") || ".jpg";
    const baseName = path.basename(file.originalname || "", extension);
    const cleanBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_") || "photo";
    cb(null, `${safeInternalId}-${safeSifra}-${cleanBase}-${Date.now()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      return cb(null, true);
    }
    cb(new Error("Only image uploads are allowed."));
  },
});

router.get(
  "/by-internal/:internalId",
  verifyRole(allowedRoles),
  async (req, res) => {
    const internalId = normalizeText(req.params.internalId);
    const planogramId = normalizeText(req.query.planogramId);
    const moduleId = normalizeText(req.query.moduleId);
    const missingXyz = parseBoolean(req.query.missingXyz);
    const missingPhoto = parseBoolean(req.query.missingPhoto);

    const normalizedInternalId = normalizeInternalId(internalId);

    if (!normalizedInternalId) {
      return res
        .status(400)
        .json({ message: "Internal_ID is required to look up planograms." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await planogramPoolPromise;
      const request = pool
        .request()
        .input("Internal_ID", sql.VarChar(20), normalizedInternalId);

      let query = `SELECT p.*, k.ImeArt
                   FROM dbo.PlanogramLayout p
                   LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
                   WHERE p.Internal_ID = @Internal_ID`;

      if (planogramId) {
        request.input("Planogram_ID", sql.VarChar(20), planogramId);
        query += " AND p.Planogram_ID = @Planogram_ID";
      }
      if (moduleId) {
        request.input("Module_ID", sql.VarChar(20), moduleId);
        query += " AND p.Module_ID = @Module_ID";
      }
      if (missingXyz) {
        query += " AND (p.X IS NULL OR p.Y IS NULL OR p.Z IS NULL)";
      }
      if (missingPhoto) {
        query +=
          " AND (p.PhotoUrl IS NULL OR LTRIM(RTRIM(p.PhotoUrl)) = '' OR p.PhotoUrl = '')";
      }

      query += " ORDER BY p.Planogram_ID, p.Module_ID, p.Sifra_Art";

      const result = await request.query(query);
      res.json(result.recordset.map((record) => mapPlanogramRecord(record)));
    } catch (error) {
      console.error("Planogram lookup error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to load planogram layouts right now." });
    }
  }
);

router.get(
  "/:internalId/:sifraArt",
  verifyRole(allowedRoles),
  async (req, res) => {
    const internalId = normalizeInternalId(req.params.internalId);
    const sifraArt = normalizeText(req.params.sifraArt);

    if (!internalId || !sifraArt) {
      return res
        .status(400)
        .json({ message: "Both Internal_ID and Sifra_Art are required." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await planogramPoolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt).query(`
          SELECT p.*, k.ImeArt
          FROM dbo.PlanogramLayout p
          LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
          WHERE p.Internal_ID = @Internal_ID AND p.Sifra_Art = @Sifra_Art
        `);

      if (result.recordset.length === 0) {
        return res.status(404).json({ message: "Planogram layout not found." });
      }

      res.json(mapPlanogramRecord(result.recordset[0]));
    } catch (error) {
      console.error("Planogram fetch error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to load the requested planogram layout." });
    }
  }
);

router.get("/search", verifyRole(allowedRoles), async (req, res) => {
  const internalId = normalizeText(req.query.internalId);
  const planogramId = normalizeText(req.query.planogramId);
  const moduleId = normalizeText(req.query.moduleId);
  const missingXyz = parseBoolean(req.query.missingXyz);
  const missingPhoto = parseBoolean(req.query.missingPhoto);

  if (!internalId && !planogramId && !moduleId && !missingXyz && !missingPhoto) {
    return res.status(400).json({
      message:
        "Provide at least one filter: internalId, planogramId, moduleId, missingXyz or missingPhoto.",
    });
  }

  try {
    await ensurePlanogramSchema();
    const pool = await planogramPoolPromise;
    const request = pool.request();

    const conditions = [];
    const normalizedInternalId = normalizeInternalId(internalId);
    if (normalizedInternalId) {
      request.input("Internal_ID", sql.VarChar(20), normalizedInternalId);
      conditions.push("p.Internal_ID = @Internal_ID");
    }
    if (planogramId) {
      request.input("Planogram_ID", sql.VarChar(20), planogramId);
      conditions.push("p.Planogram_ID = @Planogram_ID");
    }
    if (moduleId) {
      request.input("Module_ID", sql.VarChar(20), moduleId);
      conditions.push("p.Module_ID = @Module_ID");
    }
    if (missingXyz) {
      conditions.push("(p.X IS NULL OR p.Y IS NULL OR p.Z IS NULL)");
    }
    if (missingPhoto) {
      conditions.push(
        "(p.PhotoUrl IS NULL OR LTRIM(RTRIM(p.PhotoUrl)) = '' OR p.PhotoUrl = '')"
      );
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT p.*, k.ImeArt
      FROM dbo.PlanogramLayout p
      LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
      ${whereClause}
      ORDER BY p.Planogram_ID, p.Module_ID, p.Internal_ID, p.Sifra_Art
    `;

    const result = await request.query(query);
    res.json(result.recordset.map((record) => mapPlanogramRecord(record)));
  } catch (error) {
    console.error("Planogram search error:", error.message);
    res
      .status(500)
      .json({ message: "Unable to search planogram layouts right now." });
  }
});

router.post("/", verifyRole(allowedRoles), async (req, res) => {
  const { internalId, sifraArt, moduleId, x, y, z, planogramId } = req.body;
  const normalizedInternalId = normalizeInternalId(internalId);
  const normalizedSifraArt = normalizeText(sifraArt);

  if (!normalizedInternalId || !normalizedSifraArt) {
    return res.status(400).json({
      message: "Both Internal_ID and Sifra_Art are required to save a layout.",
    });
  }

  try {
    await ensurePlanogramSchema();
    const pool = await planogramPoolPromise;
    const result = await pool
      .request()
      .input("Internal_ID", sql.VarChar(20), normalizedInternalId)
      .input("Sifra_Art", sql.VarChar(20), normalizedSifraArt)
      .input("Module_ID", sql.VarChar(20), normalizeText(moduleId))
      .input("X", sql.Decimal(18, 2), toDecimal(x))
      .input("Y", sql.Decimal(18, 2), toDecimal(y))
      .input("Z", sql.Decimal(18, 2), toDecimal(z))
      .input("Planogram_ID", sql.VarChar(20), normalizeText(planogramId))
      .query(`
        IF EXISTS (
          SELECT 1 FROM dbo.PlanogramLayout
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art
        )
        BEGIN
          UPDATE dbo.PlanogramLayout
          SET Module_ID = @Module_ID,
              X = @X,
              Y = @Y,
              Z = @Z,
              Planogram_ID = @Planogram_ID
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.PlanogramLayout (
            Internal_ID, Sifra_Art, Module_ID, X, Y, Z, Planogram_ID
          )
          VALUES (
            @Internal_ID, @Sifra_Art, @Module_ID, @X, @Y, @Z, @Planogram_ID
          );
        END;

        SELECT p.*, k.ImeArt
        FROM dbo.PlanogramLayout p
        LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
        WHERE p.Internal_ID = @Internal_ID AND p.Sifra_Art = @Sifra_Art;
      `);

    res.status(201).json({
      message: "Planogram layout saved.",
      planogram: mapPlanogramRecord(result.recordset[0]),
    });
  } catch (error) {
    console.error("Planogram save error:", error.message);
    res
      .status(500)
      .json({ message: "Unable to save the planogram layout right now." });
  }
});

router.delete(
  "/:internalId/:sifraArt",
  verifyRole(allowedRoles),
  async (req, res) => {
    const internalId = normalizeText(req.params.internalId);
    const sifraArt = normalizeText(req.params.sifraArt);

    if (!internalId || !sifraArt) {
      return res
        .status(400)
        .json({ message: "Both Internal_ID and Sifra_Art are required." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await planogramPoolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt).query(`
          DELETE FROM dbo.PlanogramLayout
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;

          SELECT @@ROWCOUNT AS DeletedCount;
        `);

      const deletedCount = result.recordset?.[0]?.DeletedCount ?? 0;
      if (deletedCount === 0) {
        return res.status(404).json({ message: "Planogram layout not found." });
      }

      res.json({ message: "Planogram layout removed." });
    } catch (error) {
      console.error("Planogram delete error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to remove the planogram layout." });
    }
  }
);

router.post(
  "/:internalId/:sifraArt/photo",
  verifyRole(allowedRoles),
  upload.single("photo"),
  async (req, res) => {
    const internalId = normalizeInternalId(req.params.internalId);
    const sifraArt = normalizeText(req.params.sifraArt);

    if (!internalId || !sifraArt) {
      return res
        .status(400)
        .json({ message: "Both Internal_ID and Sifra_Art are required." });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Please provide an image file." });
    }

    try {
      await ensurePlanogramSchema();
      const photoUrl = `/planogram-photos/${req.file.filename}`;
      const photoOriginalName = req.file.originalname || req.file.filename;
      const pool = await planogramPoolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt)
        .input("PhotoUrl", sql.NVarChar(500), photoUrl)
        .input("PhotoOriginalName", sql.NVarChar(255), photoOriginalName).query(`
          IF EXISTS (
            SELECT 1 FROM dbo.PlanogramLayout
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art
          )
          BEGIN
            UPDATE dbo.PlanogramLayout
            SET PhotoUrl = @PhotoUrl,
                PhotoOriginalName = @PhotoOriginalName
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.PlanogramLayout (Internal_ID, Sifra_Art, PhotoUrl, PhotoOriginalName)
            VALUES (@Internal_ID, @Sifra_Art, @PhotoUrl, @PhotoOriginalName);
          END;

          SELECT p.*, k.ImeArt
          FROM dbo.PlanogramLayout p
          LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
          WHERE p.Internal_ID = @Internal_ID AND p.Sifra_Art = @Sifra_Art;
        `);

      res.status(201).json({
        message: "Photo uploaded successfully.",
        planogram: mapPlanogramRecord(result.recordset[0]),
      });
    } catch (error) {
      console.error("Planogram photo error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to upload the photo at the moment." });
    }
  }
);

router.get("/photos", verifyRole(allowedRoles), async (_req, res) => {
  try {
    const files = await fs.promises.readdir(photoDir);
    const images = files.filter((file) =>
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file)
    );
    res.json({ files: images });
  } catch (error) {
    console.error("Planogram photo list error:", error.message);
    res.status(500).json({ message: "Unable to list planogram photos." });
  }
});

router.post(
  "/:internalId/:sifraArt/photo/link",
  verifyRole(allowedRoles),
  async (req, res) => {
    const internalId = normalizeInternalId(req.params.internalId);
    const sifraArt = normalizeText(req.params.sifraArt);
    const { filename } = req.body || {};

    if (!internalId || !sifraArt) {
      return res
        .status(400)
        .json({ message: "Both Internal_ID and Sifra_Art are required." });
    }

    if (!filename || typeof filename !== "string") {
      return res.status(400).json({ message: "Filename is required." });
    }

    const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "");
    const targetPath = path.join(photoDir, sanitized);

    try {
      const stat = await fs.promises.stat(targetPath);
      if (!stat.isFile()) {
        return res.status(400).json({ message: "File is not a valid image." });
      }
    } catch (error) {
      return res
        .status(404)
        .json({ message: "File not found in planogram photos directory." });
    }

    try {
      await ensurePlanogramSchema();
      const photoUrl = `/planogram-photos/${sanitized}`;
      const pool = await planogramPoolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt)
        .input("PhotoUrl", sql.NVarChar(500), photoUrl)
        .input("PhotoOriginalName", sql.NVarChar(255), sanitized).query(`
          IF EXISTS (
            SELECT 1 FROM dbo.PlanogramLayout
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art
          )
          BEGIN
            UPDATE dbo.PlanogramLayout
            SET PhotoUrl = @PhotoUrl,
                PhotoOriginalName = @PhotoOriginalName
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.PlanogramLayout (Internal_ID, Sifra_Art, PhotoUrl, PhotoOriginalName)
            VALUES (@Internal_ID, @Sifra_Art, @PhotoUrl, @PhotoOriginalName);
          END;

          SELECT p.*, k.ImeArt
          FROM dbo.PlanogramLayout p
          LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
          WHERE p.Internal_ID = @Internal_ID AND p.Sifra_Art = @Sifra_Art;
        `);

      res.json({
        message: "Photo linked successfully.",
        planogram: mapPlanogramRecord(result.recordset[0]),
      });
    } catch (error) {
      console.error("Planogram link photo error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to link the existing photo right now." });
    }
  }
);

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }

  if (err?.message === "Only image uploads are allowed.") {
    return res.status(400).json({ message: err.message });
  }

  console.error("Unexpected planogram route error:", err);
  return res.status(500).json({ message: "Unexpected planogram error." });
});

export default router;

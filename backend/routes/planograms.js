import express from "express";
import sql from "mssql";
import multer from "multer";
import path from "path";
import { verifyRole } from "../middleware/auth.js";
import { poolPromise } from "../db.js";
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
    cb(null, `${safeInternalId}-${safeSifra}-${Date.now()}${extension}`);
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

    if (!internalId) {
      return res
        .status(400)
        .json({ message: "Internal_ID is required to look up planograms." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await poolPromise;
      const request = pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId);

      let query = `SELECT *
                   FROM dbo.PlanogramLayout
                   WHERE Internal_ID = @Internal_ID`;

      if (planogramId) {
        request.input("Planogram_ID", sql.VarChar(20), planogramId);
        query += " AND Planogram_ID = @Planogram_ID";
      }

      query += " ORDER BY Planogram_ID, Module_ID, Sifra_Art";

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
    const internalId = normalizeText(req.params.internalId);
    const sifraArt = normalizeText(req.params.sifraArt);

    if (!internalId || !sifraArt) {
      return res
        .status(400)
        .json({ message: "Both Internal_ID and Sifra_Art are required." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt).query(`
          SELECT *
          FROM dbo.PlanogramLayout
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art
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

router.post("/", verifyRole(allowedRoles), async (req, res) => {
  const { internalId, sifraArt, moduleId, x, y, z, planogramId } = req.body;
  const normalizedInternalId = normalizeText(internalId);
  const normalizedSifraArt = normalizeText(sifraArt);

  if (!normalizedInternalId || !normalizedSifraArt) {
    return res.status(400).json({
      message: "Both Internal_ID and Sifra_Art are required to save a layout.",
    });
  }

  try {
    await ensurePlanogramSchema();
    const pool = await poolPromise;
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

        SELECT *
        FROM dbo.PlanogramLayout
        WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
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
      const pool = await poolPromise;
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
    const internalId = normalizeText(req.params.internalId);
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
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("Sifra_Art", sql.VarChar(20), sifraArt)
        .input("PhotoUrl", sql.NVarChar(500), photoUrl).query(`
          IF EXISTS (
            SELECT 1 FROM dbo.PlanogramLayout
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art
          )
          BEGIN
            UPDATE dbo.PlanogramLayout
            SET PhotoUrl = @PhotoUrl
            WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.PlanogramLayout (Internal_ID, Sifra_Art, PhotoUrl)
            VALUES (@Internal_ID, @Sifra_Art, @PhotoUrl);
          END;

          SELECT *
          FROM dbo.PlanogramLayout
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
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

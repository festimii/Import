import fs from "fs";
import path from "path";
import express from "express";
import sql from "mssql";
import multer from "multer";
import { verifyRole } from "../middleware/auth.js";
import { planogramPoolPromise } from "../db_planogram.js";
import {
  ensurePlanogramPhotoDirSync,
  ensurePlanogramSchema,
  ensureShelfLayoutSchema,
  getPlanogramPhotoDir,
  mapPlanogramRecord,
} from "../services/planograms.js";

const router = express.Router();
const allowedRoles = ["admin", "planogram"];

const normalizeText = (value, maxLength = 20) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
};

const normalizeInternalId = (value) => {
  const normalized = normalizeText(value, 6);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  if (!digits) return normalized;
  return digits.padStart(6, "0").slice(-6);
};

const toDecimal = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : null;
};

const parseBoolean = (value) => {
  if (value === true || value === false) return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
};

const getPhotoFilenameMap = async () => {
  const files = await fs.promises.readdir(photoDir);
  const map = new Map();
  files.forEach((file) => {
    const base = path.parse(file).name;
    if (!map.has(base)) {
      map.set(base, file);
    }
  });
  return map;
};

const attachDerivedPhotos = async (records) => {
  if (!Array.isArray(records) || records.length === 0) return records;
  let map = null;
  try {
    map = await getPhotoFilenameMap();
  } catch (error) {
    console.error("Planogram photo map error:", error.message);
    return records;
  }

  return records.map((record) => {
    if (record?.PhotoUrl || !record?.Internal_ID) {
      return record;
    }
    const match = map.get(record.Internal_ID);
    if (!match) return record;

    return {
      ...record,
      PhotoUrl: `/planogram-photos/${match}`,
      PhotoOriginalName: match,
    };
  });
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
    const internalIdRaw = req.params.internalId;
    const internalId = normalizeInternalId(internalIdRaw);
    const planogramId = normalizeText(req.query.planogramId);
    const shelfId = normalizeText(req.query.shelfId, 100);
    const moduleId = normalizeText(req.query.moduleId);
    const missingXyz = parseBoolean(req.query.missingXyz);
    const missingPhoto = parseBoolean(req.query.missingPhoto);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize, 10) || 50));

    if (!internalId) {
      return res
        .status(400)
        .json({ message: "Internal_ID is required to look up planograms." });
    }

    try {
      await ensurePlanogramSchema();
      const pool = await planogramPoolPromise;
      const whereParts = ["p.Internal_ID = @Internal_ID"];

      const applyFilters = (req) => {
        req.input("Internal_ID", sql.VarChar(20), internalId);
        if (planogramId) req.input("Planogram_ID", sql.VarChar(20), planogramId);
        if (shelfId) req.input("Shelf_ID", sql.NVarChar(100), shelfId);
        if (moduleId) req.input("Module_ID", sql.VarChar(20), moduleId);
        return req;
      };

      if (planogramId) whereParts.push("p.Planogram_ID = @Planogram_ID");
      if (shelfId) whereParts.push("p.Shelf_ID = @Shelf_ID");
      if (moduleId) whereParts.push("p.Module_ID = @Module_ID");
      if (missingXyz) whereParts.push("(p.X IS NULL OR p.Y IS NULL OR p.Z IS NULL)");
      if (missingPhoto)
        whereParts.push(
          "(p.PhotoUrl IS NULL OR LTRIM(RTRIM(p.PhotoUrl)) = '' OR p.PhotoUrl = '')"
        );

      const whereClause = `WHERE ${whereParts.join(" AND ")}`;

      const dataQuery = `
        SELECT p.*, k.ImeArt
        FROM dbo.PlanogramLayout p
        LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
        ${whereClause}
        ORDER BY p.Planogram_ID, p.Module_ID, p.Sifra_Art
        OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
      `;

      const countQuery = `
        SELECT COUNT(*) AS Total
        FROM dbo.PlanogramLayout p
        ${whereClause}
      `;

      const dataRequest = applyFilters(pool.request())
        .input("Offset", sql.Int, (page - 1) * pageSize)
        .input("PageSize", sql.Int, pageSize);
      const countRequest = applyFilters(pool.request());

      const [result, countResult] = await Promise.all([
        dataRequest.query(dataQuery),
        countRequest.query(countQuery),
      ]);

      const total = countResult.recordset?.[0]?.Total ?? result.recordset.length;
      const enriched = await attachDerivedPhotos(result.recordset);
      res.json({
        items: enriched.map((record) => mapPlanogramRecord(record)),
        total,
        page,
        pageSize,
      });
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

      const enriched = await attachDerivedPhotos(result.recordset);
      res.json(mapPlanogramRecord(enriched[0]));
    } catch (error) {
      console.error("Planogram fetch error:", error.message);
      res
        .status(500)
        .json({ message: "Unable to load the requested planogram layout." });
    }
  }
);

router.get("/search", verifyRole(allowedRoles), async (req, res) => {
  const internalIdRaw = req.query.internalId;
  const internalId = normalizeInternalId(internalIdRaw);
  const planogramId = normalizeText(req.query.planogramId);
  const shelfId = normalizeText(req.query.shelfId, 100);
  const moduleId = normalizeText(req.query.moduleId);
  const missingXyz = parseBoolean(req.query.missingXyz);
  const missingPhoto = parseBoolean(req.query.missingPhoto);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(req.query.pageSize, 10) || 50));

  if (!internalId && !planogramId && !shelfId && !moduleId && !missingXyz && !missingPhoto) {
    return res.status(400).json({
      message:
        "Provide at least one filter: internalId, planogramId, shelfId, moduleId, missingXyz or missingPhoto.",
    });
  }

  try {
    await ensurePlanogramSchema();
    const pool = await planogramPoolPromise;

    const conditions = [];
    if (internalId) {
      conditions.push("p.Internal_ID = @Internal_ID");
    }
    if (planogramId) {
      conditions.push("p.Planogram_ID = @Planogram_ID");
    }
    if (shelfId) {
      conditions.push("p.Shelf_ID = @Shelf_ID");
    }
    if (moduleId) {
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

    const queryBase = `
      SELECT p.*, k.ImeArt
      FROM dbo.PlanogramLayout p
      LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
      ${whereClause}
    `;

    const pagedQuery = `
      ${queryBase}
      ORDER BY p.Planogram_ID, p.Module_ID, p.Internal_ID, p.Sifra_Art
      OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY
    `;

    const countQuery = `
      SELECT COUNT(*) AS Total
      FROM dbo.PlanogramLayout p
      ${whereClause}
    `;

    const dataRequest = pool.request();
    const countRequest = pool.request();

    if (internalId) {
      dataRequest.input("Internal_ID", sql.VarChar(20), internalId);
      countRequest.input("Internal_ID", sql.VarChar(20), internalId);
    }
    if (planogramId) {
      dataRequest.input("Planogram_ID", sql.VarChar(20), planogramId);
      countRequest.input("Planogram_ID", sql.VarChar(20), planogramId);
    }
    if (shelfId) {
      dataRequest.input("Shelf_ID", sql.NVarChar(100), shelfId);
      countRequest.input("Shelf_ID", sql.NVarChar(100), shelfId);
    }
    if (moduleId) {
      dataRequest.input("Module_ID", sql.VarChar(20), moduleId);
      countRequest.input("Module_ID", sql.VarChar(20), moduleId);
    }

    if (missingXyz || missingPhoto) {
      // no params needed for the null checks
    }

    const result = await dataRequest
      .input("Offset", sql.Int, (page - 1) * pageSize)
      .input("PageSize", sql.Int, pageSize)
      .query(pagedQuery);

    const countResult = await countRequest.query(countQuery);
    const total = countResult.recordset?.[0]?.Total ?? result.recordset.length;

    const enriched = await attachDerivedPhotos(result.recordset);
    res.json({
      items: enriched.map((record) => mapPlanogramRecord(record)),
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("Planogram search error:", error.message);
    res
      .status(500)
      .json({ message: "Unable to search planogram layouts right now." });
  }
});

router.post("/", verifyRole(allowedRoles), async (req, res) => {
  const { internalId, sifraArt, moduleId, x, y, z, planogramId, shelfId } = req.body;
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
      .input("Shelf_ID", sql.NVarChar(100), normalizeText(shelfId, 100))
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
              Planogram_ID = @Planogram_ID,
              Shelf_ID = @Shelf_ID
          WHERE Internal_ID = @Internal_ID AND Sifra_Art = @Sifra_Art;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.PlanogramLayout (
            Internal_ID, Sifra_Art, Module_ID, X, Y, Z, Planogram_ID, Shelf_ID
          )
          VALUES (
            @Internal_ID, @Sifra_Art, @Module_ID, @X, @Y, @Z, @Planogram_ID, @Shelf_ID
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

// Shelf layout endpoints
router.get("/shelf-layout", verifyRole(allowedRoles), async (req, res) => {
  const shelfId = normalizeText(req.query.shelfId, 100);
  if (!shelfId) {
    return res.status(400).json({ message: "shelfId is required." });
  }

  try {
    await ensureShelfLayoutSchema();
    await ensurePlanogramSchema();
    const pool = await planogramPoolPromise;
    const result = await pool
      .request()
      .input("Shelf_ID", sql.NVarChar(100), shelfId).query(`
        SELECT l.Shelf_ID, l.Internal_ID, l.Sifra_Art, l.PosXmm, l.PosZmm,
               p.Planogram_ID, p.Module_ID, p.X, p.Y, p.Z, p.PhotoUrl, p.PhotoOriginalName,
               k.ImeArt
        FROM dbo.PlanogramShelfLayout l
        LEFT JOIN dbo.PlanogramLayout p
          ON l.Shelf_ID = p.Shelf_ID AND l.Internal_ID = p.Internal_ID AND l.Sifra_Art = p.Sifra_Art
        LEFT JOIN dbo.KatArt k ON p.Sifra_Art = k.Sifra_Art
        WHERE l.Shelf_ID = @Shelf_ID
        ORDER BY l.PosZmm, l.PosXmm, l.Sifra_Art;
      `);

    const items = result.recordset.map((record) => ({
      ...mapPlanogramRecord(record),
      shelfId: record?.Shelf_ID ?? shelfId,
      posXmm: toDecimal(record?.PosXmm),
      posZmm: toDecimal(record?.PosZmm),
    }));

    res.json({ shelfId, items });
  } catch (error) {
    console.error("Shelf layout fetch error:", error.message);
    res.status(500).json({ message: "Unable to load shelf layout." });
  }
});

router.post("/shelf-layout", verifyRole(allowedRoles), async (req, res) => {
  const shelfId = normalizeText(req.body?.shelfId, 100);
  const positions = Array.isArray(req.body?.positions) ? req.body.positions : [];

  if (!shelfId) {
    return res.status(400).json({ message: "shelfId is required." });
  }
  if (positions.length === 0) {
    return res.status(400).json({ message: "positions array is required." });
  }

  const validRows = positions
    .map((pos) => ({
      internalId: normalizeInternalId(pos.internalId),
      sifraArt: normalizeText(pos.sifraArt),
      posXmm: toDecimal(pos.posXmm),
      posZmm: toDecimal(pos.posZmm),
    }))
    .filter(
      (pos) => pos.internalId && pos.sifraArt && pos.posXmm !== null && pos.posZmm !== null
    );

  if (validRows.length === 0) {
    return res.status(400).json({ message: "No valid positions to save." });
  }

  try {
    await ensureShelfLayoutSchema();
    const pool = await planogramPoolPromise;
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction)
      .input("Shelf_ID", sql.NVarChar(100), shelfId)
      .query(`DELETE FROM dbo.PlanogramShelfLayout WHERE Shelf_ID = @Shelf_ID;`);

    for (const row of validRows) {
      await new sql.Request(transaction)
        .input("Shelf_ID", sql.NVarChar(100), shelfId)
        .input("Internal_ID", sql.VarChar(20), row.internalId)
        .input("Sifra_Art", sql.VarChar(20), row.sifraArt)
        .input("PosXmm", sql.Decimal(18, 2), row.posXmm)
        .input("PosZmm", sql.Decimal(18, 2), row.posZmm).query(`
          INSERT INTO dbo.PlanogramShelfLayout (Shelf_ID, Internal_ID, Sifra_Art, PosXmm, PosZmm)
          VALUES (@Shelf_ID, @Internal_ID, @Sifra_Art, @PosXmm, @PosZmm);
        `);
    }

    await transaction.commit();
    res.status(201).json({ message: "Shelf layout saved.", positions: validRows.length });
  } catch (error) {
    console.error("Shelf layout save error:", error.message);
    res.status(500).json({ message: "Unable to save shelf layout." });
  }
});

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

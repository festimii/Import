import fs from "fs/promises";
import path from "path";
import sql from "mssql";
import {
  ensurePlanogramPhotoDirSync,
  ensurePlanogramSchema,
  getPlanogramPhotoDir,
} from "./planograms.js";
import { planogramPoolPromise } from "../db_planogram.js";

const DEFAULT_INTERVAL = 30 * 60 * 1000; // 30 minutes
let syncTimer = null;
let syncing = false;

const deriveInternalIdFromFilename = (filename) => {
  const base = path.parse(filename).name;
  if (!base) return null;
  const digitsOnly = base.replace(/\D/g, "");
  if (digitsOnly) {
    return digitsOnly.padStart(6, "0").slice(-6);
  }
  return base.slice(0, 6) || null;
};

export const syncPlanogramPhotos = async () => {
  if (syncing) return { status: "skipped_busy" };
  syncing = true;
  try {
    ensurePlanogramPhotoDirSync();
    await ensurePlanogramSchema();
    const dir = getPlanogramPhotoDir();
    const files = await fs.readdir(dir);
    const images = files.filter((file) =>
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file)
    );

    if (images.length === 0) {
      return { status: "ok", updated: 0 };
    }

    const pool = await planogramPoolPromise;
    let updated = 0;

    for (const file of images) {
      const internalId = deriveInternalIdFromFilename(file);
      if (!internalId) continue;

      const photoUrl = `/planogram-photos/${file}`;
      const result = await pool
        .request()
        .input("Internal_ID", sql.VarChar(20), internalId)
        .input("PhotoUrl", sql.NVarChar(500), photoUrl)
        .input("PhotoOriginalName", sql.NVarChar(255), file).query(`
          UPDATE dbo.PlanogramLayout
          SET PhotoUrl = @PhotoUrl,
              PhotoOriginalName = @PhotoOriginalName
          WHERE Internal_ID = @Internal_ID;

          SELECT @@ROWCOUNT AS UpdatedCount;
        `);

      const count = result.recordset?.[0]?.UpdatedCount ?? 0;
      updated += Number(count) || 0;
    }

    return { status: "ok", updated };
  } catch (error) {
    console.error("Planogram photo sync error:", error.message);
    return { status: "error", error: error.message };
  } finally {
    syncing = false;
  }
};

export const startPlanogramPhotoSync = () => {
  const intervalMs = Number(
    process.env.PLANOGRAM_PHOTO_SYNC_MS ?? DEFAULT_INTERVAL
  );

  if (syncTimer) {
    clearInterval(syncTimer);
  }

  // Kick off an immediate sync, then interval.
  syncPlanogramPhotos();
  syncTimer = setInterval(syncPlanogramPhotos, intervalMs);
  return intervalMs;
};

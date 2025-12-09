import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import sql from "mssql";
import { planogramPoolPromise } from "../db_planogram.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const planogramPhotoDir = path.join(
  __dirname,
  "..",
  "data",
  "planogram-photos"
);

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const ensurePlanogramPhotoDir = async () => {
  await fsPromises.mkdir(planogramPhotoDir, { recursive: true });
};

export const ensurePlanogramPhotoDirSync = () => {
  try {
    fs.mkdirSync(planogramPhotoDir, { recursive: true });
  } catch (error) {
    console.error("Failed to ensure planogram photo directory:", error.message);
  }
};

export const getPlanogramPhotoDir = () => planogramPhotoDir;

export const ensurePlanogramSchema = async () => {
  const pool = await planogramPoolPromise;
  await pool.request().batch(`
    IF OBJECT_ID('dbo.PlanogramLayout', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.PlanogramLayout (
        Sifra_Art VARCHAR(20) NOT NULL,
        Internal_ID VARCHAR(20) NOT NULL,
        Module_ID VARCHAR(20) NULL,
        X DECIMAL(18, 2) NULL,
        Y DECIMAL(18, 2) NULL,
        Z DECIMAL(18, 2) NULL,
        Planogram_ID VARCHAR(20) NULL,
        PhotoUrl NVARCHAR(500) NULL,
        CONSTRAINT PK_PlanogramLayout PRIMARY KEY (Internal_ID, Sifra_Art)
      );
    END;

    IF COL_LENGTH('dbo.PlanogramLayout', 'Module_ID') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD Module_ID VARCHAR(20) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'X') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD X DECIMAL(18, 2) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'Y') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD Y DECIMAL(18, 2) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'Z') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD Z DECIMAL(18, 2) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'Planogram_ID') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD Planogram_ID VARCHAR(20) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'PhotoUrl') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD PhotoUrl NVARCHAR(500) NULL;
    IF COL_LENGTH('dbo.PlanogramLayout', 'PhotoOriginalName') IS NULL
      ALTER TABLE dbo.PlanogramLayout ADD PhotoOriginalName NVARCHAR(255) NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'IX_PlanogramLayout_Internal'
        AND object_id = OBJECT_ID('dbo.PlanogramLayout')
    )
      CREATE INDEX IX_PlanogramLayout_Internal
        ON dbo.PlanogramLayout (Internal_ID);
  `);

  await ensurePlanogramPhotoDir();
};

export const mapPlanogramRecord = (record) => ({
  sifraArt: record?.Sifra_Art ?? null,
  internalId: record?.Internal_ID ?? null,
  moduleId: record?.Module_ID ?? null,
  x: toNumber(record?.X),
  y: toNumber(record?.Y),
  z: toNumber(record?.Z),
  planogramId: record?.Planogram_ID ?? null,
  photoUrl: record?.PhotoUrl ?? null,
  photoOriginalName: record?.PhotoOriginalName ?? null,
  articleName: record?.ImeArt ?? null,
});

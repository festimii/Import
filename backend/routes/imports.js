import express from "express";
import sql from "mssql";
import { randomUUID } from "crypto";
import multer from "multer";
import * as XLSX from "xlsx";
import { poolPromise } from "../db.js";
import { secondaryPoolPromise } from "../db_WMS.js"; // secondary DB (pallet calculations)
import { verifyRole } from "../middleware/auth.js";
import { dispatchNotificationEvent } from "../services/notifications.js";
import { ensureWmsOrdersSchema } from "../services/wmsOrdersSync.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 12,
  },
});

// ---------- CREATE REQUEST (Requester) ----------
const trimString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeArticleCode = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  const stringValue = String(value).trim();
  if (/^\d{1,6}$/.test(stringValue)) {
    return stringValue.padStart(6, "0");
  }

  return stringValue;
};

const numberOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  return null;
};

const sanitizeComment = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  if (stringValue.length === 0) {
    return null;
  }

  return stringValue.slice(0, 1000);
};

const formatNotificationDate = (value) => {
  if (!value) {
    return "TBD";
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "TBD";
};

const normalizePalletCalculation = (row = {}) => {
  const fullPalletsRaw = numberOrNull(row.Full_Pallets) ?? 0;
  const boxesPerPallet = numberOrNull(row.Boxes_per_Pallet);
  const remainingBoxes = numberOrNull(row.Remaining_Boxes) ?? 0;
  const baseFullPallets = Number.isFinite(fullPalletsRaw)
    ? Math.max(0, Math.floor(fullPalletsRaw))
    : 0;
  const partialPallets = (() => {
    if (!Number.isFinite(remainingBoxes) || remainingBoxes <= 0) {
      return 0;
    }
    if (Number.isFinite(boxesPerPallet) && boxesPerPallet > 0) {
      return Math.ceil(remainingBoxes / boxesPerPallet);
    }
    return 1;
  })();
  const totalPalletPositions = baseFullPallets + partialPallets;

  return {
    boxesPerPallet,
    boxesPerLayer: numberOrNull(row.Boxes_per_Layer),
    layersPerPallet: numberOrNull(row.Layers_per_Pallet),
    fullPallets: fullPalletsRaw,
    remainingBoxes,
    palletWeightKg: numberOrNull(row.Pallet_Weight_kg),
    palletVolumeM3: numberOrNull(row.Pallet_Volume_m3),
    boxWeightKg: numberOrNull(row.Box_Weight_kg),
    boxVolumeM3: numberOrNull(row.Box_Volume_m3),
    palletVolumeUtilization: numberOrNull(row.Pallet_Volume_Utilization),
    weightFullPalletsKg: numberOrNull(row.Weight_Full_Pallets_kg),
    volumeFullPalletsM3: numberOrNull(row.Volume_Full_Pallets_m3),
    weightRemainingKg: numberOrNull(row.Weight_Remaining_kg),
    volumeRemainingM3: numberOrNull(row.Volume_Remaining_m3),
    totalShipmentWeightKg: numberOrNull(row.Total_Shipment_Weight_kg),
    totalShipmentVolumeM3: numberOrNull(row.Total_Shipment_Volume_m3),
    totalPalletPositions,
  };
};

const calculatePalletization = async (pool, { article, boxCount }) => {
  const result = await pool
    .request()
    .input("Sifra_Art", article)
    .input("OrderBoxes", boxCount)
    .execute("sp_CalcPalletKPIs_ForOrder");

  const calculationRow = result.recordset?.[0];
  if (!calculationRow) {
    throw new Error("Pallet calculation unavailable.");
  }

  return normalizePalletCalculation(calculationRow);
};

const KAT_ART_TABLE = "KatArt";
const KAT_ART_DEFAULT_SCHEMA = "dbo";
const KAT_ART_CODE_PREFERENCES = [
  "sifra_art",
  "sifraart",
  "artikal",
  "article",
  "artikulli",
  "sifra",
];
const KAT_ART_NAME_PREFERENCES = [
  "imeart",
  "articlename",
  "artikullpershkrimi",
  "description",
  "opis",
  "naziv",
];

let katArtColumnCache = null;

const quoteIdentifier = (value, fallback) => {
  const identifier = String(value ?? fallback ?? "").trim();
  if (!identifier) {
    return "";
  }
  return `[${identifier.replace(/]/g, "]]")}]`;
};

const resolveKatArtColumns = async (pool) => {
  if (katArtColumnCache) {
    return katArtColumnCache;
  }

  try {
    const result = await pool
      .request()
      .input("TableName", sql.NVarChar(128), KAT_ART_TABLE)
      .query(`SELECT TABLE_SCHEMA, COLUMN_NAME
              FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_NAME = @TableName`);

    if (!Array.isArray(result.recordset) || result.recordset.length === 0) {
      katArtColumnCache = {
        schemaName: KAT_ART_DEFAULT_SCHEMA,
        codeColumn: "Sifra_Art",
        nameColumn: "ImeArt",
      };
      return katArtColumnCache;
    }

    const columnLookup = new Map();
    let schemaName = KAT_ART_DEFAULT_SCHEMA;

    for (const row of result.recordset) {
      if (row.TABLE_SCHEMA) {
        schemaName = row.TABLE_SCHEMA;
      }
      const actualName = String(row.COLUMN_NAME);
      columnLookup.set(actualName.toLowerCase(), actualName);
    }

    const resolveColumn = (preferences, fallback) => {
      for (const candidate of preferences) {
        const resolved = columnLookup.get(candidate);
        if (resolved) {
          return resolved;
        }
      }
      return fallback;
    };

    katArtColumnCache = {
      schemaName,
      codeColumn: resolveColumn(KAT_ART_CODE_PREFERENCES, "Sifra_Art"),
      nameColumn: resolveColumn(KAT_ART_NAME_PREFERENCES, "ImeArt"),
    };

    return katArtColumnCache;
  } catch (error) {
    katArtColumnCache = {
      schemaName: KAT_ART_DEFAULT_SCHEMA,
      codeColumn: "Sifra_Art",
      nameColumn: "ImeArt",
    };
    return katArtColumnCache;
  }
};

const fetchArticleNames = async (pool, articles = []) => {
  if (!pool || !Array.isArray(articles) || articles.length === 0) {
    return new Map();
  }

  const normalizedArticles = [
    ...new Set(
      articles
        .map((article) => normalizeArticleCode(article))
        .filter((value) => Boolean(value))
    ),
  ];

  if (normalizedArticles.length === 0) {
    return new Map();
  }

  try {
    const { schemaName, codeColumn, nameColumn } = await resolveKatArtColumns(
      pool
    );
    const quotedTable = `${quoteIdentifier(
      schemaName,
      KAT_ART_DEFAULT_SCHEMA
    )}.${quoteIdentifier(KAT_ART_TABLE, KAT_ART_TABLE)}`;
    const quotedCodeColumn = quoteIdentifier(codeColumn, "Sifra_Art");
    const quotedNameColumn = quoteIdentifier(nameColumn, "ImeArt");

    const request = pool.request();
    const parameterPlaceholders = normalizedArticles.map((code, index) => {
      const parameter = `Article${index}`;
      request.input(parameter, sql.NVarChar(50), code);
      return `@${parameter}`;
    });

    const result = await request.query(`SELECT
            ${quotedCodeColumn} AS ArticleCode,
            ${quotedNameColumn} AS ArticleName
          FROM ${quotedTable}
          WHERE ${quotedCodeColumn} IN (${parameterPlaceholders.join(", ")})`);

    const lookup = new Map();
    for (const row of result.recordset ?? []) {
      const code = normalizeArticleCode(row.ArticleCode);
      if (!code) {
        continue;
      }
      const name = trimString(row.ArticleName);
      lookup.set(code, name || null);
    }

    return lookup;
  } catch (error) {
    console.error("Article name lookup error:", error.message);
    return new Map();
  }
};

const NUMERIC_FIELDS = [
  "BoxCount",
  "PalletCount",
  "BoxesPerPallet",
  "BoxesPerLayer",
  "LayersPerPallet",
  "FullPallets",
  "RemainingBoxes",
  "PalletWeightKg",
  "PalletVolumeM3",
  "BoxWeightKg",
  "BoxVolumeM3",
  "PalletVolumeUtilization",
  "WeightFullPalletsKg",
  "VolumeFullPalletsM3",
  "WeightRemainingKg",
  "VolumeRemainingM3",
  "TotalShipmentWeightKg",
  "TotalShipmentVolumeM3",
];

const mapArticles = (records) =>
  records.map((record) => {
    const mapped = {
      ...record,
      Article: normalizeArticleCode(record.Article),
      ArticleName: trimString(record.ArticleName),
    };

    for (const field of NUMERIC_FIELDS) {
      if (mapped[field] !== null && mapped[field] !== undefined) {
        const numericValue = Number(mapped[field]);
        if (Number.isFinite(numericValue)) {
          mapped[field] = numericValue;
        }
      }
    }

    return mapped;
  });

const mapWmsOrders = (records) =>
  records.map((record) => {
    const mapped = {
      ...record,
      NarID:
        record.NarID !== null && record.NarID !== undefined
          ? String(record.NarID)
          : null,
      OrderNumber:
        record.OrderNumber !== null && record.OrderNumber !== undefined
          ? String(record.OrderNumber)
          : null,
      Importer: (() => {
        if (record.Importer !== null && record.Importer !== undefined) {
          return String(record.Importer);
        }
        if (record.CustomerName !== null && record.CustomerName !== undefined) {
          return String(record.CustomerName);
        }
        return null;
      })(),
      Article: normalizeArticleCode(record.Article),
      ArticleDescription:
        record.ArticleDescription !== null &&
        record.ArticleDescription !== undefined
          ? String(record.ArticleDescription)
          : null,
      Comment:
        record.Comment !== null && record.Comment !== undefined
          ? String(record.Comment)
          : null,
    };

    if (mapped.NarID === null) {
      mapped.NarID = null;
    }

    mapped.BoxCount = numberOrNull(record.BoxCount);
    mapped.PalletCount = numberOrNull(record.PalletCount);

    return mapped;
  });

let importRequestFeatureState = {
  checked: false,
  hasBatchId: false,
  hasExcelDetails: false,
};

function markImportRequestFeatureStateDirty() {
  importRequestFeatureState.checked = false;
}

const qualifyTableName = (tableName) =>
  tableName && tableName.includes(".") ? tableName : `dbo.${tableName}`;

const parseQualifiedTable = (tableName) => {
  const qualified = qualifyTableName(tableName);
  const [schema, name] = qualified.split(".");
  return { schema, name, qualified };
};

const tableExists = async (pool, tableName) => {
  const { schema, name } = parseQualifiedTable(tableName);
  const result = await pool
    .request()
    .input("TableSchema", sql.NVarChar, schema)
    .input("TableName", sql.NVarChar, name).query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = @TableSchema
          AND TABLE_NAME = @TableName
      ) THEN 1 ELSE 0 END AS Result;
    `);
  return result.recordset?.[0]?.Result === 1;
};

const columnExists = async (pool, tableName, columnName) => {
  const { schema, name } = parseQualifiedTable(tableName);
  const result = await pool
    .request()
    .input("TableSchema", sql.NVarChar, schema)
    .input("TableName", sql.NVarChar, name)
    .input("ColumnName", sql.NVarChar, columnName).query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @TableSchema
          AND TABLE_NAME = @TableName
          AND COLUMN_NAME = @ColumnName
      ) THEN 1 ELSE 0 END AS Result;
    `);
  return result.recordset?.[0]?.Result === 1;
};

const defaultConstraintExists = async (pool, constraintName) => {
  const result = await pool
    .request()
    .input("ConstraintName", sql.NVarChar, constraintName).query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM sys.default_constraints
        WHERE Name = @ConstraintName
      ) THEN 1 ELSE 0 END AS Result;
    `);
  return result.recordset?.[0]?.Result === 1;
};

const indexExists = async (pool, tableName, indexName) => {
  const { qualified } = parseQualifiedTable(tableName);
  const result = await pool
    .request()
    .input("TableName", sql.NVarChar, qualified)
    .input("IndexName", sql.NVarChar, indexName).query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE Name = @IndexName
          AND Object_ID = OBJECT_ID(@TableName)
      ) THEN 1 ELSE 0 END AS Result;
    `);
  return result.recordset?.[0]?.Result === 1;
};

const normalizeExcelHeaderName = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");

const EXCEL_FIELD_MAP = new Map([
  ["shfurnitori", "supplierCode"],
  ["sh furnitori", "supplierCode"],
  ["furnitori", "supplierName"],
  ["adresa (shteti, qyteti, rruga)", "supplierAddress"],
  ["adresa(shteti, qyteti, rruga)", "supplierAddress"],
  ["nrkontaktues", "supplierContact"],
  ["nr kontaktues", "supplierContact"],
  ["email", "supplierEmail"],
  ["shifrapartikullit", "article"],
  ["shifra artikullit", "article"],
  ["barkodi", "barcode"],
  ["emriartikullit", "articleName"],
  ["emri artikullit", "articleName"],
  ["njesiamatese", "unitOfMeasure"],
  ["njesia matese", "unitOfMeasure"],
  ["cope/pako", "piecesPerPack"],
  ["copepako", "piecesPerPack"],
  ["cope / pako", "piecesPerPack"],
  ["pako/paleta", "packsPerPallet"],
  ["pakopaleta", "packsPerPallet"],
  ["pako / paleta", "packsPerPallet"],
  ["sasia-pako", "boxCount"],
  ["sasiapako", "boxCount"],
  ["sasia - pako", "boxCount"],
  ["sasia-palete", "palletCount"],
  ["sasiapalete", "palletCount"],
  ["sasia - palete", "palletCount"],
  ["dataeplanifikuarearitjes", "plannedArrival"],
  ["forma transportit", "transportMode"],
  ["formatransportit", "transportMode"],
  ["kthimi paletave", "palletReturn"],
  ["kthimipaletave", "palletReturn"],
  ["afati pageses (dite)", "paymentTermsDays"],
  ["afatipageses(dite)", "paymentTermsDays"],
  ["lead time (dite)", "leadTimeDays"],
  ["leadtime(dite)", "leadTimeDays"],
]);

const parseExcelNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const normalized = String(value).trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseExcelDateValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    }
  }

  const stringValue = trimString(value);
  if (!stringValue) {
    return null;
  }

  const sanitized = stringValue.replace(/\./g, "-").replace(/\s+/g, " ");
  const parsedDate = new Date(sanitized);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate;
  }

  return null;
};

const toSqlDate = (value) => {
  if (!(value instanceof Date)) {
    return null;
  }
  return value.toISOString().split("T")[0];
};

const sanitizeExcelString = (value, maxLength = 255) => {
  const trimmed = trimString(value);
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return trimmed.slice(0, maxLength);
};

const buildExcelItem = ({ row, sourceFileName, sheetName }) => {
  if (!row || typeof row !== "object") {
    return null;
  }

  const mapped = {};
  for (const [header, value] of Object.entries(row)) {
    const normalizedHeader = normalizeExcelHeaderName(header);
    const targetKey = EXCEL_FIELD_MAP.get(normalizedHeader);
    if (!targetKey) {
      continue;
    }
    mapped[targetKey] = value;
  }

  const articleValue = sanitizeExcelString(mapped.article, 255);
  const boxCountValue = parseExcelNumber(mapped.boxCount);

  if (!articleValue || !Number.isFinite(boxCountValue) || boxCountValue <= 0) {
    return null;
  }

  const palletCountOverride = parseExcelNumber(mapped.palletCount);
  const plannedArrival = parseExcelDateValue(mapped.plannedArrival);
  const paymentTerms = parseExcelNumber(mapped.paymentTermsDays);
  const leadTime = parseExcelNumber(mapped.leadTimeDays);

  const excelMeta = {
    supplierCode: sanitizeExcelString(mapped.supplierCode, 100),
    supplierName: sanitizeExcelString(mapped.supplierName, 255),
    supplierAddress: sanitizeExcelString(mapped.supplierAddress, 500),
    supplierContact: sanitizeExcelString(mapped.supplierContact, 100),
    supplierEmail: sanitizeExcelString(mapped.supplierEmail, 255),
    barcode: sanitizeExcelString(mapped.barcode, 100),
    articleName: sanitizeExcelString(mapped.articleName, 255),
    unitOfMeasure: sanitizeExcelString(mapped.unitOfMeasure, 100),
    piecesPerPack: parseExcelNumber(mapped.piecesPerPack),
    packsPerPallet: parseExcelNumber(mapped.packsPerPallet),
    palletQuantity: parseExcelNumber(mapped.palletCount),
    transportMode: sanitizeExcelString(mapped.transportMode, 255),
    palletReturn: sanitizeExcelString(mapped.palletReturn, 255),
    paymentTermsDays:
      Number.isFinite(paymentTerms) && paymentTerms >= 0
        ? Math.round(paymentTerms)
        : null,
    leadTimeDays:
      Number.isFinite(leadTime) && leadTime >= 0 ? Math.round(leadTime) : null,
    plannedArrivalDate: plannedArrival,
    sourceFileName: sanitizeExcelString(sourceFileName, 255),
    sourceSheetName: sanitizeExcelString(sheetName, 255),
  };

  return {
    article: normalizeArticleCode(articleValue),
    boxCount: boxCountValue,
    palletCountOverride:
      Number.isFinite(palletCountOverride) && palletCountOverride >= 0
        ? palletCountOverride
        : null,
    excelMeta,
    importerCandidate: excelMeta.supplierName ?? excelMeta.supplierCode ?? null,
    plannedArrival,
  };
};

let ensureEnhancementsPromise = null;
const ensureImportRequestEnhancements = () => {
  if (!ensureEnhancementsPromise) {
    const runner = (async () => {
      const pool = await poolPromise;
      const importTable = "dbo.ImportRequests";
      const detailsTable = "dbo.ImportRequestExcelDetails";
      const batchColumn = "BatchId";
      const batchConstraint = "DF_ImportRequests_BatchId";
      const articleNameColumn = "ArticleName";

      const ensureBatchColumn = async () => {
        const hasBatchColumn = await columnExists(
          pool,
          importTable,
          batchColumn
        );
        if (!hasBatchColumn) {
          await pool
            .request()
            .query(
              `ALTER TABLE ${importTable} ADD ${batchColumn} UNIQUEIDENTIFIER NULL;`
            );
        }

        const hasConstraint = await defaultConstraintExists(
          pool,
          batchConstraint
        );
        if (!hasConstraint) {
          await pool
            .request()
            .query(
              `ALTER TABLE ${importTable} ADD CONSTRAINT ${batchConstraint} DEFAULT (NEWID()) FOR ${batchColumn};`
            );
        }

        if (await columnExists(pool, importTable, batchColumn)) {
          await pool.request().query(`
            UPDATE ${importTable}
            SET ${batchColumn} = COALESCE(${batchColumn}, NEWID())
            WHERE ${batchColumn} IS NULL;
          `);
        }
      };

      const ensureArticleNameColumn = async () => {
        const hasArticleName = await columnExists(
          pool,
          importTable,
          articleNameColumn
        );
        if (!hasArticleName) {
          await pool
            .request()
            .query(
              `ALTER TABLE ${importTable} ADD ${articleNameColumn} NVARCHAR(255) NULL;`
            );
        }
      };

      const ensureDetailsTable = async () => {
        const detailColumnDefinitions = [
          ["SupplierCode", "NVARCHAR(100) NULL"],
          ["SupplierName", "NVARCHAR(255) NULL"],
          ["SupplierAddress", "NVARCHAR(500) NULL"],
          ["SupplierContact", "NVARCHAR(100) NULL"],
          ["SupplierEmail", "NVARCHAR(255) NULL"],
          ["Barcode", "NVARCHAR(100) NULL"],
          ["ArticleName", "NVARCHAR(255) NULL"],
          ["UnitOfMeasure", "NVARCHAR(100) NULL"],
          ["PiecesPerPack", "DECIMAL(18, 6) NULL"],
          ["PacksPerPallet", "DECIMAL(18, 6) NULL"],
          ["PalletQuantity", "DECIMAL(18, 6) NULL"],
          ["TransportMode", "NVARCHAR(255) NULL"],
          ["PalletReturn", "NVARCHAR(255) NULL"],
          ["PaymentTermsDays", "INT NULL"],
          ["LeadTimeDays", "INT NULL"],
          ["PlannedArrivalDate", "DATE NULL"],
          ["SourceFileName", "NVARCHAR(255) NULL"],
          ["SourceSheetName", "NVARCHAR(255) NULL"],
          ["CreatedAt", "DATETIME NOT NULL DEFAULT (GETDATE()) WITH VALUES"],
        ];

        const ensureDetailsColumn = async (column, definition) => {
          const exists = await columnExists(pool, detailsTable, column);
          if (!exists) {
            await pool
              .request()
              .query(
                `ALTER TABLE ${detailsTable} ADD ${column} ${definition};`
              );
          }
        };

        const hasDetailsTable = await tableExists(pool, detailsTable);
        if (!hasDetailsTable) {
          await pool.request().query(`
            CREATE TABLE ${detailsTable} (
              ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
              RequestID INT NOT NULL UNIQUE,
              ${batchColumn} UNIQUEIDENTIFIER NOT NULL,
              SupplierCode NVARCHAR(100) NULL,
              SupplierName NVARCHAR(255) NULL,
              SupplierAddress NVARCHAR(500) NULL,
              SupplierContact NVARCHAR(100) NULL,
              SupplierEmail NVARCHAR(255) NULL,
              Barcode NVARCHAR(100) NULL,
              ArticleName NVARCHAR(255) NULL,
              UnitOfMeasure NVARCHAR(100) NULL,
              PiecesPerPack DECIMAL(18, 6) NULL,
              PacksPerPallet DECIMAL(18, 6) NULL,
              PalletQuantity DECIMAL(18, 6) NULL,
              TransportMode NVARCHAR(255) NULL,
              PalletReturn NVARCHAR(255) NULL,
              PaymentTermsDays INT NULL,
              LeadTimeDays INT NULL,
              PlannedArrivalDate DATE NULL,
              SourceFileName NVARCHAR(255) NULL,
              SourceSheetName NVARCHAR(255) NULL,
              CreatedAt DATETIME NOT NULL DEFAULT (GETDATE()),
              CONSTRAINT FK_ImportRequestExcelDetails_Request FOREIGN KEY (RequestID)
                REFERENCES dbo.ImportRequests(ID)
                ON DELETE CASCADE
            );

            CREATE UNIQUE INDEX UX_ImportRequestExcelDetails_Request
              ON ${detailsTable} (RequestID);
            CREATE INDEX IX_ImportRequestExcelDetails_BatchId
              ON ${detailsTable} (${batchColumn});
          `);
          return;
        }

        await ensureDetailsColumn(batchColumn, "UNIQUEIDENTIFIER NULL");
        if (await columnExists(pool, detailsTable, batchColumn)) {
          await pool.request().query(`
            UPDATE ${detailsTable}
            SET ${batchColumn} = COALESCE(${batchColumn}, NEWID())
            WHERE ${batchColumn} IS NULL;
          `);
          await pool
            .request()
            .query(
              `ALTER TABLE ${detailsTable} ALTER COLUMN ${batchColumn} UNIQUEIDENTIFIER NOT NULL;`
            );
        }

        for (const [column, definition] of detailColumnDefinitions) {
          await ensureDetailsColumn(column, definition);
        }

        if (
          !(await indexExists(
            pool,
            detailsTable,
            "UX_ImportRequestExcelDetails_Request"
          ))
        ) {
          await pool.request().query(`
            CREATE UNIQUE INDEX UX_ImportRequestExcelDetails_Request
              ON ${detailsTable} (RequestID);
          `);
        }

        if (
          !(await indexExists(
            pool,
            detailsTable,
            "IX_ImportRequestExcelDetails_BatchId"
          ))
        ) {
          await pool.request().query(`
            CREATE INDEX IX_ImportRequestExcelDetails_BatchId
              ON ${detailsTable} (${batchColumn});
          `);
        }
      };

      await ensureBatchColumn();
      await ensureArticleNameColumn();
      await ensureDetailsTable();
    })();

    ensureEnhancementsPromise = runner
      .then((result) => {
        markImportRequestFeatureStateDirty();
        return result;
      })
      .catch((error) => {
        markImportRequestFeatureStateDirty();
        ensureEnhancementsPromise = null;
        throw error;
      });
  }

  return ensureEnhancementsPromise;
};

const getImportRequestFeatureState = async () => {
  if (!importRequestFeatureState.checked) {
    try {
      await ensureImportRequestEnhancements();
    } catch (ensureError) {
      console.error(
        "Import request schema ensure failed:",
        ensureError?.message || ensureError
      );
    }

    try {
      const pool = await poolPromise;
      const detection = await pool.request().query(`
        SELECT
          CASE WHEN COL_LENGTH('dbo.ImportRequests', 'BatchId') IS NULL THEN 0 ELSE 1 END AS HasBatchId,
          CASE WHEN OBJECT_ID('dbo.ImportRequestExcelDetails', 'U') IS NULL THEN 0 ELSE 1 END AS HasExcelDetails
      `);
      const row = detection.recordset?.[0] ?? {};
      importRequestFeatureState = {
        checked: true,
        hasBatchId: row.HasBatchId === 1,
        hasExcelDetails: row.HasExcelDetails === 1,
      };
    } catch (stateError) {
      console.error(
        "Import request feature detection failed:",
        stateError?.message || stateError
      );
      importRequestFeatureState = {
        checked: true,
        hasBatchId: false,
        hasExcelDetails: false,
      };
    }
  }

  return importRequestFeatureState;
};

const insertExcelDetails = async (
  transaction,
  { requestId, batchId, meta }
) => {
  if (!meta) {
    return;
  }

  const plannedArrivalSql = meta.plannedArrivalDate
    ? toSqlDate(meta.plannedArrivalDate)
    : null;

  const extrasRequest = new sql.Request(transaction)
    .input("RequestID", requestId)
    .input("BatchId", batchId)
    .input("SupplierCode", meta.supplierCode ?? null)
    .input("SupplierName", meta.supplierName ?? null)
    .input("SupplierAddress", meta.supplierAddress ?? null)
    .input("SupplierContact", meta.supplierContact ?? null)
    .input("SupplierEmail", meta.supplierEmail ?? null)
    .input("Barcode", meta.barcode ?? null)
    .input("ArticleName", meta.articleName ?? null)
    .input("UnitOfMeasure", meta.unitOfMeasure ?? null)
    .input("PiecesPerPack", meta.piecesPerPack ?? null)
    .input("PacksPerPallet", meta.packsPerPallet ?? null)
    .input("PalletQuantity", meta.palletQuantity ?? null)
    .input("TransportMode", meta.transportMode ?? null)
    .input("PalletReturn", meta.palletReturn ?? null)
    .input("PaymentTermsDays", meta.paymentTermsDays ?? null)
    .input("LeadTimeDays", meta.leadTimeDays ?? null)
    .input("PlannedArrivalDate", plannedArrivalSql)
    .input("SourceFileName", meta.sourceFileName ?? null)
    .input("SourceSheetName", meta.sourceSheetName ?? null);

  await extrasRequest.query(`MERGE dbo.ImportRequestExcelDetails AS Target
      USING (SELECT @RequestID AS RequestID) AS Source
      ON Target.RequestID = Source.RequestID
      WHEN MATCHED THEN
        UPDATE SET
          BatchId = @BatchId,
          SupplierCode = @SupplierCode,
          SupplierName = @SupplierName,
          SupplierAddress = @SupplierAddress,
          SupplierContact = @SupplierContact,
          SupplierEmail = @SupplierEmail,
          Barcode = @Barcode,
          ArticleName = @ArticleName,
          UnitOfMeasure = @UnitOfMeasure,
          PiecesPerPack = @PiecesPerPack,
          PacksPerPallet = @PacksPerPallet,
          PalletQuantity = @PalletQuantity,
          TransportMode = @TransportMode,
          PalletReturn = @PalletReturn,
          PaymentTermsDays = @PaymentTermsDays,
          LeadTimeDays = @LeadTimeDays,
          PlannedArrivalDate = @PlannedArrivalDate,
          SourceFileName = @SourceFileName,
          SourceSheetName = @SourceSheetName
      WHEN NOT MATCHED THEN
        INSERT (
          RequestID,
          BatchId,
          SupplierCode,
          SupplierName,
          SupplierAddress,
          SupplierContact,
          SupplierEmail,
          Barcode,
          ArticleName,
          UnitOfMeasure,
          PiecesPerPack,
          PacksPerPallet,
          PalletQuantity,
          TransportMode,
          PalletReturn,
          PaymentTermsDays,
          LeadTimeDays,
          PlannedArrivalDate,
          SourceFileName,
          SourceSheetName
        )
        VALUES (
          @RequestID,
          @BatchId,
          @SupplierCode,
          @SupplierName,
          @SupplierAddress,
          @SupplierContact,
          @SupplierEmail,
          @Barcode,
          @ArticleName,
          @UnitOfMeasure,
          @PiecesPerPack,
          @PacksPerPallet,
          @PalletQuantity,
          @TransportMode,
          @PalletReturn,
          @PaymentTermsDays,
          @LeadTimeDays,
          @PlannedArrivalDate,
          @SourceFileName,
          @SourceSheetName
        );`);
};

const insertImportRequestItems = async ({
  importer,
  requestDateSqlValue,
  arrivalDateSqlValue,
  normalizedItems,
  requesterUsername,
  batchId,
  defaultComment,
}) => {
  if (!Array.isArray(normalizedItems) || normalizedItems.length === 0) {
    throw new Error("At least one article is required for the import order.");
  }

  const featureState = await getImportRequestFeatureState();
  const includeBatchId = featureState.hasBatchId;
  const includeExcelDetails =
    featureState.hasBatchId && featureState.hasExcelDetails;
  const effectiveBatchId = includeBatchId ? batchId : null;

  const pool = await poolPromise;
  const secondaryPool = await secondaryPoolPromise;
  const transaction = new sql.Transaction(pool);
  const insertedRecords = [];
  const articleNameLookup = await fetchArticleNames(
    secondaryPool,
    normalizedItems.map((item) => item.article)
  );

  await transaction.begin();

  try {
    for (let index = 0; index < normalizedItems.length; index += 1) {
      const current = normalizedItems[index];
      const fallbackArticleName =
        (current.excelMeta && trimString(current.excelMeta.articleName)) ??
        null;
      const articleName =
        articleNameLookup.get(current.article) ?? fallbackArticleName;

      let calculation = current.calculation ?? null;
      if (!calculation) {
        try {
          calculation = await calculatePalletization(secondaryPool, {
            article: current.article,
            boxCount: current.boxCount,
          });
        } catch (error) {
          error.meta = {
            article: current.article,
            itemIndex: index + 1,
          };
          throw error;
        }
      }

      const palletCount = (() => {
        if (
          Number.isFinite(current.palletCountOverride) &&
          current.palletCountOverride >= 0
        ) {
          return Math.max(0, Math.round(current.palletCountOverride));
        }
        if (Number.isFinite(calculation.totalPalletPositions)) {
          return Math.max(0, Math.round(calculation.totalPalletPositions));
        }
        return 0;
      })();

      const request = new sql.Request(transaction)
        .input("DataKerkeses", requestDateSqlValue)
        .input("DataArritjes", arrivalDateSqlValue)
        .input("Importuesi", importer)
        .input("Artikulli", current.article)
        .input("ArticleName", articleName)
        .input("NumriPakove", current.boxCount)
        .input("NumriPaletave", palletCount)
        .input("BoxesPerPallet", calculation.boxesPerPallet ?? null)
        .input("BoxesPerLayer", calculation.boxesPerLayer ?? null)
        .input("LayersPerPallet", calculation.layersPerPallet ?? null)
        .input("FullPallets", calculation.fullPallets ?? null)
        .input("RemainingBoxes", calculation.remainingBoxes ?? null)
        .input("PalletWeightKg", calculation.palletWeightKg ?? null)
        .input("PalletVolumeM3", calculation.palletVolumeM3 ?? null)
        .input("BoxWeightKg", calculation.boxWeightKg ?? null)
        .input("BoxVolumeM3", calculation.boxVolumeM3 ?? null)
        .input(
          "PalletVolumeUtilization",
          calculation.palletVolumeUtilization ?? null
        )
        .input("WeightFullPalletsKg", calculation.weightFullPalletsKg ?? null)
        .input("VolumeFullPalletsM3", calculation.volumeFullPalletsM3 ?? null)
        .input("WeightRemainingKg", calculation.weightRemainingKg ?? null)
        .input("VolumeRemainingM3", calculation.volumeRemainingM3 ?? null)
        .input(
          "TotalShipmentWeightKg",
          calculation.totalShipmentWeightKg ?? null
        )
        .input(
          "TotalShipmentVolumeM3",
          calculation.totalShipmentVolumeM3 ?? null
        )
        .input("Comment", current.comment ?? defaultComment ?? null)
        .input("Useri", requesterUsername);

      if (includeBatchId) {
        request.input("BatchId", effectiveBatchId);
      }

      const result = await request.query(`INSERT INTO ImportRequests (
              DataKerkeses,
              DataArritjes,
              Importuesi,
              Artikulli,
              ArticleName,
              NumriPakove,
              NumriPaletave,
              BoxesPerPallet,
              BoxesPerLayer,
              LayersPerPallet,
              FullPallets,
              RemainingBoxes,
              PalletWeightKg,
              PalletVolumeM3,
              BoxWeightKg,
              BoxVolumeM3,
              PalletVolumeUtilization,
              WeightFullPalletsKg,
              VolumeFullPalletsM3,
              WeightRemainingKg,
              VolumeRemainingM3,
              TotalShipmentWeightKg,
              TotalShipmentVolumeM3,
              Useri,
              Comment${
                includeBatchId
                  ? `,
              BatchId`
                  : ""
              }
            )
            OUTPUT INSERTED.ID,
                   INSERTED.DataKerkeses AS RequestDate,
                   INSERTED.DataArritjes AS ArrivalDate,
                   INSERTED.Importuesi AS Importer,
                   INSERTED.Artikulli AS Article,
                   INSERTED.ArticleName AS ArticleName,
                   INSERTED.NumriPakove AS BoxCount,
                   INSERTED.NumriPaletave AS PalletCount,
                   INSERTED.BoxesPerPallet,
                   INSERTED.BoxesPerLayer,
                   INSERTED.LayersPerPallet,
                   INSERTED.FullPallets,
                   INSERTED.RemainingBoxes,
                   INSERTED.PalletWeightKg,
                   INSERTED.PalletVolumeM3,
                   INSERTED.BoxWeightKg,
                   INSERTED.BoxVolumeM3,
                   INSERTED.PalletVolumeUtilization,
                   INSERTED.WeightFullPalletsKg,
                   INSERTED.VolumeFullPalletsM3,
                   INSERTED.WeightRemainingKg,
                   INSERTED.VolumeRemainingM3,
                   INSERTED.TotalShipmentWeightKg,
                   INSERTED.TotalShipmentVolumeM3,
                   INSERTED.Comment,
                   INSERTED.Useri AS Requester,
                   INSERTED.Status,
                   INSERTED.ConfirmedBy,
                   INSERTED.CreatedAt${
                     includeBatchId
                       ? `,
                   INSERTED.BatchId`
                       : ""
                   }
            VALUES (
              @DataKerkeses,
              @DataArritjes,
              @Importuesi,
              @Artikulli,
              @ArticleName,
              @NumriPakove,
              @NumriPaletave,
              @BoxesPerPallet,
              @BoxesPerLayer,
              @LayersPerPallet,
              @FullPallets,
              @RemainingBoxes,
              @PalletWeightKg,
              @PalletVolumeM3,
              @BoxWeightKg,
              @BoxVolumeM3,
              @PalletVolumeUtilization,
              @WeightFullPalletsKg,
              @VolumeFullPalletsM3,
              @WeightRemainingKg,
              @VolumeRemainingM3,
              @TotalShipmentWeightKg,
              @TotalShipmentVolumeM3,
              @Useri,
              @Comment${
                includeBatchId
                  ? `,
              @BatchId`
                  : ""
              }
            )`);

      const [record] = mapArticles(result.recordset);
      insertedRecords.push(record);

      if (includeExcelDetails && current.excelMeta) {
        await insertExcelDetails(transaction, {
          requestId: record.ID,
          batchId: effectiveBatchId,
          meta: current.excelMeta,
        });
      }
    }

    await transaction.commit();
    return insertedRecords;
  } catch (transactionError) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError.message);
    }

    throw transactionError;
  }
};

const notifyRequestCreation = async ({ pool, records, initiatorUsername }) => {
  if (!records || records.length === 0) {
    return;
  }

  const newRequestRoles = ["admin", "confirmer"];

  for (const record of records) {
    const arrivalLabel = formatNotificationDate(record.ArrivalDate);
    const importerLabel = record.Importer || "Unknown importer";
    const articleLabel = record.ArticleName || record.Article || "N/A";
    const message = `${initiatorUsername} submitted request #${record.ID} (${articleLabel}) for ${importerLabel} with arrival ${arrivalLabel}.`;

    try {
      await dispatchNotificationEvent(pool, {
        requestId: record.ID,
        message,
        type: "request_created",
        roles: newRequestRoles,
        excludeUsername: initiatorUsername,
        push: {
          title: "New import request",
          body: message,
          data: { intent: "request_created" },
          tag: "request-" + record.ID + "-created",
        },
      });
    } catch (notificationError) {
      console.error(
        "Request creation notification error:",
        notificationError.message
      );
    }
  }
};

ensureImportRequestEnhancements().catch((error) => {
  console.error(
    "Failed to ensure ImportRequests schema:",
    error?.message || error
  );
});

router.post("/", verifyRole(["requester"]), async (req, res) => {
  const {
    requestDate,
    arrivalDate,
    importer,
    comment,
    article,
    boxCount,
    items,
  } = req.body;

  if (!importer) {
    return res
      .status(400)
      .json({ message: "Importer is required to create an import order." });
  }

  if (!arrivalDate) {
    return res
      .status(400)
      .json({ message: "An arrival date is required for the import order." });
  }

  const rawItems = (() => {
    if (Array.isArray(items) && items.length > 0) {
      return items.filter((item) => item !== null && item !== undefined);
    }

    if (article !== undefined || boxCount !== undefined) {
      return [
        {
          article,
          boxCount,
          comment,
        },
      ];
    }

    return [];
  })();

  if (rawItems.length === 0) {
    return res.status(400).json({
      message: "At least one article is required for the import order.",
    });
  }

  const sanitizedDefaultComment = sanitizeComment(comment);

  const normalizedItems = [];

  for (let index = 0; index < rawItems.length; index += 1) {
    const current = rawItems[index] ?? {};
    const articleValue =
      current.article ?? current.Artikulli ?? current.Article ?? "";
    const articleString = String(articleValue).trim();

    if (!articleString) {
      return res.status(400).json({
        message: `Article is required for item ${index + 1}.`,
      });
    }

    const normalizedArticle = normalizeArticleCode(articleString);
    const boxValue =
      current.boxCount ?? current.NumriPakove ?? current.Boxes ?? null;
    const parsedBoxCount = Number(boxValue);

    if (!Number.isFinite(parsedBoxCount) || parsedBoxCount <= 0) {
      return res.status(400).json({
        message: `Box count for item ${index + 1} must be a positive number.`,
      });
    }

    const sanitizedItemComment = sanitizeComment(current.comment);

    normalizedItems.push({
      article: normalizedArticle,
      boxCount: parsedBoxCount,
      comment: sanitizedItemComment ?? sanitizedDefaultComment,
    });
  }

  try {
    const requestDateValue = (() => {
      if (!requestDate) return new Date();

      const parsed = new Date(requestDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid request date provided.");
      }
      return parsed;
    })();

    const arrivalDateValue = (() => {
      const parsed = new Date(arrivalDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error("Invalid arrival date provided.");
      }
      return parsed;
    })();

    const requestDateSqlValue = requestDateValue.toISOString().split("T")[0];
    const arrivalDateSqlValue = arrivalDateValue.toISOString().split("T")[0];
    const batchId = randomUUID();

    const insertedRecords = await insertImportRequestItems({
      importer,
      requestDateSqlValue,
      arrivalDateSqlValue,
      normalizedItems,
      requesterUsername: req.user.username,
      batchId,
      defaultComment: sanitizedDefaultComment,
    });

    const responsePayload =
      insertedRecords.length === 1 ? insertedRecords[0] : insertedRecords;

    if (insertedRecords.length > 0) {
      const pool = await poolPromise;
      await notifyRequestCreation({
        pool,
        records: insertedRecords,
        initiatorUsername: req.user.username,
      });
    }

    res.json(responsePayload);
  } catch (err) {
    console.error("Create error:", err);
    if (
      err.message === "Invalid request date provided." ||
      err.message === "Invalid arrival date provided."
    ) {
      return res.status(400).json({ message: err.message });
    }
    if (
      err.message === "Pallet calculation unavailable." &&
      err.meta?.article
    ) {
      return res.status(400).json({
        message: `We couldn't calculate pallet details for article ${err.meta.article}. Please verify the article code and box quantity.`,
      });
    }
    if (err.meta?.article) {
      return res.status(400).json({
        message: `We couldn't calculate pallet details for article ${err.meta.article}. Please verify the article code and box quantity.`,
      });
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/upload",
  verifyRole(["requester"]),
  upload.array("files", 12),
  async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res
        .status(400)
        .json({ message: "Please attach at least one Excel file." });
    }

    const sanitizedDefaultComment = sanitizeComment(req.body.comment);
    const excelItems = [];
    const importerCandidates = new Set();
    const arrivalCandidates = new Set();

    try {
      for (const file of files) {
        let workbook;
        try {
          workbook = XLSX.read(file.buffer, {
            type: "buffer",
            cellDates: true,
          });
        } catch (readError) {
          return res.status(400).json({
            message: `Unable to read ${file.originalname}. Please ensure the file is a valid Excel spreadsheet.`,
          });
        }

        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;

          const rows = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
            blankrows: false,
          });

          for (const row of rows) {
            const parsed = buildExcelItem({
              row,
              sourceFileName: file.originalname,
              sheetName,
            });

            if (!parsed) {
              continue;
            }

            if (parsed.importerCandidate) {
              importerCandidates.add(parsed.importerCandidate);
            }

            if (parsed.plannedArrival) {
              const arrivalSql = toSqlDate(parsed.plannedArrival);
              if (arrivalSql) {
                arrivalCandidates.add(arrivalSql);
              }
            }

            excelItems.push(parsed);
          }
        }
      }

      if (excelItems.length === 0) {
        return res.status(400).json({
          message:
            "No valid rows were found in the uploaded spreadsheets. Make sure the header matches the expected template.",
        });
      }

      const importerFromBody = trimString(req.body.importer);
      let importerValue = importerFromBody;

      if (!importerValue) {
        if (importerCandidates.size === 1) {
          importerValue = [...importerCandidates][0];
        }
      }

      if (!importerValue) {
        return res.status(400).json({
          message:
            "Unable to determine the importer. Please fill the importer field or ensure every Excel sheet contains the same Furnitori value.",
        });
      }

      const arrivalFromBody = trimString(req.body.arrivalDate);
      let arrivalDateSqlValue = null;

      if (arrivalFromBody) {
        const parsed = new Date(arrivalFromBody);
        if (Number.isNaN(parsed.getTime())) {
          return res
            .status(400)
            .json({ message: "Invalid arrival date provided." });
        }
        arrivalDateSqlValue = parsed.toISOString().split("T")[0];
      } else if (arrivalCandidates.size === 1) {
        arrivalDateSqlValue = [...arrivalCandidates][0];
      } else {
        return res.status(400).json({
          message:
            "Unable to determine the arrival date. Please fill the arrival date field or ensure all Excel rows use the same planned arrival date.",
        });
      }

      const requestDateValue = (() => {
        const provided = trimString(req.body.requestDate);
        if (!provided) return new Date();
        const parsed = new Date(provided);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error("Invalid request date provided.");
        }
        return parsed;
      })();

      const requestDateSqlValue = requestDateValue.toISOString().split("T")[0];
      const batchId = randomUUID();

      const normalizedItems = excelItems.map((item) => ({
        article: item.article,
        boxCount: item.boxCount,
        palletCountOverride: item.palletCountOverride,
        comment: sanitizedDefaultComment,
        excelMeta: item.excelMeta,
      }));

      const insertedRecords = await insertImportRequestItems({
        importer: importerValue,
        requestDateSqlValue,
        arrivalDateSqlValue,
        normalizedItems,
        requesterUsername: req.user.username,
        batchId,
        defaultComment: sanitizedDefaultComment,
      });

      if (insertedRecords.length > 0) {
        const pool = await poolPromise;
        await notifyRequestCreation({
          pool,
          records: insertedRecords,
          initiatorUsername: req.user.username,
        });
      }

      const { hasBatchId } = await getImportRequestFeatureState();
      res.json({
        ...(hasBatchId ? { batchId } : {}),
        items: insertedRecords,
        importer: importerValue,
        arrivalDate: arrivalDateSqlValue,
        processedRows: excelItems.length,
      });
    } catch (error) {
      console.error("Excel upload error:", error);
      if (error.message === "Invalid request date provided.") {
        return res.status(400).json({ message: error.message });
      }
      if (
        error.message === "Pallet calculation unavailable." &&
        error.meta?.article
      ) {
        return res.status(400).json({
          message: `We couldn't calculate pallet details for article ${error.meta.article}. Please verify the article code and box quantity.`,
        });
      }
      res
        .status(500)
        .json({ message: "Failed to create requests from the Excel files." });
    }
  }
);
// ---------- GET PENDING REQUESTS (Confirmer) ----------
router.get("/", verifyRole(["confirmer"]), async (req, res) => {
  try {
    const { hasBatchId } = await getImportRequestFeatureState();
    const batchProjection = hasBatchId
      ? ", BatchId"
      : ", CAST(NULL AS UNIQUEIDENTIFIER) AS BatchId";
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     DataArritjes AS ArrivalDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
                     ArticleName,
                     NumriPakove AS BoxCount,
                     NumriPaletave AS PalletCount,
                     BoxesPerPallet,
                     BoxesPerLayer,
                     LayersPerPallet,
                     FullPallets,
                     RemainingBoxes,
                     PalletWeightKg,
                     PalletVolumeM3,
                     BoxWeightKg,
                     BoxVolumeM3,
                     PalletVolumeUtilization,
                     WeightFullPalletsKg,
                     VolumeFullPalletsM3,
                     WeightRemainingKg,
                     VolumeRemainingM3,
                     TotalShipmentWeightKg,
                     TotalShipmentVolumeM3,
                     Comment,
                     Useri AS Requester,
                     Status,
                     ConfirmedBy,
                     CreatedAt${batchProjection}
              FROM ImportRequests
              WHERE Status = 'pending'
              ORDER BY CreatedAt DESC`);
    res.json(mapArticles(result.recordset));
  } catch (err) {
    console.error("Fetch error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- GET APPROVED REQUESTS (Admin) ----------
router.get(
  "/confirmed",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      const { hasBatchId } = await getImportRequestFeatureState();
      const batchProjection = hasBatchId
        ? ", BatchId"
        : ", CAST(NULL AS UNIQUEIDENTIFIER) AS BatchId";
      const pool = await poolPromise;
      const result = await pool.request().query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     DataArritjes AS ArrivalDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
                     ArticleName,
                     NumriPakove AS BoxCount,
                     NumriPaletave AS PalletCount,
                     BoxesPerPallet,
                     BoxesPerLayer,
                     LayersPerPallet,
                     FullPallets,
                     RemainingBoxes,
                     PalletWeightKg,
                     PalletVolumeM3,
                     BoxWeightKg,
                     BoxVolumeM3,
                     PalletVolumeUtilization,
                     WeightFullPalletsKg,
                     VolumeFullPalletsM3,
                     WeightRemainingKg,
                     VolumeRemainingM3,
                     TotalShipmentWeightKg,
                     TotalShipmentVolumeM3,
                     Comment,
                     Useri AS Requester,
                     Status,
                     ConfirmedBy,
                     CreatedAt${batchProjection}
              FROM ImportRequests
              WHERE Status = 'approved'
              ORDER BY DataArritjes ASC, CreatedAt DESC`);
      res.json(mapArticles(result.recordset));
    } catch (err) {
      console.error("Fetch approved error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/calendar",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      const { hasBatchId } = await getImportRequestFeatureState();
      const batchProjection = hasBatchId
        ? ", BatchId"
        : ", CAST(NULL AS UNIQUEIDENTIFIER) AS BatchId";
      await ensureWmsOrdersSchema();
      const pool = await poolPromise;

      const [confirmedResult, wmsResult] = await Promise.all([
        pool.request().query(`SELECT ID,
                         DataKerkeses AS RequestDate,
                         DataArritjes AS ArrivalDate,
                         Importuesi AS Importer,
                         Artikulli AS Article,
                         ArticleName,
                         NumriPakove AS BoxCount,
                         NumriPaletave AS PalletCount,
                         BoxesPerPallet,
                         BoxesPerLayer,
                         LayersPerPallet,
                         FullPallets,
                         RemainingBoxes,
                         PalletWeightKg,
                         PalletVolumeM3,
                         BoxWeightKg,
                         BoxVolumeM3,
                         PalletVolumeUtilization,
                         WeightFullPalletsKg,
                         VolumeFullPalletsM3,
                         WeightRemainingKg,
                         VolumeRemainingM3,
                         TotalShipmentWeightKg,
                         TotalShipmentVolumeM3,
                         Comment,
                         Useri AS Requester,
                         Status,
                         ConfirmedBy,
                         CreatedAt${batchProjection}
                  FROM ImportRequests
                  WHERE Status = 'approved'
                  ORDER BY DataArritjes ASC, CreatedAt DESC`),
        pool.request().query(`SELECT NarID,
                         OrderNumber,
                         Importer,
                         Article,
                         ArticleDescription,
                         BoxCount,
                         PalletCount,
                         ArrivalDate,
                         Comment,
                         SourceUpdatedAt,
                         LastSyncedAt
                  FROM WmsOrders
                  WHERE ArrivalDate IS NOT NULL
                  AND OrderTypeCode = 51`),
      ]);

      res.json({
        confirmedImports: mapArticles(confirmedResult.recordset),
        wmsOrders: mapWmsOrders(wmsResult.recordset),
      });
    } catch (err) {
      console.error("Fetch calendar error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.get(
  "/metrics",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      const pool = await poolPromise;

      const summaryResult = await pool.request()
        .query(`SELECT COUNT(*) AS TotalRequests,
                       SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
                       SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
                       SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount,
                       SUM(CAST(NumriPakove AS INT)) AS TotalBoxes,
                       SUM(CAST(NumriPaletave AS INT)) AS TotalPallets
                FROM ImportRequests`);

      const summary = summaryResult.recordset[0] ?? {};

      const totalRequests = Number(summary.TotalRequests ?? 0);
      const pendingCount = Number(summary.PendingCount ?? 0);
      const approvedCount = Number(summary.ApprovedCount ?? 0);
      const rejectedCount = Number(summary.RejectedCount ?? 0);
      const totalBoxesRaw = Number(summary.TotalBoxes ?? 0);
      const totalPalletsRaw = Number(summary.TotalPallets ?? 0);
      const totalBoxes = Number.isFinite(totalBoxesRaw) ? totalBoxesRaw : 0;
      const totalPallets = Number.isFinite(totalPalletsRaw)
        ? totalPalletsRaw
        : 0;
      const averagePallets =
        totalRequests > 0 && totalPallets > 0
          ? Math.round((totalPallets / totalRequests) * 10) / 10
          : 0;
      const averageBoxes =
        totalRequests > 0 && totalBoxes > 0
          ? Math.round((totalBoxes / totalRequests) * 10) / 10
          : 0;

      const upcomingResult = await pool.request()
        .query(`SELECT COUNT(*) AS UpcomingWeek
                FROM ImportRequests
                WHERE Status = 'approved'
                  AND DataArritjes IS NOT NULL
                  AND CAST(DataArritjes AS DATE) >= CAST(GETDATE() AS DATE)
                  AND CAST(DataArritjes AS DATE) < DATEADD(day, 7, CAST(GETDATE() AS DATE))`);

      const upcomingWeek = Number(
        upcomingResult.recordset?.[0]?.UpcomingWeek ?? 0
      );

      const monthlyResult = await pool.request()
        .query(`SELECT FORMAT(DataKerkeses, 'yyyy-MM') AS Month,
                       COUNT(*) AS RequestCount,
                       SUM(CAST(NumriPaletave AS INT)) AS PalletTotal,
                       SUM(CAST(NumriPakove AS INT)) AS BoxTotal
                FROM ImportRequests
                GROUP BY FORMAT(DataKerkeses, 'yyyy-MM')
                ORDER BY Month ASC`);

      const monthlyRequests = monthlyResult.recordset.map((row) => ({
        month: row.Month,
        requestCount: Number(row.RequestCount ?? 0),
        palletTotal: Number(row.PalletTotal ?? 0),
        boxTotal: Number(row.BoxTotal ?? 0),
      }));

      const articleGroupResult = await pool.request().query(`SELECT TOP 50
                       Artikulli AS Article,
                       MAX(ArticleName) AS ArticleName,
                       COUNT(*) AS RequestCount,
                       SUM(CASE WHEN Status = 'approved' THEN 1 ELSE 0 END) AS ApprovedCount,
                       SUM(CASE WHEN Status = 'pending' THEN 1 ELSE 0 END) AS PendingCount,
                       SUM(CASE WHEN Status = 'rejected' THEN 1 ELSE 0 END) AS RejectedCount,
                       SUM(CAST(NumriPakove AS INT)) AS BoxTotal,
                       SUM(CAST(NumriPaletave AS INT)) AS PalletTotal
                FROM ImportRequests
                GROUP BY Artikulli
                ORDER BY COUNT(*) DESC, Artikulli ASC`);

      const articleGroups = articleGroupResult.recordset.map((row) => ({
        article: normalizeArticleCode(row.Article),
        articleName: trimString(row.ArticleName),
        requestCount: Number(row.RequestCount ?? 0),
        approvedCount: Number(row.ApprovedCount ?? 0),
        pendingCount: Number(row.PendingCount ?? 0),
        rejectedCount: Number(row.RejectedCount ?? 0),
        boxTotal: Number(row.BoxTotal ?? 0),
        palletTotal: Number(row.PalletTotal ?? 0),
      }));

      res.json({
        totalRequests,
        pendingCount,
        approvedCount,
        rejectedCount,
        totalBoxes,
        totalPallets,
        averagePallets,
        averageBoxes,
        upcomingWeek,
        monthlyRequests,
        articleGroups,
      });
    } catch (err) {
      console.error("Metrics fetch error:", err.message);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.post(
  "/wms-orders/sync",
  verifyRole(["admin", "confirmer"]),
  async (req, res) => {
    try {
      await ensureWmsOrdersSchema();
      const secondaryPool = await secondaryPoolPromise;
      const wmsResult = await secondaryPool
        .request()
        .input("Dali_Broj_Dokument", sql.NVarChar(1), "D")
        .execute("wms_ZemiNarackiZaOdobruvanje");

      const rawRecords = Array.isArray(wmsResult.recordset)
        ? wmsResult.recordset
        : [];

      const filteredRecords = rawRecords.filter((record) => {
        const typeCode = trimString(record.Sifra_Nar);
        return typeCode === WMS_ALLOWED_ORDER_CODE;
      });

      const skippedDifferentCodes = rawRecords.length - filteredRecords.length;

      const preparedRecords = filteredRecords
        .map((record) => ({
          raw: record,
          mapped: mapRawWmsOrder(record),
        }))
        .filter((entry) => Number.isInteger(entry.mapped.orderId));

      const skippedMissingIdentifiers =
        filteredRecords.length - preparedRecords.length;

      if (preparedRecords.length === 0) {
        return res.json({
          message: `No WMS orders with code ${WMS_ALLOWED_ORDER_CODE} were available to sync.`,
          imported: 0,
          skippedDifferentCodes,
          skippedMissingIdentifiers,
          orders: [],
        });
      }

      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);

      await transaction.begin();

      const processedOrderIds = new Set();

      try {
        for (const { mapped } of preparedRecords) {
          const request = new sql.Request(transaction)
            .input("OrderId", sql.Int, mapped.orderId)
            .input("OrderTypeCode", sql.NVarChar(10), mapped.orderTypeCode)
            .input("OrderNumber", sql.NVarChar(50), mapped.orderNumber)
            .input("CustomerCode", sql.NVarChar(50), mapped.customerCode)
            .input("CustomerName", sql.NVarChar(255), mapped.customerName)
            .input("OrderDate", sql.DateTime2, mapped.orderDate ?? null)
            .input("ExpectedDate", sql.DateTime2, mapped.expectedDate ?? null)
            .input("IsRealized", sql.NVarChar(10), mapped.isRealized)
            .input("OrderStatus", sql.NVarChar(10), mapped.orderStatus)
            .input("Description", sql.NVarChar(500), mapped.description)
            .input("SourceReference", sql.NVarChar(100), mapped.sourceReference)
            .input(
              "ScheduledStart",
              sql.DateTime2,
              mapped.scheduledStart ?? null
            )
            .input(
              "OriginalOrderNumber",
              sql.NVarChar(100),
              mapped.originalOrderNumber
            )
            .input("CanProceed", sql.Bit, mapped.canProceed);

          await request.query(`MERGE WmsOrders AS Target
              USING (SELECT @OrderId AS OrderId) AS Source
              ON Target.OrderId = Source.OrderId
              WHEN MATCHED THEN
                UPDATE SET
                  OrderTypeCode = @OrderTypeCode,
                  OrderNumber = @OrderNumber,
                  CustomerCode = @CustomerCode,
                  CustomerName = @CustomerName,
                  OrderDate = @OrderDate,
                  ExpectedDate = @ExpectedDate,
                  IsRealized = @IsRealized,
                  OrderStatus = @OrderStatus,
                  Description = @Description,
                  SourceReference = @SourceReference,
                  ScheduledStart = @ScheduledStart,
                  OriginalOrderNumber = @OriginalOrderNumber,
                  CanProceed = @CanProceed,
                  LastSyncedAt = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN
                INSERT (
                  OrderId,
                  OrderTypeCode,
                  OrderNumber,
                  CustomerCode,
                  CustomerName,
                  OrderDate,
                  ExpectedDate,
                  IsRealized,
                  OrderStatus,
                  Description,
                  SourceReference,
                  ScheduledStart,
                  OriginalOrderNumber,
                  CanProceed,
                  LastSyncedAt
                )
                VALUES (
                  @OrderId,
                  @OrderTypeCode,
                  @OrderNumber,
                  @CustomerCode,
                  @CustomerName,
                  @OrderDate,
                  @ExpectedDate,
                  @IsRealized,
                  @OrderStatus,
                  @Description,
                  @SourceReference,
                  @ScheduledStart,
                  @OriginalOrderNumber,
                  @CanProceed,
                  SYSUTCDATETIME()
                );`);

          processedOrderIds.add(mapped.orderId);
        }

        await transaction.commit();
      } catch (transactionError) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error("WMS sync rollback error:", rollbackError.message);
        }

        throw transactionError;
      }

      const uniqueOrderIds = [...processedOrderIds];
      let syncedOrders = [];

      if (uniqueOrderIds.length > 0) {
        const fetchRequest = pool.request();
        const parameterPlaceholders = uniqueOrderIds.map((orderId, index) => {
          const parameter = `OrderId${index}`;
          fetchRequest.input(parameter, sql.Int, orderId);
          return `@${parameter}`;
        });

        const fetchResult = await fetchRequest.query(`SELECT ID,
                     OrderId,
                     OrderTypeCode,
                     OrderNumber,
                     CustomerCode,
                     CustomerName,
                     OrderDate,
                     ExpectedDate,
                     IsRealized,
                     OrderStatus,
                     Description,
                     SourceReference,
                     ScheduledStart,
                     OriginalOrderNumber,
                     CanProceed,
                     LastSyncedAt
              FROM WmsOrders
              WHERE OrderId IN (${parameterPlaceholders.join(", ")})
              ORDER BY ExpectedDate ASC, OrderDate ASC, OrderId ASC`);

        syncedOrders = fetchResult.recordset.map(mapWmsOrderResponse);
      }

      res.json({
        message: `Synchronized ${uniqueOrderIds.length} WMS order(s) with code ${WMS_ALLOWED_ORDER_CODE}.`,
        imported: uniqueOrderIds.length,
        skippedDifferentCodes,
        skippedMissingIdentifiers,
        orders: syncedOrders,
      });
    } catch (err) {
      console.error("WMS sync error:", err.message);
      res.status(500).json({ message: "Failed to synchronize WMS orders." });
    }
  }
);

router.get(
  "/wms-orders",
  verifyRole(["admin", "confirmer", "requester"]),
  async (req, res) => {
    try {
      await ensureWmsOrdersSchema();
      const pool = await poolPromise;
      const result = await pool.request().query(`SELECT ID,
                     OrderId,
                     OrderTypeCode,
                     OrderNumber,
                     CustomerCode,
                     CustomerName,
                     OrderDate,
                     ExpectedDate,
                     IsRealized,
                     OrderStatus,
                     Description,
                     SourceReference,
                     ScheduledStart,
                     OriginalOrderNumber,
                     CanProceed,
                     LastSyncedAt
              FROM WmsOrders
              ORDER BY ExpectedDate ASC, OrderDate ASC, OrderId ASC`);

      res.json(result.recordset.map(mapWmsOrderResponse));
    } catch (err) {
      console.error("WMS orders fetch error:", err.message);
      res.status(500).json({ message: "Failed to load WMS orders." });
    }
  }
);

// ---------- APPROVE/REJECT REQUEST ----------
router.patch("/:id", verifyRole(["confirmer"]), async (req, res) => {
  const { status, arrivalDate } = req.body;

  if (!status && !arrivalDate) {
    return res
      .status(400)
      .json({ message: "No updates were provided for this request." });
  }

  try {
    const { hasBatchId } = await getImportRequestFeatureState();
    const batchOutput = hasBatchId ? ", INSERTED.BatchId" : "";
    const pool = await poolPromise;
    const existingResult = await pool
      .request()
      .input("ID", req.params.id)
      .query(
        `SELECT DataArritjes AS CurrentArrivalDate, Useri AS Requester, Status AS CurrentStatus
         FROM ImportRequests
         WHERE ID = @ID`
      );

    if (existingResult.recordset.length === 0) {
      return res.status(404).json({ message: "Import request not found." });
    }

    const {
      CurrentArrivalDate,
      Requester: requesterUsername,
      CurrentStatus,
    } = existingResult.recordset[0];

    let arrivalDateSqlValue;
    if (arrivalDate) {
      const arrivalDateValue = new Date(arrivalDate);
      if (Number.isNaN(arrivalDateValue.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid arrival date provided." });
      }
      arrivalDateSqlValue = arrivalDateValue.toISOString().split("T")[0];
    }

    const updateRequest = pool
      .request()
      .input("ID", req.params.id)
      .input("ConfirmedBy", req.user.username);

    const setClauses = ["ConfirmedBy = @ConfirmedBy"];

    if (status) {
      updateRequest.input("Status", status);
      setClauses.push("Status = @Status");
    }

    if (arrivalDateSqlValue) {
      updateRequest.input("DataArritjes", arrivalDateSqlValue);
      setClauses.push("DataArritjes = @DataArritjes");
    }

    if (setClauses.length === 1) {
      return res
        .status(400)
        .json({ message: "No valid fields provided for update." });
    }

    const result = await updateRequest.query(`UPDATE ImportRequests
            SET ${setClauses.join(", ")}
            OUTPUT INSERTED.ID,
                   INSERTED.DataKerkeses AS RequestDate,
                   INSERTED.DataArritjes AS ArrivalDate,
                   INSERTED.Importuesi AS Importer,
                   INSERTED.Artikulli AS Article,
                   INSERTED.ArticleName AS ArticleName,
                   INSERTED.NumriPakove AS BoxCount,
                   INSERTED.NumriPaletave AS PalletCount,
                   INSERTED.BoxesPerPallet,
                   INSERTED.BoxesPerLayer,
                   INSERTED.LayersPerPallet,
                   INSERTED.FullPallets,
                   INSERTED.RemainingBoxes,
                   INSERTED.PalletWeightKg,
                   INSERTED.PalletVolumeM3,
                   INSERTED.BoxWeightKg,
                   INSERTED.BoxVolumeM3,
                   INSERTED.PalletVolumeUtilization,
                   INSERTED.WeightFullPalletsKg,
                   INSERTED.VolumeFullPalletsM3,
                   INSERTED.WeightRemainingKg,
                   INSERTED.VolumeRemainingM3,
                   INSERTED.TotalShipmentWeightKg,
                   INSERTED.TotalShipmentVolumeM3,
                   INSERTED.Comment,
                   INSERTED.Useri AS Requester,
                   INSERTED.Status,
                   INSERTED.ConfirmedBy,
                   INSERTED.CreatedAt${batchOutput}
            WHERE ID = @ID`);
    const [record] = mapArticles(result.recordset);

    const notificationsToDispatch = [];
    const defaultNotificationRoles = ["admin", "confirmer"];
    const requesterAudience = requesterUsername
      ? [requesterUsername]
      : undefined;

    if (arrivalDateSqlValue) {
      const previousDate = (() => {
        if (!CurrentArrivalDate) return null;
        const parsed = new Date(CurrentArrivalDate);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString().split("T")[0];
      })();

      if (!previousDate || previousDate !== arrivalDateSqlValue) {
        const requesterContext = requesterUsername
          ? ` (requested by ${requesterUsername})`
          : "";
        const message = previousDate
          ? `Arrival date${requesterContext} changed from ${previousDate} to ${arrivalDateSqlValue} by ${req.user.username}.`
          : `Arrival date${requesterContext} set to ${arrivalDateSqlValue} by ${req.user.username}.`;

        notificationsToDispatch.push({
          message,
          type: "arrival_date_change",
          roles: defaultNotificationRoles,
          usernames: requesterAudience,
        });
      }
    }

    if (status) {
      const normalizedStatus = String(status).toLowerCase();
      const previousStatus = (CurrentStatus || "").toLowerCase();

      if (normalizedStatus !== previousStatus) {
        const statusMessage = (() => {
          if (normalizedStatus === "approved") {
            return `Request ${record.ID} was approved by ${req.user.username}.`;
          }

          if (normalizedStatus === "rejected") {
            return `Request ${record.ID} was rejected by ${req.user.username}.`;
          }

          return `Request ${record.ID} status updated to ${status} by ${req.user.username}.`;
        })();

        notificationsToDispatch.push({
          message: statusMessage,
          type: `status_${normalizedStatus || "update"}`,
          roles: defaultNotificationRoles,
          usernames: requesterAudience,
        });
      }
    }

    for (const notification of notificationsToDispatch) {
      try {
        const intent = notification.intent || notification.type;

        await dispatchNotificationEvent(pool, {
          requestId: record.ID,
          message: notification.message,
          type: notification.type,
          usernames: notification.usernames || requesterAudience,
          roles: notification.roles || defaultNotificationRoles,
          excludeUsername: req.user.username,
          push: {
            title: "Import Tracker Update",
            body: notification.message,
            data: {
              intent,
            },
            tag: "request-" + record.ID + "-" + intent,
          },
        });
      } catch (notificationError) {
        console.error(
          "Notification dispatch error:",
          notificationError.message
        );
      }
    }
    res.json(record);
  } catch (err) {
    console.error("Update error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;

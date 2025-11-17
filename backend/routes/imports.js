import express from "express";
import sql from "mssql";
import { randomUUID, createHash } from "crypto";
import multer from "multer";
import * as XLSX from "xlsx";
import { poolPromise } from "../db.js";
import { secondaryPoolPromise } from "../db_WMS.js"; // secondary DB (pallet calculations)
import { docPoolPromise } from "../db_wtrgksvf.js";
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

const normalizeDateForBatch = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  }

  return null;
};

const hashTextToGuid = (value) => {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const deriveBatchIdFromCombination = ({
  importer,
  requestDate,
  arrivalDate,
  fallbackId,
}) => {
  const importerPart = trimString(importer);
  const requestPart = normalizeDateForBatch(requestDate);
  const arrivalPart = normalizeDateForBatch(arrivalDate);

  if (!importerPart || !requestPart || !arrivalPart) {
    return fallbackId ?? randomUUID();
  }

  const compositeKey = [
    importerPart.toLowerCase(),
    requestPart,
    arrivalPart,
  ].join("|");

  return hashTextToGuid(compositeKey);
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

const formatBatchCode = (batchId) => {
  if (!batchId) {
    return null;
  }
  return String(batchId).split("-")[0].toUpperCase();
};

const formatBillName = (record = {}) => {
  const commentLabel = trimString(record.Comment);
  if (commentLabel) {
    return commentLabel;
  }

  const importerLabel = trimString(record.Importer);
  if (importerLabel) {
    return importerLabel;
  }

  const batchCode = formatBatchCode(record.BatchId);
  if (batchCode) {
    return `Batch ${batchCode}`;
  }

  if (record.ID) {
    return `Kërkesa #${record.ID}`;
  }

  return "Porosi importi";
};

const annotateSplitComment = ({
  baseComment,
  documentNumber,
  role,
  relatedBatchId,
}) => {
  const safeComment = sanitizeComment(baseComment);
  const normalizedDocument = trimString(documentNumber);

  if (!normalizedDocument) {
    return safeComment;
  }

  const rolePrefix =
    role === "remaining"
      ? "Ndarje nga dokumenti"
      : "Dorëzuar sipas dokumentit";

  const parts = [`${rolePrefix} ${normalizedDocument}`];
  const batchCode = formatBatchCode(relatedBatchId);
  if (batchCode) {
    parts.push(`batch ${batchCode}`);
  }

  const note = parts.join(" | ");

  if (!safeComment) {
    return note;
  }

  if (safeComment.includes(normalizedDocument)) {
    return safeComment;
  }

  return sanitizeComment(`${safeComment} | ${note}`);
};

const describeStatusInAlbanian = (status) => {
  const normalized = trimString(status)?.toLowerCase();

  switch (normalized) {
    case "approved":
      return "U miratua";
    case "rejected":
      return "U refuzua";
    case "pending":
    case "awaiting_confirmation":
      return "Në pritje të konfirmimit";
    case "confirmed":
      return "U konfirmua";
    case "needs_confirmation":
      return "Kërkon konfirmim";
    default:
      if (!normalized) {
        return null;
      }
      return `Statusi i ri: ${normalized}`;
  }
};

const GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const isValidGuid = (value) =>
  typeof value === "string" && GUID_REGEX.test(value.toLowerCase());

const normalizeGuidInput = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/[{}]/g, "");
  if (!trimmed) {
    return null;
  }
  const compact = trimmed.toLowerCase();
  if (isValidGuid(compact)) {
    return compact;
  }
  if (/^[0-9a-f]{32}$/.test(compact)) {
    const formatted = `${compact.slice(0, 8)}-${compact.slice(
      8,
      12
    )}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(
      20
    )}`;
    return isValidGuid(formatted) ? formatted : null;
  }
  return null;
};

const resolveDocumentArticleCode = (line = {}) => {
  return normalizeArticleCode(
    line.Sifra_Art ??
      line.Sifra_Art_Kup ??
      line.Alt_Sifra ??
      line.Sifra_Artikel ??
      line.SifraArt ??
      line.Artikulli
  );
};

const extractDocumentQuantity = (line = {}) => {
  const candidates = [
    line.Kolic,
    line.Kolic_Ed1,
    line.Kolic_Ed2,
    line.Kolic_Ed3,
    line.Kolic_Ed4,
  ];

  for (const candidate of candidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return 0;
};

const toSqlDateString = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  if (typeof value === "string" && value.trim().length >= 10) {
    return value.trim().slice(0, 10);
  }
  return null;
};

const DOCUMENT_DATE_FIELDS = [
  "Datum_Dosp",
  "DatumDosp",
  "Datum_Dok",
  "DatumDok",
  "Datum_Fiskal",
  "DatumFiskal",
  "Datum_Fature",
  "DatumFature",
  "Datum",
  "Datumi",
  "Data_Dosp",
  "DataDosp",
  "Data_Dok",
  "DataDok",
  "Datum_Dokumentit",
  "DatumDokumentit",
];

const extractDocumentArrivalDate = (line = {}) => {
  for (const field of DOCUMENT_DATE_FIELDS) {
    if (line[field] === undefined || line[field] === null) {
      continue;
    }
    const normalized = toSqlDateString(line[field]);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const findFirstDocumentArrivalDate = (lines = []) => {
  for (const line of lines) {
    const normalized = extractDocumentArrivalDate(line);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

const aggregateImportItemsByArticle = (items = []) => {
  const map = new Map();
  for (const item of items) {
    const articleCode = normalizeArticleCode(item.Article);
    if (!articleCode) continue;

    const entry =
      map.get(articleCode) || {
        boxes: 0,
        pallets: 0,
        template: {
          importer:
            trimString(item.Importer ?? item.Importuesi ?? item.importer) ??
            null,
          requestDateSql: toSqlDateString(item.RequestDate),
          arrivalDateSql: toSqlDateString(item.PlannedArrivalDate),
          comment: sanitizeComment(item.Comment),
        },
      };

    entry.boxes += numberOrNull(item.BoxCount) ?? 0;
    entry.pallets += numberOrNull(item.PalletCount) ?? 0;

    if (!entry.template.importer) {
      entry.template.importer =
        trimString(item.Importer ?? item.Importuesi ?? item.importer) ??
        entry.template.importer;
    }
    if (!entry.template.requestDateSql) {
      entry.template.requestDateSql = toSqlDateString(item.RequestDate);
    }
    if (!entry.template.arrivalDateSql) {
      entry.template.arrivalDateSql = toSqlDateString(item.PlannedArrivalDate);
    }
    if (!entry.template.comment) {
      entry.template.comment = sanitizeComment(item.Comment);
    }

    map.set(articleCode, entry);
  }
  return map;
};

const describeActionDetails = (action, metadata = {}) => {
  switch (action) {
    case "created":
      return "Kërkesë e re - në pritje të konfirmimit";
    case "arrival_change": {
      const previous = metadata.previousDate
        ? formatNotificationDate(metadata.previousDate)
        : null;
      const next = metadata.nextDate
        ? formatNotificationDate(metadata.nextDate)
        : null;

      if (previous && next && previous !== next) {
        return `Data e planifikuar: ${previous} -> ${next}`;
      }
      if (next) {
        return `Data e planifikuar: ${next}`;
      }
      if (previous) {
        return `Data e planifikuar: ${previous}`;
      }
      return "Data e planifikuar u përditësua";
    }
    case "actual_arrival": {
      const previous = metadata.previousDate
        ? formatNotificationDate(metadata.previousDate)
        : null;
      const next = metadata.nextDate
        ? formatNotificationDate(metadata.nextDate)
        : null;

      if (previous && next && previous !== next) {
        return `Mbërritja reale: ${previous} -> ${next}`;
      }
      if (next) {
        return `Mbërritja reale: ${next}`;
      }
      if (previous) {
        return `Mbërritja reale: ${previous}`;
      }
      return "Mbërritja reale u përditësua";
    }
    case "status":
      return describeStatusInAlbanian(metadata.status);
    case "edited":
      return "Detajet u përditësuan dhe kërkohet konfirmim i ri";
    case "deleted":
      return "Kërkesa u anulua nga kërkuesi";
    default:
      return null;
  }
};

const buildNotificationCopy = ({
  action,
  record,
  actor,
  metadata = {},
}) => {
  const billName = formatBillName(record);
  const arrivalReference =
    metadata.arrivalDate ||
    metadata.nextDate ||
    record.ArrivalDate ||
    record.PlannedArrivalDate ||
    record.RequestDate;
  const arrivalLabel = formatNotificationDate(arrivalReference);
  const userLabel =
    trimString(actor) || trimString(record.Requester) || "përdoruesi";
  const actionDetails = describeActionDetails(action, metadata);
  const summary = `${billName} | ${arrivalLabel} | ${userLabel}`;
  const message = actionDetails ? `${summary} - ${actionDetails}.` : summary;
  const pushBody = actionDetails
    ? `${arrivalLabel} | ${userLabel} - ${actionDetails}.`
    : `${arrivalLabel} | ${userLabel}`;

  return {
    message,
    pushTitle: billName,
    pushBody,
  };
};

const recordRequestLog = async ({
  pool,
  transaction,
  requestId,
  batchId,
  username,
  action,
  details,
  snapshot,
}) => {
  try {
    const targetPool = pool ?? (await poolPromise);
    const executor = transaction
      ? new sql.Request(transaction)
      : targetPool.request();

    executor.input("Action", sql.NVarChar(64), action || "unknown");
    executor.input("RequestID", sql.Int, requestId ?? null);
    executor.input("Username", sql.NVarChar(128), username ?? null);
    executor.input("Details", sql.NVarChar(1000), details ?? null);
    executor.input("Snapshot", sql.NVarChar(sql.MAX), snapshot ?? null);

    if (batchId) {
      executor.input("BatchId", sql.UniqueIdentifier, batchId);
    } else {
      executor.input("BatchId", sql.UniqueIdentifier, null);
    }

    await executor.query(`
      INSERT INTO dbo.ImportRequestLogs (RequestID, BatchId, Username, Action, Details, Snapshot)
      VALUES (@RequestID, @BatchId, @Username, @Action, @Details, @Snapshot);
    `);
  } catch (logError) {
    console.error("Request log error:", logError?.message || logError);
  }
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

const calculatePalletization = async (
  pool,
  { article, boxCount, pieceCount = null }
) => {
  const request = pool
    .request()
    .input("Sifra_Art", article)
    .input("OrderBoxes", boxCount ?? null)
    .input("OrderPieces", pieceCount ?? null);

  const result = await request.execute("sp_CalcPalletKPIs_ForOrder");

  const calculationRow = result.recordset?.[0];
  if (!calculationRow) {
    throw new Error("Pallet calculation unavailable.");
  }

  return normalizePalletCalculation(calculationRow);
};

const deriveBoxesFromCalculation = (calculation) => {
  if (!calculation || typeof calculation !== "object") {
    return null;
  }

  const boxesPerPallet = numberOrNull(calculation.boxesPerPallet) ?? 0;
  const fullPallets = numberOrNull(calculation.fullPallets) ?? 0;
  const remainingBoxes = numberOrNull(calculation.remainingBoxes) ?? 0;

  if (boxesPerPallet > 0) {
    return fullPallets * boxesPerPallet + remainingBoxes;
  }

  return remainingBoxes || null;
};

const buildSplitNormalizedItem = ({
  template = {},
  article,
  boxCount,
  arrivalDateSql,
}) => {
  if (!boxCount || boxCount <= 0) {
    return null;
  }

  return {
    article,
    boxCount,
    importer: template.importer ?? null,
    requestDateSql:
      template.requestDateSql || template.arrivalDateSql || arrivalDateSql,
    arrivalDateSql,
    comment: template.comment ?? null,
  };
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

const mapArticles = (records, batchDocuments = null) =>
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

    const rawArrival = mapped.ArrivalDate ?? null;
    const plannedArrival =
      mapped.PlannedArrivalDate ?? rawArrival ?? null;
    if (mapped.PlannedArrivalDate === undefined) {
      mapped.PlannedArrivalDate = plannedArrival;
    }
    if (mapped.ActualArrivalDate === undefined) {
      mapped.ActualArrivalDate = null;
    }
    mapped.ArrivalDate =
      mapped.ActualArrivalDate ?? plannedArrival ?? rawArrival ?? null;

    if (mapped.LastApprovedArrivalDate) {
      mapped.LastApprovedArrivalDate = toSqlDateString(
        mapped.LastApprovedArrivalDate
      );
    }

    if (batchDocuments && record.BatchId) {
      const docKey = String(record.BatchId).toLowerCase();
      if (batchDocuments.has(docKey)) {
        const doc = batchDocuments.get(docKey);
        let payload = null;
        if (doc.payload) {
          payload = doc.payload;
        }

        const splitInfo = payload?.split || {};
        mapped.DocumentReference = {
          number: doc.documentNumber,
          arrivalDate: doc.arrivalDate ?? null,
          summary: payload?.summary ?? null,
          lines: payload?.lines ?? null,
          unmatched: payload?.unmatchedDocumentArticles ?? null,
          generatedAt: payload?.generatedAt ?? null,
          role: splitInfo.role || "delivered",
          relatedBatchId: splitInfo.relatedBatchId || splitInfo.sourceBatchId || null,
        };
      }
    }

    return mapped;
  });

const parseDocumentPayload = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
};

const fetchBatchDocumentMap = async (pool) => {
  try {
    const result = await pool.request().query(`
      IF OBJECT_ID('dbo.ImportBatchDocuments', 'U') IS NULL
        SELECT CAST(NULL AS UNIQUEIDENTIFIER) AS BatchId, NULL AS DocumentNumber, NULL AS Payload, NULL AS ArrivalDate
      ELSE
        SELECT BatchId, DocumentNumber, Payload, ArrivalDate
        FROM dbo.ImportBatchDocuments
    `);

    const map = new Map();
    for (const row of result.recordset || []) {
      if (!row?.BatchId || !row?.DocumentNumber) continue;
      const key = String(row.BatchId).toLowerCase();
      map.set(key, {
        documentNumber: row.DocumentNumber,
        arrivalDate: row.ArrivalDate ?? null,
        payload: parseDocumentPayload(row.Payload),
      });
    }
    return map;
  } catch (error) {
    console.error("Batch document fetch error:", error?.message || error);
    return new Map();
  }
};

const storeBatchDocumentSnapshot = async ({
  pool,
  batchId,
  documentNumber,
  payload,
  arrivalDate,
  username,
}) => {
  if (!pool || !batchId || !documentNumber) {
    return;
  }

  const executor = pool.request();
  executor.input("BatchId", sql.UniqueIdentifier, batchId);
  executor.input("DocumentNumber", sql.NVarChar(50), documentNumber);
  executor.input(
    "Payload",
    sql.NVarChar(sql.MAX),
    typeof payload === "string" ? payload : JSON.stringify(payload)
  );
  executor.input("ArrivalDate", sql.Date, arrivalDate || null);
  executor.input("CreatedBy", sql.NVarChar(128), username || null);

  await executor.query(`
    MERGE dbo.ImportBatchDocuments AS target
    USING (SELECT @BatchId AS BatchId) AS source
    ON target.BatchId = source.BatchId
    WHEN MATCHED THEN
      UPDATE SET
        DocumentNumber = @DocumentNumber,
        Payload = @Payload,
        ArrivalDate = @ArrivalDate,
        CreatedAt = SYSUTCDATETIME(),
        CreatedBy = @CreatedBy
    WHEN NOT MATCHED THEN
      INSERT (BatchId, DocumentNumber, Payload, ArrivalDate, CreatedAt, CreatedBy)
      VALUES (@BatchId, @DocumentNumber, @Payload, @ArrivalDate, SYSUTCDATETIME(), @CreatedBy);
  `);
};

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

const mapWmsOrderResponse = (record) => {
  if (!record) {
    return null;
  }

  const [mapped] = mapWmsOrders([record]);
  return mapped;
};

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
  ["data e planifikuar e arritjes", "plannedArrival"],
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
      const actualArrivalColumn = "ActualArrivalDate";
      const lastApprovedArrivalColumn = "LastApprovedArrivalDate";

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

      const ensureActualArrivalColumn = async () => {
        const hasActualArrival = await columnExists(
          pool,
          importTable,
          actualArrivalColumn
        );
        if (!hasActualArrival) {
          await pool
            .request()
            .query(
              `ALTER TABLE ${importTable} ADD ${actualArrivalColumn} DATETIME NULL;`
            );
        }
      };

      const ensureLastApprovedArrivalColumn = async () => {
        const hasColumn = await columnExists(
          pool,
          importTable,
          lastApprovedArrivalColumn
        );
        if (!hasColumn) {
          await pool
            .request()
            .query(
              `ALTER TABLE ${importTable} ADD ${lastApprovedArrivalColumn} DATETIME NULL;`
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

      const ensureRequestLogTable = async () => {
        await pool.request().query(`
          IF OBJECT_ID('dbo.ImportRequestLogs', 'U') IS NULL
          BEGIN
            CREATE TABLE dbo.ImportRequestLogs (
              ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
              RequestID INT NULL,
              BatchId UNIQUEIDENTIFIER NULL,
              Username NVARCHAR(128) NULL,
              Action NVARCHAR(64) NOT NULL,
              Details NVARCHAR(1000) NULL,
              Snapshot NVARCHAR(MAX) NULL,
              CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ImportRequestLogs_CreatedAt DEFAULT (SYSUTCDATETIME())
            );

            CREATE INDEX IX_ImportRequestLogs_BatchId ON dbo.ImportRequestLogs (BatchId);
            CREATE INDEX IX_ImportRequestLogs_RequestID ON dbo.ImportRequestLogs (RequestID);
          END;
        `);
      };

      const ensureBatchDocumentTable = async () => {
        await pool.request().query(`
          IF OBJECT_ID('dbo.ImportBatchDocuments', 'U') IS NULL
          BEGIN
            CREATE TABLE dbo.ImportBatchDocuments (
              BatchId UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
              DocumentNumber NVARCHAR(50) NOT NULL,
              Payload NVARCHAR(MAX) NULL,
              ArrivalDate DATE NULL,
              CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ImportBatchDocuments_CreatedAt DEFAULT (SYSUTCDATETIME()),
              CreatedBy NVARCHAR(128) NULL
            );
            CREATE INDEX IX_ImportBatchDocuments_DocumentNumber
              ON dbo.ImportBatchDocuments (DocumentNumber);
          END;
        `);
      };

      await ensureBatchColumn();
      await ensureArticleNameColumn();
      await ensureActualArrivalColumn();
      await ensureLastApprovedArrivalColumn();
      await ensureDetailsTable();
      await ensureRequestLogTable();
      await ensureBatchDocumentTable();
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
  transactionOverride,
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
  const transaction =
    transactionOverride ?? new sql.Transaction(pool);
  const ownsTransaction = !transactionOverride;
  const insertedRecords = [];
  const articleNameLookup = await fetchArticleNames(
    secondaryPool,
    normalizedItems.map((item) => item.article)
  );

  if (ownsTransaction) {
    await transaction.begin();
  }

  try {
    for (let index = 0; index < normalizedItems.length; index += 1) {
      const current = normalizedItems[index];
      const fallbackArticleName =
        (current.excelMeta && trimString(current.excelMeta.articleName)) ??
        null;
      const articleName =
        articleNameLookup.get(current.article) ?? fallbackArticleName;

      const importerValue = trimString(
        current.importer ?? current.Importuesi ?? importer
      );
      if (!importerValue) {
        const error = new Error(
          `Importer is required for item ${index + 1}.`
        );
        error.meta = {
          itemIndex: index + 1,
          article: current.article,
        };
        throw error;
      }

      const requestDateValue =
        current.requestDateSql ??
        current.requestDateSqlValue ??
        requestDateSqlValue;
      if (!requestDateValue) {
        const error = new Error(
          `Request date is required for item ${index + 1}.`
        );
        error.meta = {
          itemIndex: index + 1,
          article: current.article,
        };
        throw error;
      }

      const arrivalDateValue =
        current.arrivalDateSql ??
        current.arrivalDateSqlValue ??
        arrivalDateSqlValue;
      if (!arrivalDateValue) {
        const error = new Error(
          `Arrival date is required for item ${index + 1}.`
        );
        error.meta = {
          itemIndex: index + 1,
          article: current.article,
        };
        throw error;
      }

      const resolvedBatchId =
        includeBatchId
          ? current.batchId ??
            deriveBatchIdFromCombination({
              importer: importerValue,
              requestDate: requestDateValue,
              arrivalDate: arrivalDateValue,
              fallbackId: effectiveBatchId,
            })
          : null;

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
        .input("DataKerkeses", requestDateValue)
        .input("DataArritjes", arrivalDateValue)
        .input("Importuesi", importerValue)
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
        request.input("BatchId", resolvedBatchId);
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
                   INSERTED.DataArritjes AS PlannedArrivalDate,
                   INSERTED.ActualArrivalDate,
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
          batchId: resolvedBatchId,
          meta: current.excelMeta,
        });
      }
    }

    if (ownsTransaction) {
      await transaction.commit();
    }
    return insertedRecords;
  } catch (transactionError) {
    if (ownsTransaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
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
    const copy = buildNotificationCopy({
      action: "created",
      record,
      actor: initiatorUsername,
      metadata: {
        arrivalDate:
          record.ArrivalDate || record.PlannedArrivalDate || record.RequestDate,
      },
    });

    try {
      await dispatchNotificationEvent(pool, {
        requestId: record.ID,
        message: copy.message,
        type: "request_created",
        roles: newRequestRoles,
        excludeUsername: initiatorUsername,
        push: {
          title: copy.pushTitle,
          body: copy.pushBody,
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

const parseSqlDateOrFallback = (value, label, fallback) => {
  const parseDate = (raw) => {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed.toISOString().split("T")[0];
  };

  const direct = parseDate(value);
  if (direct) {
    return direct;
  }

  const fallbackDate = parseDate(fallback);
  if (fallbackDate) {
    return fallbackDate;
  }

  throw new Error(
    label || "Invalid date provided."
  );
};

const normalizeRequesterItemsPayload = (items, defaultComment) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one article is required for the import order.");
  }

  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index] || {};
    const trimmedArticle = normalizeArticleCode(
      current.article ?? current.Artikulli ?? current.Article
    );
    if (!trimmedArticle) {
      throw new Error(`Article code for item ${index + 1} is required.`);
    }

    const parsedBoxCount = Number(current.boxCount ?? current.NumriPakove);
    if (!Number.isFinite(parsedBoxCount) || parsedBoxCount <= 0) {
      throw new Error(
        `Box count for item ${index + 1} must be a positive number.`
      );
    }

    normalized.push({
      article: trimmedArticle,
      boxCount: parsedBoxCount,
      palletCountOverride: Number(current.palletCount) || null,
      comment: sanitizeComment(current.comment) ?? defaultComment,
    });
  }

  return normalized;
};

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
      const arrivalFromBody = trimString(req.body.arrivalDate);
      let arrivalDateSqlFallback = null;

      if (arrivalFromBody) {
        const parsed = new Date(arrivalFromBody);
        if (Number.isNaN(parsed.getTime())) {
          return res
            .status(400)
            .json({ message: "Invalid arrival date provided." });
        }
        arrivalDateSqlFallback = parsed.toISOString().split("T")[0];
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

      const normalizedItems = [];
      const uniqueImporters = new Set();
      const uniqueArrivals = new Set();
      let lastImporterValue = importerFromBody ? trimString(importerFromBody) : null;
      let lastArrivalDateSqlValue = arrivalDateSqlFallback ?? null;

      for (let index = 0; index < excelItems.length; index += 1) {
        const item = excelItems[index];
        const importerCandidate = trimString(item.importerCandidate);
        if (importerCandidate) {
          lastImporterValue = importerCandidate;
        }
        const importerValue = importerCandidate ?? lastImporterValue;

        if (!importerValue) {
          return res.status(400).json({
            message: `Unable to determine the importer for row ${
              index + 1
            }. Please fill the importer field or ensure each Excel row has a Furnitori value.`,
          });
        }

        const arrivalSqlFromExcel = toSqlDate(item.plannedArrival);
        if (arrivalSqlFromExcel) {
          lastArrivalDateSqlValue = arrivalSqlFromExcel;
        }
        const arrivalSqlValue =
          arrivalSqlFromExcel ?? lastArrivalDateSqlValue ?? arrivalDateSqlFallback;

        if (!arrivalSqlValue) {
          return res.status(400).json({
            message: `Unable to determine the arrival date for row ${
              index + 1
            }. Please fill the arrival date field or ensure the "Data e planifikuar e arritjes" column is filled for every row.`,
          });
        }

        lastImporterValue = importerValue;
        lastArrivalDateSqlValue = arrivalSqlValue;

        uniqueImporters.add(importerValue);
        uniqueArrivals.add(arrivalSqlValue);

        normalizedItems.push({
          article: item.article,
          boxCount: item.boxCount,
          palletCountOverride: item.palletCountOverride,
          comment: sanitizedDefaultComment,
          excelMeta: item.excelMeta,
          importer: importerValue,
          arrivalDateSql: arrivalSqlValue,
        });
      }

      const importerSummary =
        uniqueImporters.size === 1
          ? [...uniqueImporters][0]
          : importerFromBody ?? null;
      const arrivalSummary =
        uniqueArrivals.size === 1 ? [...uniqueArrivals][0] : null;

      const insertedRecords = await insertImportRequestItems({
        importer: importerFromBody ?? null,
        requestDateSqlValue,
        arrivalDateSqlValue: arrivalDateSqlFallback,
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
      const distinctBatchIds =
        hasBatchId && insertedRecords.length > 0
          ? Array.from(
              new Set(
                insertedRecords
                  .map((item) => item.BatchId)
                  .filter((value) => Boolean(value))
              )
            )
          : [];

      res.json({
        ...(hasBatchId
          ? {
              batchIds: distinctBatchIds,
              ...(distinctBatchIds.length === 1
                ? { batchId: distinctBatchIds[0] }
                : {}),
            }
          : {}),
        items: insertedRecords,
        importer: importerSummary,
        arrivalDate: arrivalSummary,
        distinctImporters: uniqueImporters.size,
        distinctArrivalDates: uniqueArrivals.size,
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

router.get(
  "/mine",
  verifyRole(["requester"]),
  async (req, res) => {
    try {
      const { hasBatchId } = await getImportRequestFeatureState();
      const batchProjection = hasBatchId
        ? ", BatchId"
        : ", CAST(NULL AS UNIQUEIDENTIFIER) AS BatchId";
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("Requester", req.user.username)
        .query(`SELECT ID,
                       DataKerkeses AS RequestDate,
                       DataArritjes AS PlannedArrivalDate,
                       ActualArrivalDate,
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
                WHERE Useri = @Requester
                ORDER BY CreatedAt DESC`);
      const batchDocuments =
        hasBatchId ? await fetchBatchDocumentMap(pool) : null;
      res.json(mapArticles(result.recordset, batchDocuments));
    } catch (err) {
      console.error("Fetch requester imports error:", err.message);
      res.status(500).json({ message: "Server error" });
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
                     DataArritjes AS PlannedArrivalDate,
                     ActualArrivalDate,
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
    const batchDocuments =
      hasBatchId ? await fetchBatchDocumentMap(pool) : null;
    res.json(mapArticles(result.recordset, batchDocuments));
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
                     DataArritjes AS PlannedArrivalDate,
                     ActualArrivalDate,
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
    const batchDocuments =
      hasBatchId ? await fetchBatchDocumentMap(pool) : null;
    res.json(mapArticles(result.recordset, batchDocuments));
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
                         DataArritjes AS PlannedArrivalDate,
                         ActualArrivalDate,
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

      const batchDocuments =
        hasBatchId ? await fetchBatchDocumentMap(pool) : null;

      res.json({
        confirmedImports: mapArticles(
          confirmedResult.recordset,
          batchDocuments
        ),
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
      const result = await pool.request().query(`SELECT NarID,
                     OrderId,
                     OrderTypeCode,
                     OrderNumber,
                     CustomerCode,
                     CustomerName,
                     Importer,
                     Article,
                     ArticleDescription,
                     ArticleCount,
                     BoxCount,
                     PalletCount,
                     OrderDate,
                     ExpectedDate,
                     ArrivalDate,
                     IsRealized,
                     OrderStatus,
                     Description,
                     SourceReference,
                     Comment,
                     ScheduledStart,
                     OriginalOrderNumber,
                     CanProceed,
                     SourceUpdatedAt,
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

router.patch(
  "/:id/requester-arrival",
  verifyRole(["requester"]),
  async (req, res) => {
    const { arrivalDate } = req.body;

    if (!arrivalDate) {
      return res
        .status(400)
        .json({ message: "An arrival date is required to update the request." });
    }

    try {
      const arrivalDateValue = new Date(arrivalDate);
      if (Number.isNaN(arrivalDateValue.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid arrival date provided." });
      }
      const arrivalDateSqlValue = arrivalDateValue.toISOString().split("T")[0];
      const { hasBatchId } = await getImportRequestFeatureState();
      const batchOutput = hasBatchId ? ", INSERTED.BatchId" : "";
      const pool = await poolPromise;
      const existingResult = await pool
        .request()
        .input("ID", req.params.id)
        .input("Requester", req.user.username)
        .query(
          `SELECT ID,
                  Importuesi AS Importer,
                  Artikulli AS Article,
                  ArticleName,
                  Status AS CurrentStatus,
                  DataArritjes AS CurrentArrivalDate,
                  ActualArrivalDate AS CurrentActualArrivalDate
           FROM ImportRequests
           WHERE ID = @ID
             AND Useri = @Requester`
        );

      if (existingResult.recordset.length === 0) {
        return res.status(404).json({ message: "Import request not found." });
      }

      const existing = existingResult.recordset[0];

      if (existing.CurrentActualArrivalDate) {
        return res.status(400).json({
          message:
            "This import already has an actual arrival date and can no longer be updated.",
        });
      }

      const updateResult = await pool
        .request()
        .input("ID", req.params.id)
        .input("Requester", req.user.username)
        .input("ArrivalDate", arrivalDateSqlValue)
        .query(`UPDATE ImportRequests
                SET DataArritjes = @ArrivalDate,
                    Status = 'pending',
                    ConfirmedBy = NULL
                OUTPUT INSERTED.ID,
                       INSERTED.DataKerkeses AS RequestDate,
                       INSERTED.DataArritjes AS PlannedArrivalDate,
                       INSERTED.ActualArrivalDate,
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
                WHERE ID = @ID
                  AND Useri = @Requester`);

      if (updateResult.recordset.length === 0) {
        return res.status(404).json({ message: "Import request not found." });
      }

      const [record] = mapArticles(updateResult.recordset);
      const previousDateLabel = formatNotificationDate(
        existing.CurrentArrivalDate
      );
      const newDateLabel = formatNotificationDate(arrivalDateSqlValue);
      const updateMessage = previousDateLabel
        ? `Requester ${req.user.username} updated the planned arrival for request ${record.ID} from ${previousDateLabel} to ${newDateLabel}. Confirmation is required again.`
        : `Requester ${req.user.username} set the planned arrival for request ${record.ID} to ${newDateLabel}. Confirmation is required again.`;

      try {
        await dispatchNotificationEvent(pool, {
          requestId: record.ID,
          message: updateMessage,
          type: "requester_arrival_update",
          roles: ["admin", "confirmer"],
          excludeUsername: req.user.username,
          push: {
            title: "Arrival date changed",
            body: updateMessage,
            data: { intent: "requester_arrival_update" },
            tag: `request-${record.ID}-requester-arrival`,
          },
        });
      } catch (notificationError) {
        console.error(
          "Requester arrival update notification error:",
          notificationError?.message || notificationError
        );
      }

      res.json(record);
    } catch (error) {
      console.error("Requester arrival update error:", error);
      res.status(500).json({
        message: "Failed to update the arrival date. Please try again.",
      });
    }
  }
);

// ---------- APPROVE/REJECT REQUEST ----------
router.patch("/:id", verifyRole(["confirmer"]), async (req, res) => {
  const { status, arrivalDate, actualArrivalDate } = req.body;

  if (!status && !arrivalDate && !actualArrivalDate) {
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
        `SELECT DataArritjes AS CurrentArrivalDate,
                ActualArrivalDate AS CurrentActualArrivalDate,
                LastApprovedArrivalDate AS LastApprovedArrivalDate,
                Useri AS Requester,
                Status AS CurrentStatus
         FROM ImportRequests
         WHERE ID = @ID`
      );

    if (existingResult.recordset.length === 0) {
      return res.status(404).json({ message: "Import request not found." });
    }

    const {
      CurrentArrivalDate,
      CurrentActualArrivalDate,
      LastApprovedArrivalDate: previousApprovedArrivalDate,
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

    let actualArrivalDateSqlValue;
    if (actualArrivalDate) {
      const actualArrivalDateValue = new Date(actualArrivalDate);
      if (Number.isNaN(actualArrivalDateValue.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid actual arrival date provided." });
      }
      actualArrivalDateSqlValue =
        actualArrivalDateValue.toISOString().split("T")[0];
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

    if (actualArrivalDateSqlValue) {
      updateRequest.input("ActualArrivalDate", actualArrivalDateSqlValue);
      setClauses.push("ActualArrivalDate = @ActualArrivalDate");
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
                   INSERTED.DataArritjes AS PlannedArrivalDate,
                   INSERTED.ActualArrivalDate,
                   INSERTED.LastApprovedArrivalDate,
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
    const normalizedStatus = status
      ? String(status).toLowerCase()
      : null;
    const revertToLastApprovedSql =
      normalizedStatus === "rejected"
        ? toSqlDateString(previousApprovedArrivalDate)
        : null;

    if (normalizedStatus === "approved") {
      const approvedDateSql =
        toSqlDateString(record.PlannedArrivalDate) ||
        arrivalDateSqlValue ||
        toSqlDateString(CurrentArrivalDate);

      await pool
        .request()
        .input("ID", record.ID)
        .input("LastApprovedArrivalDate", approvedDateSql)
        .query(`UPDATE ImportRequests
                SET LastApprovedArrivalDate = @LastApprovedArrivalDate
                WHERE ID = @ID;`);

      record.LastApprovedArrivalDate = approvedDateSql;
    } else if (revertToLastApprovedSql) {
      await pool
        .request()
        .input("ID", record.ID)
        .input("ArrivalDate", revertToLastApprovedSql)
        .query(`UPDATE ImportRequests
                SET DataArritjes = @ArrivalDate
                WHERE ID = @ID;`);

      record.PlannedArrivalDate = revertToLastApprovedSql;
      record.ArrivalDate = revertToLastApprovedSql;
    }

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
        const copy = buildNotificationCopy({
          action: "arrival_change",
          record,
          actor: req.user.username,
          metadata: {
            previousDate,
            nextDate: arrivalDateSqlValue,
          },
        });

        notificationsToDispatch.push({
          message: copy.message,
          type: "arrival_date_change",
          roles: defaultNotificationRoles,
          usernames: requesterAudience,
          pushTitle: copy.pushTitle,
          pushBody: copy.pushBody,
        });
      }
    }
    if (actualArrivalDateSqlValue) {
      const previousActualDate = (() => {
        if (!CurrentActualArrivalDate) return null;
        const parsed = new Date(CurrentActualArrivalDate);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toISOString().split("T")[0];
      })();

      if (
        !previousActualDate ||
        previousActualDate !== actualArrivalDateSqlValue
      ) {
        const copy = buildNotificationCopy({
          action: "actual_arrival",
          record,
          actor: req.user.username,
          metadata: {
            previousDate: previousActualDate,
            nextDate: actualArrivalDateSqlValue,
          },
        });

        notificationsToDispatch.push({
          message: copy.message,
          type: "actual_arrival_date_change",
          roles: defaultNotificationRoles,
          usernames: requesterAudience,
          pushTitle: copy.pushTitle,
          pushBody: copy.pushBody,
        });
      }
    }

    if (status) {
      const previousStatus = (CurrentStatus || "").toLowerCase();

      if (normalizedStatus !== previousStatus) {
        const copy = buildNotificationCopy({
          action: "status",
          record,
          actor: req.user.username,
          metadata: { status: normalizedStatus },
        });

        notificationsToDispatch.push({
          message: copy.message,
          type: `status_${normalizedStatus || "update"}`,
          roles: defaultNotificationRoles,
          usernames: requesterAudience,
          pushTitle: copy.pushTitle,
          pushBody: copy.pushBody,
        });
      }
    }

    if (revertToLastApprovedSql) {
      const revertLabel = formatNotificationDate(
        revertToLastApprovedSql
      );
      const revertMessage = revertLabel
        ? `Ndryshimi i datës u refuzua. Data u kthye në ${revertLabel}.`
        : "Ndryshimi i datës u refuzua dhe u rikthye në datën e fundit të miratuar.";

      notificationsToDispatch.push({
        message: revertMessage,
        type: "arrival_reverted",
        roles: defaultNotificationRoles,
        usernames: requesterAudience,
        pushTitle: "Data u rikthye",
        pushBody: revertMessage,
      });
    }

    for (const notification of notificationsToDispatch) {
      try {
        const intent = notification.intent || notification.type;
        const pushTitle =
          notification.pushTitle || formatBillName(record);
        const pushBody = notification.pushBody || notification.message;

        await dispatchNotificationEvent(pool, {
          requestId: record.ID,
          message: notification.message,
          type: notification.type,
          usernames: notification.usernames || requesterAudience,
          roles: notification.roles || defaultNotificationRoles,
          excludeUsername: req.user.username,
          push: {
            title: pushTitle,
            body: pushBody,
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

router.put("/batch/:batchId", verifyRole(["requester"]), async (req, res) => {
  const normalizedBatchId = normalizeGuidInput(req.params.batchId);
  if (!isValidGuid(normalizedBatchId)) {
    return res.status(400).json({ message: "Batch ID i pavlefshëm." });
  }
  const batchId = normalizedBatchId;

 const { importer, arrivalDate, requestDate, comment, items } = req.body || {};
  const importerValue = trimString(importer);
  if (!importerValue) {
    return res
      .status(400)
      .json({ message: "Duhet të jepni emrin e importuesit." });
  }
  if (!arrivalDate) {
    return res
      .status(400)
      .json({ message: "Data e arritjes është e detyrueshme." });
  }

  let normalizedItems;
  const sanitizedDefaultComment = sanitizeComment(comment);
  try {
    normalizedItems = normalizeRequesterItemsPayload(
      items,
      sanitizedDefaultComment
    );
  } catch (payloadError) {
    return res.status(400).json({ message: payloadError.message });
  }

  const pool = await poolPromise;
  const existingResult = await pool
    .request()
    .input("BatchId", sql.UniqueIdentifier, batchId)
    .query(`SELECT TOP 1 Useri AS Requester,
                    DataKerkeses AS RequestDate,
                    DataArritjes AS PlannedArrivalDate
            FROM dbo.ImportRequests
            WHERE BatchId = @BatchId`);

  if (existingResult.recordset.length === 0) {
    return res.status(404).json({ message: "Porosia nuk u gjet." });
  }

  const owner = trimString(existingResult.recordset[0].Requester)?.toLowerCase();
  if (owner !== trimString(req.user.username)?.toLowerCase()) {
    return res.status(403).json({
      message: "Mund të modifikoni vetëm porositë që keni krijuar vetë.",
    });
  }

  let requestDateSqlValue;
  let arrivalDateSqlValue;
  try {
    requestDateSqlValue = parseSqlDateOrFallback(
      requestDate,
      "Data e kërkesës nuk është e vlefshme.",
      existingResult.recordset[0].RequestDate
    );
    arrivalDateSqlValue = parseSqlDateOrFallback(
      arrivalDate,
      "Data e arritjes nuk është e vlefshme.",
      existingResult.recordset[0].PlannedArrivalDate
    );
  } catch (dateError) {
    return res.status(400).json({ message: dateError.message });
  }

  const transaction = new sql.Transaction(pool);
  let insertedRecords = [];

  try {
    await transaction.begin();

    await new sql.Request(transaction)
      .input("BatchId", sql.UniqueIdentifier, batchId)
      .query(`DELETE FROM dbo.ImportRequests WHERE BatchId = @BatchId;`);

    insertedRecords = await insertImportRequestItems({
      importer: importerValue,
      requestDateSqlValue,
      arrivalDateSqlValue,
      normalizedItems,
      requesterUsername: req.user.username,
      batchId,
      defaultComment: sanitizedDefaultComment,
      transactionOverride: transaction,
    });

    await recordRequestLog({
      transaction,
      batchId,
      username: req.user.username,
      action: "updated",
      details: `Përditësim i ${insertedRecords.length} artikujve nga kërkuesi.`,
      snapshot: JSON.stringify({
        importer: importerValue,
        requestDate: requestDateSqlValue,
        arrivalDate: arrivalDateSqlValue,
        items: normalizedItems,
      }),
    });

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Rollback error:", rollbackError.message);
    }
    console.error("Requester update error:", error);
    return res.status(500).json({
      message:
        "Nuk mund të përditësonim porosinë në këtë moment. Ju lutemi provoni përsëri.",
    });
  }

  if (insertedRecords.length > 0) {
    const primaryRecord = insertedRecords[0];
    const copy = buildNotificationCopy({
      action: "edited",
      record: primaryRecord,
      actor: req.user.username,
      metadata: {
        previousDate: existingResult.recordset[0].PlannedArrivalDate,
        nextDate: arrivalDateSqlValue,
      },
    });

    await dispatchNotificationEvent(pool, {
      requestId: primaryRecord.ID,
      message: copy.message,
      type: "request_updated",
      roles: ["admin", "confirmer"],
      excludeUsername: req.user.username,
      push: {
        title: copy.pushTitle,
        body: copy.pushBody,
        data: { intent: "request_updated" },
        tag: `request-${primaryRecord.ID}-updated`,
      },
    });
  }

  res.json({ items: insertedRecords });
});

router.delete(
  "/batch/:batchId",
  verifyRole(["requester"]),
  async (req, res) => {
    const normalizedBatchId = normalizeGuidInput(req.params.batchId);
    if (!isValidGuid(normalizedBatchId)) {
      return res.status(400).json({ message: "Batch ID i pavlefshëm." });
    }
    const batchId = normalizedBatchId;

    const pool = await poolPromise;
    const existingRecordsResult = await pool
      .request()
      .input("BatchId", sql.UniqueIdentifier, batchId)
      .query(
        `SELECT ID,
                Useri AS Requester,
                Status,
                Importuesi AS Importer,
                Comment,
                DataKerkeses AS RequestDate,
                DataArritjes AS PlannedArrivalDate
         FROM dbo.ImportRequests
         WHERE BatchId = @BatchId`
      );

    if (existingRecordsResult.recordset.length === 0) {
      return res.status(404).json({ message: "Porosia nuk u gjet." });
    }

    const owner = trimString(
      existingRecordsResult.recordset[0].Requester
    )?.toLowerCase();
    if (owner !== trimString(req.user.username)?.toLowerCase()) {
      return res.status(403).json({
        message: "Mund të fshini vetëm porositë që keni krijuar vetë.",
      });
    }

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      await new sql.Request(transaction)
        .input("BatchId", sql.UniqueIdentifier, batchId)
        .query(`DELETE FROM dbo.ImportRequests WHERE BatchId = @BatchId;`);

      await recordRequestLog({
        transaction,
        batchId,
        username: req.user.username,
        action: "deleted",
        details: `Fshirje e ${existingRecordsResult.recordset.length} artikujve para konfirmimit.`,
        snapshot: JSON.stringify(existingRecordsResult.recordset),
      });

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }
      console.error("Requester delete error:", error);
      return res.status(500).json({
        message:
          "Nuk mund të fshinim këtë porosi në këtë moment. Ju lutemi provoni përsëri.",
      });
    }

    const referenceRecord = existingRecordsResult.recordset[0];
    const copy = buildNotificationCopy({
      action: "deleted",
      record: referenceRecord,
      actor: req.user.username,
    });

    try {
      await dispatchNotificationEvent(pool, {
        requestId: referenceRecord.ID,
        message: copy.message,
        type: "request_deleted",
        roles: ["admin", "confirmer"],
        excludeUsername: req.user.username,
        push: {
          title: copy.pushTitle,
          body: copy.pushBody,
          data: { intent: "request_deleted" },
          tag: `request-${referenceRecord.ID}-deleted`,
        },
      });
    } catch (notificationError) {
      console.error(
        "Request delete notification error:",
        notificationError?.message || notificationError
      );
    }

    res.json({ deleted: existingRecordsResult.recordset.length });
  }
);

router.post(
  "/batch/:batchId/separate-bill",
  verifyRole(["requester", "confirmer", "admin"]),
  async (req, res) => {
    const normalizedBatchId = normalizeGuidInput(req.params.batchId);
    if (!isValidGuid(normalizedBatchId)) {
      return res.status(400).json({ message: "Batch ID i pavlefshëm." });
    }

    const { brojDok, arrivalDate } = req.body || {};
    const sifraOe = 201;
    const sifraDok = 132;
    const sifraPrim = null;
    const imaDodatna = null;
    const podrediOpc = "R";

    const brojDokValue =
      typeof brojDok === "string"
        ? brojDok.trim()
        : brojDok === null || brojDok === undefined
        ? null
        : String(brojDok);

    if (!brojDokValue) {
      return res.status(400).json({
        message: "Broj_Dok (numri i dokumentit) është i detyrueshëm.",
      });
    }
    if (!arrivalDate) {
      return res
        .status(400)
        .json({ message: "Data e re e arritjes është e detyrueshme." });
    }

    try {
      const [docPool, pool] = await Promise.all([
        docPoolPromise,
        poolPromise,
      ]);

    const [documentLines, secondaryPool] = await Promise.all([
      (async () => {
        try {
          const documentRequest = docPool
            .request()
            .input("Sifra_oe", sql.Int, Number(sifraOe) || null)
            .input("Sifra_dok", sql.Int, Number(sifraDok) || null)
            .input("Broj_Dok", sql.NVarChar(50), brojDokValue)
            .input("Sifra_Prim", sql.NVarChar(50), sifraPrim || null)
            .input("Imadodatna", sql.NVarChar(50), imaDodatna || null)
            .input("PodrediOpc", sql.NVarChar(5), podrediOpc || null);

          const docResult = await documentRequest.execute(
            "[dbo].[SP_StavkiPoDok]"
          );
          if (
            Array.isArray(docResult.recordsets) &&
            docResult.recordsets.length > 0 &&
            Array.isArray(docResult.recordsets[0])
          ) {
            return docResult.recordsets[0];
          }
          if (docResult.recordset) {
            return docResult.recordset;
          }
          return [];
        } catch (docError) {
          console.error("Document retrieval error:", docError);
          throw docError;
        }
      })(),
      secondaryPoolPromise,
    ]);

    if (!documentLines || documentLines.length === 0) {
      console.warn(
        "SP_StavkiPoDok returned no rows:",
        JSON.stringify({
          sifraOe,
          sifraDok,
          brojDok: brojDokValue,
          sifraPrim,
          imaDodatna,
          podrediOpc,
        })
      );
      return res.status(404).json({
        message:
          "Dokumenti nuk u gjet ose nuk ka rreshta. Ju lutemi verifikoni parametrat.",
        details: { sifraOe, sifraDok, brojDok: brojDokValue },
      });
    }

    const importItemsResult = await pool
      .request()
      .input("BatchId", sql.UniqueIdentifier, normalizedBatchId)
      .query(`SELECT ID,
                     Artikulli AS Article,
                     NumriPakove AS BoxCount,
                     NumriPaletave AS PalletCount,
                     DataArritjes AS PlannedArrivalDate
              FROM dbo.ImportRequests
              WHERE BatchId = @BatchId`);

    const importItems = importItemsResult.recordset || [];
    if (importItems.length === 0) {
      return res.status(404).json({ message: "Porosia nuk u gjet." });
    }
    const importTotals = aggregateImportItemsByArticle(importItems);
    const originalRequestDateSql =
      toSqlDateString(importItems[0]?.RequestDate) || null;
    const originalArrivalDateSql =
      toSqlDateString(importItems[0]?.PlannedArrivalDate) || null;
    const documentArrivalDateSql =
      findFirstDocumentArrivalDate(documentLines);
    const todaySql = toSqlDateString(new Date());

    const documentTotals = new Map();

    const lines = await Promise.all(
      documentLines.map(async (line, index) => {
        const normalizedArticle = resolveDocumentArticleCode(line);
        const documentPieces = extractDocumentQuantity(line);
        let documentBoxes = null;
        let documentPallets = null;
        let conversionError = null;

        if (documentPieces === 0) {
          documentBoxes = 0;
        } else if (normalizedArticle && documentPieces > 0) {
          try {
            const calculation = await calculatePalletization(secondaryPool, {
              article: normalizedArticle,
              boxCount: null,
              pieceCount: Math.max(
                0,
                Math.round(Number(documentPieces) || 0)
              ),
            });
            const derivedBoxes = deriveBoxesFromCalculation(calculation);
            documentBoxes =
              typeof derivedBoxes === "number"
                ? Number(derivedBoxes.toFixed(6))
                : null;
            documentPallets =
              typeof calculation.totalPalletPositions === "number"
                ? Number(calculation.totalPalletPositions.toFixed(6))
                : null;
          } catch (conversionIssue) {
            conversionError =
              conversionIssue?.message ||
              "Nuk mundëm të llogarisim kutitë për këtë artikull.";
          }
        }

        if (normalizedArticle) {
          const totalsEntry =
            documentTotals.get(normalizedArticle) || {
              pieces: 0,
              boxes: 0,
              pallets: 0,
            };
          totalsEntry.pieces += documentPieces;
          if (documentBoxes !== null) {
            totalsEntry.boxes += documentBoxes;
          }
          if (documentPallets !== null) {
            totalsEntry.pallets += documentPallets;
          }
          documentTotals.set(normalizedArticle, totalsEntry);
        }

        const importStats =
          normalizedArticle && importTotals.has(normalizedArticle)
            ? importTotals.get(normalizedArticle)
            : null;
        const importQuantity = importStats?.boxes ?? null;
        const importPallets = importStats?.pallets ?? null;

        const boxesToCompare =
          documentBoxes === null && conversionError
            ? null
            : documentBoxes ?? documentPieces;

        return {
          index: line.RBr ?? index + 1,
          article: line.Sifra_Art ?? null,
          normalizedArticle,
          description:
            line.ImeMat ||
            line.ImeArt ||
            line.ImeArt2 ||
            line.Alt_Ime ||
            line.Alt_Ime2 ||
            null,
          documentPieces,
          documentBoxes,
          documentPallets,
          importQuantity,
          importPallets,
          remainingQuantity:
            importQuantity === null || boxesToCompare === null
              ? null
              : Number((importQuantity - boxesToCompare).toFixed(6)),
          remainingPallets:
            importPallets === null || documentPallets === null
              ? null
              : Number((importPallets - documentPallets).toFixed(6)),
          conversionError,
        };
      })
    );

    const summary = Array.from(importTotals.entries()).map(
      ([articleCode, importStats]) => {
        const docStats = documentTotals.get(articleCode) || {
          boxes: 0,
          pallets: 0,
        };

        return {
          article: articleCode,
          importQuantity: Number(importStats.boxes.toFixed(6)),
          documentQuantity: Number(docStats.boxes.toFixed(6)),
          remainingQuantity: Number(
            (importStats.boxes - docStats.boxes).toFixed(6)
          ),
          importPallets: Number(importStats.pallets.toFixed(6)),
          documentPallets: Number(docStats.pallets.toFixed(6)),
          remainingPallets: Number(
            (importStats.pallets - docStats.pallets).toFixed(6)
          ),
        };
      }
    );

    const unmatchedDocumentArticles = lines
      .filter((line) => line.importQuantity === null)
      .map((line) => line.article || line.normalizedArticle)
      .filter(Boolean);

    let arrivalDateSqlValue;
    try {
      arrivalDateSqlValue = parseSqlDateOrFallback(
        arrivalDate,
        "Data e arritjes nuk është e vlefshme.",
        importItems[0]?.PlannedArrivalDate || new Date()
      );
    } catch (dateError) {
      return res.status(400).json({ message: dateError.message });
    }

    const deliveredItems = [];
    const remainingItems = [];

    for (const [articleCode, importStats] of importTotals.entries()) {
      const docStats = documentTotals.get(articleCode) || {
        boxes: 0,
      };
      const deliveredBoxes = Math.min(importStats.boxes, docStats.boxes);
      const remainingBoxes = Math.max(0, importStats.boxes - docStats.boxes);
      const template = importStats.template || {};

      const deliveredArrivalSql =
        template.arrivalDateSql ||
        originalArrivalDateSql ||
        documentArrivalDateSql ||
        arrivalDateSqlValue ||
        todaySql;
      const deliveredTemplate = {
        ...template,
        arrivalDateSql: deliveredArrivalSql,
      };

      const deliveredItem = buildSplitNormalizedItem({
        template: deliveredTemplate,
        article: articleCode,
        boxCount: deliveredBoxes,
        arrivalDateSql: deliveredArrivalSql,
      });
      if (deliveredItem) {
        deliveredItems.push(deliveredItem);
      }

      const remainingTemplate = {
        ...template,
        requestDateSql: template.requestDateSql || todaySql,
        arrivalDateSql: arrivalDateSqlValue,
        comment: annotateSplitComment({
          baseComment: template.comment,
          documentNumber: brojDokValue,
          role: "remaining",
          relatedBatchId: normalizedBatchId,
        }),
      };

      const remainingItem = buildSplitNormalizedItem({
        template: remainingTemplate,
        article: articleCode,
        boxCount: remainingBoxes,
        arrivalDateSql: arrivalDateSqlValue,
      });
      if (remainingItem) {
        remainingItems.push(remainingItem);
      }
    }

    if (deliveredItems.length === 0) {
      return res.status(400).json({
        message:
          "Dokumenti nuk përputhet me artikujt e importit. Nuk u gjet asgjë për t'u shënuar si e dorëzuar.",
      });
    }

    const importerFallback =
      trimString(importItems[0]?.Importer ?? importItems[0]?.Importuesi) ??
      "Unknown importer";
    const defaultCommentFallback =
      sanitizeComment(importItems[0]?.Comment) ?? null;
    const splitCommentFallback = annotateSplitComment({
      baseComment: defaultCommentFallback,
      documentNumber: brojDokValue,
      role: "remaining",
      relatedBatchId: normalizedBatchId,
    });

    const deliveredRequestDateFallback =
      deliveredItems[0]?.requestDateSql ||
      originalRequestDateSql ||
      todaySql ||
      arrivalDateSqlValue;
    const deliveredArrivalDateFallback =
      deliveredItems[0]?.arrivalDateSql ||
      originalArrivalDateSql ||
      documentArrivalDateSql ||
      todaySql ||
      arrivalDateSqlValue;

    const remainingRequestDateFallback =
      remainingItems[0]?.requestDateSql || todaySql || arrivalDateSqlValue;
    const remainingArrivalDateFallback =
      remainingItems[0]?.arrivalDateSql || arrivalDateSqlValue;

    const transaction = new sql.Transaction(pool);
    let newBatchId = null;
    let deliveredRecords = [];
    let remainingRecords = [];

    try {
      await transaction.begin();

      await new sql.Request(transaction)
        .input("BatchId", sql.UniqueIdentifier, normalizedBatchId)
        .query(`DELETE FROM dbo.ImportRequests WHERE BatchId = @BatchId;`);

      deliveredRecords = await insertImportRequestItems({
        importer: deliveredItems[0]?.importer ?? importerFallback,
        requestDateSqlValue: deliveredRequestDateFallback,
        arrivalDateSqlValue: deliveredArrivalDateFallback,
        normalizedItems: deliveredItems,
        requesterUsername: req.user.username,
        batchId: normalizedBatchId,
        defaultComment: deliveredItems[0]?.comment ?? defaultCommentFallback,
        transactionOverride: transaction,
      });

      if (remainingItems.length > 0) {
        newBatchId = randomUUID();
        remainingRecords = await insertImportRequestItems({
          importer: remainingItems[0]?.importer ?? importerFallback,
          requestDateSqlValue: remainingRequestDateFallback,
          arrivalDateSqlValue: remainingArrivalDateFallback,
          normalizedItems: remainingItems,
          requesterUsername: req.user.username,
          batchId: newBatchId,
          defaultComment:
            remainingItems[0]?.comment ??
            splitCommentFallback ??
            defaultCommentFallback,
          transactionOverride: transaction,
        });
      }

      await transaction.commit();
    } catch (splitError) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Split rollback error:", rollbackError.message);
      }
      throw splitError;
    }

    const actualArrivalDateSql =
      documentArrivalDateSql ||
      deliveredRecords[0]?.ActualArrivalDate ||
      deliveredArrivalDateFallback ||
      originalArrivalDateSql ||
      todaySql;

    await pool
      .request()
      .input("BatchId", sql.UniqueIdentifier, normalizedBatchId)
      .input("ActualArrivalDate", sql.Date, actualArrivalDateSql)
      .input("ConfirmedBy", sql.NVarChar(128), req.user.username)
      .query(`UPDATE dbo.ImportRequests
              SET Status = 'approved',
                  ConfirmedBy = COALESCE(ConfirmedBy, @ConfirmedBy),
                  ActualArrivalDate = @ActualArrivalDate,
                  LastApprovedArrivalDate = DataArritjes
              WHERE BatchId = @BatchId`);

    if (newBatchId) {
      await pool
        .request()
        .input("BatchId", sql.UniqueIdentifier, newBatchId)
        .input("ArrivalDate", sql.Date, arrivalDateSqlValue)
        .query(`UPDATE dbo.ImportRequests
                SET Status = 'pending',
                    ConfirmedBy = NULL,
                    ActualArrivalDate = NULL,
                    DataArritjes = @ArrivalDate
                WHERE BatchId = @BatchId`);
    }

    const basePayload = {
      summary,
      lines,
      unmatchedDocumentArticles,
      generatedAt: new Date().toISOString(),
    };

    const deliveredPayload = {
      ...basePayload,
      split: {
        role: "delivered",
        relatedBatchId: newBatchId || null,
      },
    };

    await storeBatchDocumentSnapshot({
      pool,
      batchId: normalizedBatchId,
      documentNumber: brojDokValue,
      payload: deliveredPayload,
      arrivalDate: documentArrivalDateSql || arrivalDateSqlValue,
      username: req.user.username,
    });

    let remainingPayload = null;

    if (newBatchId) {
      remainingPayload = {
        ...basePayload,
        split: {
          role: "remaining",
          relatedBatchId: normalizedBatchId,
        },
      };

      await storeBatchDocumentSnapshot({
        pool,
        batchId: newBatchId,
        documentNumber: brojDokValue,
        payload: remainingPayload,
        arrivalDate: arrivalDateSqlValue,
        username: req.user.username,
      });
    }

    await recordRequestLog({
      pool,
      batchId: normalizedBatchId,
      username: req.user.username,
      action: "split_document_applied",
      details: `Aplikuar dokumenti ${brojDokValue}. Batch i ri: ${
        newBatchId || "N/A"
      }.`,
      snapshot: JSON.stringify(deliveredPayload),
    });

    if (newBatchId) {
      await recordRequestLog({
        pool,
        batchId: newBatchId,
        username: req.user.username,
        action: "split_document_created",
        details: `Krijuar nga ndarja e batch ${normalizedBatchId} me dokument ${brojDokValue}.`,
        snapshot: JSON.stringify(remainingPayload || basePayload),
      });
    }

    if (newBatchId && remainingRecords.length > 0) {
      await notifyRequestCreation({
        pool,
        records: remainingRecords,
        initiatorUsername: req.user.username,
      });
    }

    res.json({
      batchId: normalizedBatchId,
      newBatchId,
      document: {
        sifraOe: Number(sifraOe) || null,
        sifraDok: Number(sifraDok) || null,
        brojDok: brojDokValue,
        arrivalDate: arrivalDateSqlValue,
        sifraPrim: sifraPrim || null,
        imaDodatna: imaDodatna || null,
        podrediOpc: podrediOpc || null,
      },
      lines,
      summary,
      unmatchedDocumentArticles,
      requestsReset: true,
      arrivalDate: arrivalDateSqlValue,
    });
  } catch (error) {
    console.error("Separate bill lookup error:", error);
    res.status(500).json({
      message:
        "Nuk mundëm të marrim artikujt e dokumentit. Ju lutemi provoni përsëri.",
    });
  }
});

export default router;

import sql from "mssql";
import { poolPromise } from "../db.js";
import { secondaryPoolPromise } from "../db_WMS.js";

const SYNC_INTERVAL_MS = Number(process.env.WMS_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);
const WMS_PROCEDURE_NAME =
  process.env.WMS_ORDERS_PROCEDURE ?? "wms_ZemiNarackiZaOdobruvanje";
const WMS_DOCUMENT_FLAG = process.env.WMS_DOCUMENT_FLAG ?? "D";

let ensureSchemaPromise = null;

export const ensureWmsOrdersSchema = async () => {
  if (!ensureSchemaPromise) {
    ensureSchemaPromise = (async () => {
      const pool = await poolPromise;
      await pool.request().batch(`
        IF OBJECT_ID('dbo.WmsOrders', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.WmsOrders (
            NarID NVARCHAR(50) NOT NULL PRIMARY KEY,
            OrderId BIGINT NULL,
            OrderTypeCode NVARCHAR(10) NULL,
            OrderNumber NVARCHAR(100) NULL,
            CustomerCode NVARCHAR(50) NULL,
            CustomerName NVARCHAR(255) NULL,
            Importer NVARCHAR(255) NULL,
            Article NVARCHAR(255) NULL,
            ArticleDescription NVARCHAR(500) NULL,
            ArticleCount DECIMAL(18, 6) NULL,
            BoxCount DECIMAL(18, 6) NULL,
            PalletCount DECIMAL(18, 6) NULL,
            OrderDate DATETIME NULL,
            ExpectedDate DATETIME NULL,
            ArrivalDate DATETIME NULL,
            IsRealized NVARCHAR(10) NULL,
            OrderStatus NVARCHAR(10) NULL,
            Description NVARCHAR(1000) NULL,
            Comment NVARCHAR(1000) NULL,
            SourceReference NVARCHAR(255) NULL,
            SourceUpdatedAt DATETIME NULL,
            ScheduledStart DATETIME NULL,
            OriginalOrderNumber NVARCHAR(100) NULL,
            CanProceed BIT NULL,
            LastSyncedAt DATETIME NOT NULL DEFAULT (GETDATE())
          );

          CREATE INDEX IX_WmsOrders_ArrivalDate ON dbo.WmsOrders (ArrivalDate);
          CREATE INDEX IX_WmsOrders_ExpectedDate ON dbo.WmsOrders (ExpectedDate);
        END;

        IF COL_LENGTH('dbo.WmsOrders', 'OrderId') IS NULL
          ALTER TABLE dbo.WmsOrders ADD OrderId BIGINT NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'OrderTypeCode') IS NULL
          ALTER TABLE dbo.WmsOrders ADD OrderTypeCode NVARCHAR(10) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'CustomerCode') IS NULL
          ALTER TABLE dbo.WmsOrders ADD CustomerCode NVARCHAR(50) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'CustomerName') IS NULL
          ALTER TABLE dbo.WmsOrders ADD CustomerName NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'Importer') IS NULL
          ALTER TABLE dbo.WmsOrders ADD Importer NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'Importer') IS NOT NULL
          ALTER TABLE dbo.WmsOrders ALTER COLUMN Importer NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'ArticleCount') IS NULL
          ALTER TABLE dbo.WmsOrders ADD ArticleCount DECIMAL(18, 6) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'OrderDate') IS NULL
          ALTER TABLE dbo.WmsOrders ADD OrderDate DATETIME NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'ExpectedDate') IS NULL
          ALTER TABLE dbo.WmsOrders ADD ExpectedDate DATETIME NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'IsRealized') IS NULL
          ALTER TABLE dbo.WmsOrders ADD IsRealized NVARCHAR(10) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'OrderStatus') IS NULL
          ALTER TABLE dbo.WmsOrders ADD OrderStatus NVARCHAR(10) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'Description') IS NULL
          ALTER TABLE dbo.WmsOrders ADD Description NVARCHAR(1000) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'SourceReference') IS NULL
          ALTER TABLE dbo.WmsOrders ADD SourceReference NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'ScheduledStart') IS NULL
          ALTER TABLE dbo.WmsOrders ADD ScheduledStart DATETIME NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'OriginalOrderNumber') IS NULL
          ALTER TABLE dbo.WmsOrders ADD OriginalOrderNumber NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'CanProceed') IS NULL
          ALTER TABLE dbo.WmsOrders ADD CanProceed BIT NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'Article') IS NULL
          ALTER TABLE dbo.WmsOrders ADD Article NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'ArticleDescription') IS NULL
          ALTER TABLE dbo.WmsOrders ADD ArticleDescription NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'Comment') IS NULL
          ALTER TABLE dbo.WmsOrders ADD Comment NVARCHAR(1000) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'SourceUpdatedAt') IS NULL
          ALTER TABLE dbo.WmsOrders ADD SourceUpdatedAt DATETIME NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'ArrivalDate') IS NULL
          ALTER TABLE dbo.WmsOrders ADD ArrivalDate DATETIME NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'BoxCount') IS NULL
          ALTER TABLE dbo.WmsOrders ADD BoxCount DECIMAL(18, 6) NULL;
        IF COL_LENGTH('dbo.WmsOrders', 'PalletCount') IS NULL
          ALTER TABLE dbo.WmsOrders ADD PalletCount DECIMAL(18, 6) NULL;

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes WHERE name = 'IX_WmsOrders_ArrivalDate' AND object_id = OBJECT_ID('dbo.WmsOrders')
        )
          CREATE INDEX IX_WmsOrders_ArrivalDate ON dbo.WmsOrders (ArrivalDate);

        IF NOT EXISTS (
          SELECT 1 FROM sys.indexes WHERE name = 'IX_WmsOrders_ExpectedDate' AND object_id = OBJECT_ID('dbo.WmsOrders')
        )
          CREATE INDEX IX_WmsOrders_ExpectedDate ON dbo.WmsOrders (ExpectedDate);
      `);
    })().catch((error) => {
      ensureSchemaPromise = null;
      throw error;
    });
  }

  return ensureSchemaPromise;
};

const normalizeString = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (typeof maxLength === "number" && maxLength > 0) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
};

const numberOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const NAR_ID_FIELDS = [
  "NarID",
  "NarId",
  "NarackaID",
  "NarudzbaID",
  "OrderId",
  "OrderID",
  "ID",
  "Id",
];

const ORDER_NUMBER_FIELDS = [
  "OrderNumber",
  "NarNr",
  "NarBroj",
  "Broj_Nar",
  "OrderNo",
  "Reference",
  "PurchaseOrder",
  "DocumentNumber",
];

const IMPORTER_FIELDS = [
  "Importer",
  "CustomerName",
  "Customer",
  "ImeKup",
  "SupplierName",
  "Supplier",
  "Client",
];

const CUSTOMER_CODE_FIELDS = ["CustomerCode", "Customer", "Sifra_Kup"];

const ARTICLE_FIELDS = ["Article", "Artikulli", "ArticleCode", "ItemCode", "Sku"];

const ARTICLE_DESCRIPTION_FIELDS = [
  "ArticleDescription",
  "ArticleName",
  "ArtikullPershkrimi",
  "Description",
  "ItemDescription",
];

const ARRIVAL_DATE_FIELDS = [
  "ArrivalDate",
  "ExpectedArrivalDate",
  "ExpectedDate",
  "Arrival_Date",
  "DataArritjes",
  "Dat_Ocek",
];

const ORDER_DATE_FIELDS = ["OrderDate", "Datum_Nar"];

const COMMENT_FIELDS = [
  "Comment",
  "Opis",
  "Notes",
  "Remark",
  "Shenime",
  "Remarks",
];

const BOX_FIELDS = [
  "BoxCount",
  "OrderedBoxes",
  "QuantityBoxes",
  "NumriPakove",
  "Boxes",
  "TotalBoxes",
];

const PALLET_FIELDS = [
  "PalletCount",
  "OrderedPallets",
  "NumriPaletave",
  "Pallets",
  "TotalPallets",
];

const REALIZED_FIELDS = ["IsRealized", "Realiziran"];
const ORDER_STATUS_FIELDS = ["OrderStatus", "Stat_Nar"];
const SOURCE_REFERENCE_FIELDS = ["SourceReference", "Z_KogaDosol"];
const SOURCE_TIMESTAMP_FIELDS = [
  "SourceUpdatedAt",
  "Z_KogaDosol",
  "Poc_Vreme_Zadad",
  "LastModified",
  "LastUpdate",
  "LastUpdated",
  "UpdatedAt",
  "ModifiedDate",
];
const SCHEDULED_START_FIELDS = ["ScheduledStart", "Poc_Vreme_Zadad"];
const ORIGINAL_ORDER_FIELDS = [
  "OriginalOrderNumber",
  "Originalen_Broj_Naracka",
];

const pickString = (record, fields, maxLength) => {
  for (const field of fields) {
    if (record[field] !== null && record[field] !== undefined) {
      return normalizeString(record[field], maxLength);
    }
  }
  return null;
};

const pickNumber = (record, fields) => {
  for (const field of fields) {
    const numeric = numberOrNull(record[field]);
    if (numeric !== null) {
      return numeric;
    }
  }
  return null;
};

const pickDate = (record, fields) => {
  for (const field of fields) {
    const parsed = parseDateOrNull(record[field]);
    if (parsed) {
      return parsed;
    }
  }
  return null;
};

const parseInlineMetrics = (text) => {
  if (!text || typeof text !== "string") {
    return {};
  }
  const metrics = {};
  const pattern = /#([A-Za-z]+)\s*:\s*([0-9]+(?:[.,][0-9]+)?)/g;
  let match = pattern.exec(text);
  while (match) {
    const label = match[1].trim().toLowerCase();
    const numericValue = Number(match[2].replace(",", "."));
    if (Number.isFinite(numericValue)) {
      if (label.startsWith("art")) {
        metrics.articleCount = numericValue;
      } else if (label.startsWith("pal")) {
        metrics.palletCount = numericValue;
      } else if (label.startsWith("box")) {
        metrics.boxCount = numericValue;
      }
    }
    match = pattern.exec(text);
  }
  return metrics;
};

const toBooleanFlag = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "t", "y", "yes", "da"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "f", "n", "no", "ne"].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const normalizeRecord = (record = {}) => {
  const narId = pickString(record, NAR_ID_FIELDS, 50);
  if (!narId) {
    return null;
  }

  const arrivalDate = pickDate(record, ARRIVAL_DATE_FIELDS);
  if (!arrivalDate) {
    return null;
  }

  const importer =
    pickString(record, IMPORTER_FIELDS, 255) ??
    pickString(record, ["CustomerName"], 255);

  const description = pickString(record, COMMENT_FIELDS, 1000);
  const inlineMetrics = parseInlineMetrics(description);

  return {
    narId,
    orderId: numberOrNull(record.NarID ?? record.OrderId ?? record.OrderID),
    orderTypeCode: pickString(record, ["OrderTypeCode", "Sifra_Nar"], 10),
    orderNumber: pickString(record, ORDER_NUMBER_FIELDS, 100),
    customerCode: pickString(record, CUSTOMER_CODE_FIELDS, 50),
    customerName: importer,
    importer,
    article: pickString(record, ARTICLE_FIELDS, 255),
    articleDescription: pickString(record, ARTICLE_DESCRIPTION_FIELDS, 500),
    articleCount: inlineMetrics.articleCount ?? pickNumber(record, ["ArticleCount"]),
    boxCount: inlineMetrics.boxCount ?? pickNumber(record, BOX_FIELDS),
    palletCount: inlineMetrics.palletCount ?? pickNumber(record, PALLET_FIELDS),
    orderDate: pickDate(record, ORDER_DATE_FIELDS),
    expectedDate: arrivalDate,
    arrivalDate,
    isRealized: pickString(record, REALIZED_FIELDS, 10),
    orderStatus: pickString(record, ORDER_STATUS_FIELDS, 10),
    description,
    comment: description,
    sourceReference: pickString(record, SOURCE_REFERENCE_FIELDS, 255),
    sourceUpdatedAt: pickDate(record, SOURCE_TIMESTAMP_FIELDS),
    scheduledStart: pickDate(record, SCHEDULED_START_FIELDS),
    originalOrderNumber: pickString(record, ORIGINAL_ORDER_FIELDS, 100),
    canProceed: toBooleanFlag(record.Moze_Broj ?? record.CanProceed),
  };
};

const isInvalidObjectNameError = (error, objectName) => {
  if (!error) {
    return false;
  }
  const message = String(error.message ?? "");
  if (error.number === 208) {
    if (!objectName) {
      return true;
    }
    return message.toLowerCase().includes(objectName.toLowerCase());
  }
  if (!message.toLowerCase().includes("invalid object name")) {
    return false;
  }
  if (!objectName) {
    return true;
  }
  return message.toLowerCase().includes(objectName.toLowerCase());
};

const fetchStoredProcedureOrders = async (secondaryPool) => {
  const request = secondaryPool.request();
  request.input("Dali_Broj_Dokument", sql.NVarChar(1), WMS_DOCUMENT_FLAG);
  const result = await request.execute(WMS_PROCEDURE_NAME);
  return Array.isArray(result.recordset) ? result.recordset : [];
};

const fetchWmsOrders = async () => {
  const customQuery = (process.env.WMS_ORDERS_QUERY ?? "").trim();
  const secondaryPool = await secondaryPoolPromise;
  let records = [];

  if (customQuery) {
    try {
      const result = await secondaryPool.request().query(customQuery);
      records = Array.isArray(result.recordset) ? result.recordset : [];
    } catch (error) {
      if (isInvalidObjectNameError(error)) {
        console.warn(
          `[WMS SYNC] ${error.message} Falling back to stored procedure ${WMS_PROCEDURE_NAME}.`
        );
        records = await fetchStoredProcedureOrders(secondaryPool);
      } else {
        throw error;
      }
    }
  } else {
    records = await fetchStoredProcedureOrders(secondaryPool);
  }

  const normalized = [];
  for (const record of records) {
    const mapped = normalizeRecord(record);
    if (mapped) {
      normalized.push(mapped);
    }
  }

  return normalized;
};

const upsertOrders = async (orders) => {
  if (orders.length === 0) {
    return;
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (const order of orders) {
      const request = new sql.Request(transaction);
      request.input("NarID", sql.NVarChar(50), order.narId);
      request.input("OrderId", sql.BigInt, order.orderId ?? null);
      request.input("OrderTypeCode", sql.NVarChar(10), order.orderTypeCode);
      request.input("OrderNumber", sql.NVarChar(100), order.orderNumber);
      request.input("CustomerCode", sql.NVarChar(50), order.customerCode);
      request.input("CustomerName", sql.NVarChar(255), order.customerName);
      request.input("Importer", sql.NVarChar(255), order.importer);
      request.input("Article", sql.NVarChar(255), order.article);
      request.input(
        "ArticleDescription",
        sql.NVarChar(500),
        order.articleDescription
      );
      request.input("ArticleCount", sql.Decimal(18, 6), order.articleCount ?? null);
      request.input("BoxCount", sql.Decimal(18, 6), order.boxCount ?? null);
      request.input("PalletCount", sql.Decimal(18, 6), order.palletCount ?? null);
      request.input("OrderDate", sql.DateTime, order.orderDate ?? null);
      request.input("ExpectedDate", sql.DateTime, order.expectedDate ?? null);
      request.input("ArrivalDate", sql.DateTime, order.arrivalDate ?? null);
      request.input("IsRealized", sql.NVarChar(10), order.isRealized);
      request.input("OrderStatus", sql.NVarChar(10), order.orderStatus);
      request.input("Description", sql.NVarChar(1000), order.description);
      request.input("Comment", sql.NVarChar(1000), order.comment);
      request.input("SourceReference", sql.NVarChar(255), order.sourceReference);
      request.input("SourceUpdatedAt", sql.DateTime, order.sourceUpdatedAt ?? null);
      request.input("ScheduledStart", sql.DateTime, order.scheduledStart ?? null);
      request.input(
        "OriginalOrderNumber",
        sql.NVarChar(100),
        order.originalOrderNumber
      );
      request.input("CanProceed", sql.Bit, order.canProceed);

      await request.query(`
        MERGE dbo.WmsOrders AS target
        USING (SELECT @NarID AS NarID) AS source
        ON target.NarID = source.NarID
        WHEN MATCHED THEN
          UPDATE SET
            OrderId = @OrderId,
            OrderTypeCode = @OrderTypeCode,
            OrderNumber = @OrderNumber,
            CustomerCode = @CustomerCode,
            CustomerName = @CustomerName,
            Importer = @Importer,
            Article = @Article,
            ArticleDescription = @ArticleDescription,
            ArticleCount = @ArticleCount,
            BoxCount = @BoxCount,
            PalletCount = @PalletCount,
            OrderDate = @OrderDate,
            ExpectedDate = @ExpectedDate,
            ArrivalDate = @ArrivalDate,
            IsRealized = @IsRealized,
            OrderStatus = @OrderStatus,
            Description = @Description,
            Comment = @Comment,
            SourceReference = @SourceReference,
            SourceUpdatedAt = @SourceUpdatedAt,
            ScheduledStart = @ScheduledStart,
            OriginalOrderNumber = @OriginalOrderNumber,
            CanProceed = @CanProceed,
            LastSyncedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            NarID,
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
            Comment,
            SourceReference,
            SourceUpdatedAt,
            ScheduledStart,
            OriginalOrderNumber,
            CanProceed,
            LastSyncedAt
          )
          VALUES (
            @NarID,
            @OrderId,
            @OrderTypeCode,
            @OrderNumber,
            @CustomerCode,
            @CustomerName,
            @Importer,
            @Article,
            @ArticleDescription,
            @ArticleCount,
            @BoxCount,
            @PalletCount,
            @OrderDate,
            @ExpectedDate,
            @ArrivalDate,
            @IsRealized,
            @OrderStatus,
            @Description,
            @Comment,
            @SourceReference,
            @SourceUpdatedAt,
            @ScheduledStart,
            @OriginalOrderNumber,
            @CanProceed,
            GETDATE()
          );
      `);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const syncOnce = async () => {
  try {
    await ensureWmsOrdersSchema();
    const orders = await fetchWmsOrders();
    if (orders.length === 0) {
      return;
    }
    await upsertOrders(orders);
    console.log(`[WMS SYNC] Synced ${orders.length} WMS orders.`);
  } catch (error) {
    console.error("[WMS SYNC] Failed to synchronize WMS orders:", error.message);
  }
};

let intervalHandle = null;

export const startWmsOrdersSync = () => {
  if (intervalHandle) {
    return intervalHandle;
  }

  syncOnce();
  intervalHandle = setInterval(syncOnce, SYNC_INTERVAL_MS);
  return intervalHandle;
};

export const stopWmsOrdersSync = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

import sql from "mssql";
import { poolPromise } from "../db.js";
import { secondaryPoolPromise } from "../db_WMS.js";

const DEFAULT_WMS_ORDERS_QUERY = `
  SELECT
    NarID,
    NarNr AS OrderNumber,
    SupplierName,
    ExpectedArrivalDate,
    ArticleCode,
    ArticleName,
    OrderedBoxes,
    OrderedPallets,
    Comment,
    LastModified
  FROM dbo.vwCalendarInboundOrders
`;

const SYNC_INTERVAL_MS = Number(process.env.WMS_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);

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

const normalizeRecord = (record = {}) => {
  const narId =
    normalizeString(record.NarID ?? record.NarId ?? record.ID ?? record.Id, 50) ??
    null;
  if (!narId) {
    return null;
  }

  const arrivalDate =
    parseDateOrNull(
      record.ArrivalDate ??
        record.ExpectedArrivalDate ??
        record.DataArritjes ??
        record.ExpectedDate ??
        record.Arrival_Date
    ) ?? null;

  if (!arrivalDate) {
    return null;
  }

  return {
    narId,
    orderNumber:
      normalizeString(
        record.OrderNumber ??
          record.NarNr ??
          record.OrderNo ??
          record.Reference ??
          record.PurchaseOrder,
        100
      ) ?? null,
    importer:
      normalizeString(
        record.Importer ??
          record.SupplierName ??
          record.Supplier ??
          record.Client ??
          record.CustomerName,
        150
      ) ?? null,
    article:
      normalizeString(
        record.Article ??
          record.ArticleCode ??
          record.Artikulli ??
          record.ItemCode ??
          record.Sku,
        255
      ) ?? null,
    articleDescription:
      normalizeString(
        record.ArticleDescription ??
          record.ArticleName ??
          record.ArtikullPershkrimi ??
          record.Description ??
          record.ItemDescription,
        500
      ) ?? null,
    boxCount:
      numberOrNull(
        record.BoxCount ??
          record.OrderedBoxes ??
          record.QuantityBoxes ??
          record.NumriPakove ??
          record.Boxes ??
          record.TotalBoxes
      ),
    palletCount:
      numberOrNull(
        record.PalletCount ??
          record.OrderedPallets ??
          record.NumriPaletave ??
          record.Pallets ??
          record.TotalPallets
      ),
    arrivalDate,
    comment:
      normalizeString(
        record.Comment ??
          record.Notes ??
          record.Remark ??
          record.Shenime ??
          record.Remarks,
        1000
      ) ?? null,
    sourceUpdatedAt:
      parseDateOrNull(
        record.LastModified ??
          record.LastUpdate ??
          record.LastUpdated ??
          record.UpdatedAt ??
          record.ModifiedDate
      ) ?? null,
  };
};

const fetchWmsOrders = async () => {
  const wmsOrdersQuery = (process.env.WMS_ORDERS_QUERY ?? DEFAULT_WMS_ORDERS_QUERY).trim();
  if (!wmsOrdersQuery) {
    console.warn("[WMS SYNC] No query configured for WMS orders. Skipping sync.");
    return [];
  }

  const secondaryPool = await secondaryPoolPromise;
  const result = await secondaryPool.request().query(wmsOrdersQuery);
  const records = Array.isArray(result.recordset) ? result.recordset : [];

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
      request.input("OrderNumber", sql.NVarChar(100), order.orderNumber);
      request.input("Importer", sql.NVarChar(150), order.importer);
      request.input("Article", sql.NVarChar(255), order.article);
      request.input(
        "ArticleDescription",
        sql.NVarChar(500),
        order.articleDescription
      );
      request.input("BoxCount", sql.Decimal(18, 6), order.boxCount);
      request.input("PalletCount", sql.Decimal(18, 6), order.palletCount);
      request.input("ArrivalDate", sql.DateTime, order.arrivalDate ?? null);
      request.input("Comment", sql.NVarChar(1000), order.comment);
      request.input("SourceUpdatedAt", sql.DateTime, order.sourceUpdatedAt ?? null);

      await request.query(`
        MERGE dbo.WmsOrders AS target
        USING (SELECT @NarID AS NarID) AS source
        ON target.NarID = source.NarID
        WHEN MATCHED THEN
          UPDATE SET
            OrderNumber = @OrderNumber,
            Importer = @Importer,
            Article = @Article,
            ArticleDescription = @ArticleDescription,
            BoxCount = @BoxCount,
            PalletCount = @PalletCount,
            ArrivalDate = @ArrivalDate,
            Comment = @Comment,
            SourceUpdatedAt = @SourceUpdatedAt,
            LastSyncedAt = GETDATE()
        WHEN NOT MATCHED THEN
          INSERT (
            NarID,
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
          )
          VALUES (
            @NarID,
            @OrderNumber,
            @Importer,
            @Article,
            @ArticleDescription,
            @BoxCount,
            @PalletCount,
            @ArrivalDate,
            @Comment,
            @SourceUpdatedAt,
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
    const orders = await fetchWmsOrders();
    if (orders.length === 0) {
      return;
    }
    await upsertOrders(orders);
    console.log(`📦 [WMS SYNC] Synced ${orders.length} WMS orders.`);
  } catch (error) {
    console.error("❌ [WMS SYNC] Failed to synchronize WMS orders:", error.message);
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

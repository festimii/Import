import express from "express";
import sql from "mssql";
import { poolPromise } from "../db.js";
import { secondaryPoolPromise } from "../db_WMS.js"; // secondary DB (pallet calculations)
import { verifyRole } from "../middleware/auth.js";
import {
  broadcastPushNotification,
  createNotifications,
} from "../services/notifications.js";

const router = express.Router();

// ---------- CREATE REQUEST (Requester) ----------
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

const WMS_ALLOWED_ORDER_CODE = "53";

const trimString = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseBooleanFlag = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "t", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "f", "no", "n"].includes(normalized)) {
    return false;
  }

  return null;
};

const mapRawWmsOrder = (record = {}) => {
  const orderIdValue = Number(record.NarID);
  const orderTypeValue = trimString(record.Sifra_Nar);

  return {
    orderId: Number.isFinite(orderIdValue) ? orderIdValue : null,
    orderTypeCode: orderTypeValue,
    orderNumber: trimString(record.Broj_Nar),
    customerCode: trimString(record.Sifra_Kup),
    orderDate: parseDateValue(record.Datum_Nar),
    expectedDate: parseDateValue(record.Dat_Ocek),
    customerName: trimString(record.ImeKup),
    isRealized: trimString(record.Realiziran),
    orderStatus: trimString(record.Stat_Nar),
    description: trimString(record.Opis),
    sourceReference: trimString(record.Z_KogaDosol),
    scheduledStart: parseDateValue(record.Poc_Vreme_Zadad),
    originalOrderNumber: trimString(record.Originalen_Broj_Naracka),
    canProceed: parseBooleanFlag(record.Moze_Broj),
  };
};

const mapWmsOrderResponse = (record = {}) => ({
  id: record.ID,
  orderId: record.OrderId,
  orderTypeCode: record.OrderTypeCode,
  orderNumber: record.OrderNumber,
  customerCode: record.CustomerCode,
  orderDate: record.OrderDate ?? null,
  expectedDate: record.ExpectedDate ?? null,
  customerName: record.CustomerName ?? null,
  isRealized: record.IsRealized ?? null,
  orderStatus: record.OrderStatus ?? null,
  description: record.Description ?? null,
  sourceReference: record.SourceReference ?? null,
  scheduledStart: record.ScheduledStart ?? null,
  originalOrderNumber: record.OriginalOrderNumber ?? null,
  canProceed: record.CanProceed ?? null,
  lastSyncedAt: record.LastSyncedAt ?? null,
});

router.post("/", verifyRole(["requester"]), async (req, res) => {
  const { requestDate, arrivalDate, importer, comment, article, boxCount, items } =
    req.body;

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

    const pool = await poolPromise;
    const secondaryPool = await secondaryPoolPromise;
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    const insertedRecords = [];

    try {
      for (let index = 0; index < normalizedItems.length; index += 1) {
        const current = normalizedItems[index];

        let calculation;
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

        const palletCount = Number.isFinite(
          calculation.totalPalletPositions
        )
          ? Math.max(0, Math.round(calculation.totalPalletPositions))
          : 0;

        const request = new sql.Request(transaction)
          .input("DataKerkeses", requestDateSqlValue)
          .input("DataArritjes", arrivalDateSqlValue)
          .input("Importuesi", importer)
          .input("Artikulli", current.article)
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
          .input(
            "WeightFullPalletsKg",
            calculation.weightFullPalletsKg ?? null
          )
          .input(
            "VolumeFullPalletsM3",
            calculation.volumeFullPalletsM3 ?? null
          )
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
          .input("Comment", current.comment)
          .input("Useri", req.user.username);

        const result = await request.query(`INSERT INTO ImportRequests (
                DataKerkeses,
                DataArritjes,
                Importuesi,
                Artikulli,
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
                Comment
              )
              OUTPUT INSERTED.ID,
                     INSERTED.DataKerkeses AS RequestDate,
                     INSERTED.DataArritjes AS ArrivalDate,
                     INSERTED.Importuesi AS Importer,
                     INSERTED.Artikulli AS Article,
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
                     INSERTED.CreatedAt
              VALUES (
                @DataKerkeses,
                @DataArritjes,
                @Importuesi,
                @Artikulli,
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
                @Comment
              )`);
        const [record] = mapArticles(result.recordset);
        insertedRecords.push(record);
      }

      await transaction.commit();
    } catch (transactionError) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Rollback error:", rollbackError.message);
      }

      throw transactionError;
    }

    const responsePayload =
      insertedRecords.length === 1 ? insertedRecords[0] : insertedRecords;

    res.json(responsePayload);
  } catch (err) {
    console.error("Create error:", err);
    if (
      err.message === "Invalid request date provided." ||
      err.message === "Invalid arrival date provided."
    ) {
      return res.status(400).json({ message: err.message });
    }
    if (err.message === "Pallet calculation unavailable." && err.meta?.article) {
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
// ---------- GET PENDING REQUESTS (Confirmer) ----------
router.get("/", verifyRole(["confirmer"]), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     DataArritjes AS ArrivalDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
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
                     CreatedAt
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
      const pool = await poolPromise;
      const result = await pool.request().query(`SELECT ID,
                     DataKerkeses AS RequestDate,
                     DataArritjes AS ArrivalDate,
                     Importuesi AS Importer,
                     Artikulli AS Article,
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
                     CreatedAt
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

      const articleGroupResult = await pool.request()
        .query(`SELECT TOP 50
                       Artikulli AS Article,
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

      const skippedMissingIdentifiers = filteredRecords.length - preparedRecords.length;

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
            .input("ScheduledStart", sql.DateTime2, mapped.scheduledStart ?? null)
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
                   INSERTED.CreatedAt
            WHERE ID = @ID`);
    const [record] = mapArticles(result.recordset);

    const notificationsToDispatch = [];

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
        });
      }
    }

    for (const notification of notificationsToDispatch) {
      try {
        const created = await createNotifications(pool, {
          requestId: record.ID,
          message: notification.message,
          type: notification.type,
          excludeUsername: req.user.username,
        });

        if (created.length > 0) {
          await broadcastPushNotification({
            title: "📦 Import Tracker",
            body: notification.message,
            data: {
              requestId: record.ID,
              type: notification.type,
              createdAt: new Date().toISOString(),
            },
          });
        }
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

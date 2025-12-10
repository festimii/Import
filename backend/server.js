import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.js";
import importRoutes from "./routes/imports.js";
import notificationRoutes from "./routes/notifications.js";
import planogramRoutes from "./routes/planograms.js";
import {
  ensurePlanogramPhotoDirSync,
  getPlanogramPhotoDir,
} from "./services/planograms.js";
import { startPlanogramPhotoSync } from "./services/planogramPhotoSync.js";
import { startWmsOrdersSync } from "./services/wmsOrdersSync.js";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(
  cors({
    origin: "*", // allow all origins
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
ensurePlanogramPhotoDirSync();

const planogramPhotoRoot =
  getPlanogramPhotoDir() || path.join(__dirname, "data", "planogram-photos");

// Expose planogram photos under both /planogram-photos and /api/planogram-photos
// so they load whether callers include the API prefix or not.
app.use("/planogram-photos", express.static(planogramPhotoRoot));
app.use("/api/planogram-photos", express.static(planogramPhotoRoot));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/planograms", planogramRoutes);

// Default route
app.get("/", (req, res) => res.send("✅ Import Tracker API Running"));

startWmsOrdersSync();
startPlanogramPhotoSync();

const PORT = 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

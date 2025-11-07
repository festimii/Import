import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import importRoutes from "./routes/imports.js";
import notificationRoutes from "./routes/notifications.js";
import { startWmsOrdersSync } from "./services/wmsOrdersSync.js";

dotenv.config();
const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/notifications", notificationRoutes);

// Default route
app.get("/", (req, res) => res.send("✅ Import Tracker API Running"));

startWmsOrdersSync();

const PORT = 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

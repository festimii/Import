import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import importRoutes from "./routes/imports.js";
import notificationRoutes from "./routes/notifications.js";
import { startWmsOrdersSync } from "./services/wmsOrdersSync.js";

dotenv.config();
const app = express();

app.use(
  cors({
    origin: "*", // allow all origins
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/imports", importRoutes);
app.use("/api/notifications", notificationRoutes);

// Default route
app.get("/", (req, res) => res.send("✅ Import Tracker API Running"));

startWmsOrdersSync();

const PORT = 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});

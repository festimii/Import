import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const planogramDbConfig = {
  server:
    process.env.PLANOGRAM_DB_SERVER ||
    process.env.DOC_DB_SERVER ||
    process.env.DB_SERVER,
  user:
    process.env.PLANOGRAM_DB_USER || process.env.DOC_DB_USER || process.env.DB_USER,
  password:
    process.env.PLANOGRAM_DB_PASS ||
    process.env.DOC_DB_PASS ||
    process.env.DB_PASS,
  database:
    process.env.PLANOGRAM_DB_NAME || process.env.DOC_DB_NAME || "wtrgksvf",
  port: parseInt(
    process.env.PLANOGRAM_DB_PORT ||
      process.env.DOC_DB_PORT ||
      process.env.DB_PORT ||
      "1433",
    10
  ),
  options: { encrypt: false, trustServerCertificate: true },
};

const planogramPool = new sql.ConnectionPool(planogramDbConfig);

export const planogramPoolPromise = planogramPool
  .connect()
  .then((pool) => {
    console.log("Connected to planogram database");
    return pool;
  })
  .catch((error) => {
    console.error("Failed to connect to planogram database:", error);
    throw error;
  });

import sql from "mssql";
import dotenv from "dotenv";

dotenv.config();

const docDbConfig = {
  server: process.env.DOC_DB_SERVER || process.env.DB_SERVER,
  user: process.env.DOC_DB_USER || process.env.DB_USER,
  password: process.env.DOC_DB_PASS || process.env.DB_PASS,
  database: process.env.DOC_DB_NAME || "wtrgksvf",
  port: parseInt(process.env.DOC_DB_PORT || process.env.DB_PORT || "1433", 10),
  options: { encrypt: false, trustServerCertificate: true },
};

const docPool = new sql.ConnectionPool(docDbConfig);

export const docPoolPromise = docPool
  .connect()
  .then((pool) => {
    console.log("Connected to wtrgksvf database");
    return pool;
  })
  .catch((error) => {
    console.error("Failed to connect to wtrgksvf database:", error);
    throw error;
  });

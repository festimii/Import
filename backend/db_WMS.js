// db_WMS.js  ✅ CORRECT (ESM version)
import sql from "mssql";

const secondaryConfig = {
  user: "festim.beqiri",
  password: "Festimeliza123",
  server: "192.168.100.11",
  database: "WMS_VF",
  options: { encrypt: false, trustServerCertificate: true },
};

const secondaryPool = new sql.ConnectionPool(secondaryConfig);
const secondaryPoolPromise = secondaryPool.connect(); // renamed here ✅

export { sql, secondaryPool, secondaryPoolPromise };

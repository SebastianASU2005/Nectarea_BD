// jobs/cleanAuditLogs.js
const { sequelize } = require("../config/database");
const { Op } = require("sequelize");
const AuditLog = require("../models/audit_log");

async function cleanOldAuditLogs() {
  const retentionDays = 365; // 1 año
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const deletedCount = await AuditLog.destroy({
    where: {
      created_at: { [Op.lt]: cutoffDate },
    },
  });
  console.log(
    `Eliminados ${deletedCount} registros de auditoría anteriores a ${cutoffDate}`,
  );
}

module.exports = cleanOldAuditLogs;

// utils/networkUtils.js

/**
 * @function getIpAddress
 * @description Intenta extraer la dirección IP real del cliente desde el objeto de solicitud (req) de Express.
 * Prioriza los encabezados estándar usados por proxies y balanceadores de carga.
 * @param {object} req - El objeto de solicitud de Express.
 * @returns {string} La dirección IP del cliente o 'unknown' si no se puede determinar.
 */
const getIpAddress = (req) => {
  // 1. Prioriza 'x-forwarded-for'. Este es el encabezado estándar si la app está detrás de un proxy/balanceador.
  // Express asume el último valor si `trust proxy` está habilitado.
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // En caso de múltiples IPs (proxy chain), se toma la primera (la del cliente original).
    // Si no usas `trust proxy` en Express, esto es más seguro.
    const ipList = forwarded.split(",");
    return ipList[0].trim();
  }

  // 2. Otras cabeceras comunes de proxy (menor prioridad)
  if (req.headers["x-client-ip"]) {
    return req.headers["x-client-ip"];
  }

  // 3. Dirección de conexión directa (la más segura si NO hay proxy, o la del proxy si lo hay)
  // Nota: req.socket.remoteAddress o req.connection.remoteAddress
  if (req.ip) {
    // Express normaliza req.ip. Si 'trust proxy' está habilitado, ya será la IP real.
    return req.ip;
  }

  // 4. Último recurso
  return req.connection.remoteAddress || req.socket.remoteAddress || "unknown";
};

module.exports = {
  getIpAddress,
};

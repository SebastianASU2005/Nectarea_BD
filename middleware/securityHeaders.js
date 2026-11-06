// Archivo: middleware/securityHeaders.js
//
// 🔒 HARDENING — Cabeceras de seguridad HTTP (equivalente ligero a helmet, sin dependencias).
// Es una API JSON: no sirve HTML, por lo que la política es estricta.
// NO se define Cross-Origin-Resource-Policy: el front (otro dominio) carga imágenes de /uploads/imagenes.

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=()",
  );
  // /uploads define su propia CSP (los PDF necesitan que el visor del navegador funcione)
  if (!req.path.startsWith("/uploads/")) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
  }
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=15552000");
  }
  next();
}

module.exports = securityHeaders;

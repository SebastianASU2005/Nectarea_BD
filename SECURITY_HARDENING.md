# Hardening de seguridad — Nectarea_BD

Auditoría y endurecimiento del backend **sin alterar la lógica de negocio ni los flujos existentes**
(registro, login, 2FA, KYC, pagos Mercado Pago / PayPal, contratos, cron jobs, etc.).

Todo lo que se cambió se probó levantando la app completa contra un PostgreSQL real, comparando el
comportamiento **antes** (rama `main`) y **después** (rama `hardening`).

---

## 1. Resumen

| Severidad | Hallazgos corregidos |
|-----------|----------------------|
| 🔴 Crítica | 2 |
| 🟠 Alta    | 3 |
| 🟡 Media   | 8 |
| 🔵 Baja    | 7 |

Resultado de las pruebas: **los 9 ataques que funcionaban en `main` quedaron bloqueados** (y las imágenes públicas siguen sirviéndose) y
**40/41 pruebas de flujos legítimos OK** (la única "falla" fue una suposición errónea del propio test;
verificado a mano, ver §6).

---

## 2. Hallazgos corregidos

### 🔴 Críticos

**C1 — Cualquier persona podía crearse una cuenta de ADMINISTRADOR.**
`POST /api/usuarios/` es público y pasaba `req.body` completo al servicio (asignación masiva).
Enviando `{"rol":"admin", ...}` se creaba un admin; tras confirmar el email, `GET /api/usuarios` devolvía 200.
*Reproducido en `main`.*
→ `controllers/usuario.controller.js`: lista blanca de campos; `rol`, `activo`, `confirmado_email` e
`is_2fa_enabled` se fuerzan en el servidor (igual que ya hacía `/api/auth/register`). Se agregó `loginLimiter` a la ruta.

**C2 — DNI, selfies, videos de verificación y contratos firmados eran públicos.**
`app.use("/uploads", express.static(...))` servía **toda** la carpeta sin autenticación
(`/uploads/kyc/<id>/...`, `/uploads/contratos/...`). *Reproducido en `main`.*
→ `middleware/privateUploads.js`: `kyc/` y `contratos/` requieren **URL firmada con vencimiento** o **JWT de admin**.
`/uploads/imagenes` (fotos de proyectos/lotes) sigue siendo público.
→ La API ahora devuelve las URLs `url_*` de esos archivos **ya firmadas** (`...?e=<expira>&s=<firma>`), así
el panel admin sigue mostrando las imágenes sin cambios. Vigencia: 30 min (`UPLOADS_URL_TTL_SECONDS`).
→ Los archivos KYC nuevos se guardan con nombre no adivinable (`<timestamp>-<16 hex aleatorios>`).

### 🟠 Altas

**A1 — Cancelar pagos de otros usuarios sin autenticación.**
`GET /pago/fallo/:id` (la URL de cancelación de PayPal) marcaba la transacción como `fallido`
probando ids consecutivos. *Reproducido en `main`.*
→ La URL de cancelación que se le entrega a PayPal ahora lleva una firma HMAC (`/pago/fallo/:id/:firma`).
Sin firma válida solo se redirige al front y **no** se cancela. Los ids se validan como numéricos.
El flujo legítimo (usuario cancela en PayPal) se probó y sigue funcionando.

**A2 — Las respuestas JSON filtraban `contraseña_hash`, `twofa_secret` y tokens.**
Ej.: `GET /api/usuarios/me` devolvía el hash bcrypt y el secreto 2FA del propio usuario; además
`include: { model: Usuario, as: "usuario" }` sin `attributes` (p. ej. en `pago.service.js`) los incluía en las respuestas de pagos.
→ `utils/jsonSanitizer.js` (`app.set("json replacer")`): elimina `contraseña_hash`, `twofa_secret`,
`reset_password_token` y `confirmacion_token` de **toda** respuesta, en cualquier nivel de anidamiento.
No toca la lógica ni lo guardado en BD.

**A3 — Dependencias con vulnerabilidades conocidas** (21 → 4).
Incluía 1 crítica (`proxy-addr`) y altas en `axios`, `multer`, `sequelize` (SQLi vía JSON cast), `express-rate-limit`,
`body-parser`, `path-to-regexp`, `lodash`, `validator`, etc.
→ `npm audit fix` sin `--force`: solo se actualizó `package-lock.json` (versiones compatibles, `package.json` intacto).
Quedan 4 (ver §5).

### 🟡 Medias

| # | Problema | Corrección |
|---|----------|-----------|
| M1 | `GET /test-email` público (cualquiera podía disparar correos / gastar cuota OAuth). | Ahora requiere admin. |
| M2 | JWT sin algoritmo fijo; token temporal 2FA y token de sesión intercambiables. | `HS256` fijo al firmar/verificar; el token 2FA lleva `purpose:"2fa"` y no sirve como sesión; un token de sesión no sirve como token 2FA. |
| M3 | Reset de contraseña no cerraba sesiones abiertas y no validaba longitud. | Incrementa `token_version` (cierra sesiones) y exige ≥ 8 caracteres (misma regla que `changePassword`). |
| M4 | Login: enumeración de usuarios por tiempo de respuesta y `identificador` sin validar tipo. | Comparación bcrypt señuelo cuando el usuario no existe; solo se aceptan strings (400 si no). |
| M5 | `reenviar_confirmacion` revelaba si un email existe / está confirmado. | Misma respuesta genérica en todos los casos. |
| M6 | CORS aceptaba un único origen (causa del problema con el preview). | Lista blanca: `FRONTEND_URL` + `CORS_ALLOWED_ORIGINS` (coma). Normaliza `/` final. |
| M7 | Subidas validadas solo por `mimetype` (falsificable); KYC aceptaba cualquier `image/*` (SVG) y `video/*`; extensión tomada del mimetype. | Lista blanca de tipos + verificación de firma real del archivo (magic bytes) + extensión fija. |
| M8 | Errores 5xx devolvían `error.message` (puede incluir SQL/estructura interna). | En producción los 5xx devuelven mensaje genérico (los errores de validación de subidas se siguen mostrando). |

### 🔵 Bajas

- Cabeceras de seguridad (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, CSP estricta de API, `Permissions-Policy`, HSTS en producción) y se oculta `X-Powered-By: Express`.
- `/uploads`: `dotfiles: deny`, sin índice, CSP anti contenido activo (los PDF quedan excluidos para que el visor funcione).
- `LocalStorageProvider`: la validación de ruta usaba `startsWith("…/uploads")` (pasaría `uploads_otro/`); ahora exige el separador.
- Webhook de Mercado Pago: comparación de firma en tiempo constante y ya no se registran los hashes esperados.
- `Scripts/seedAdmin.js`: en producción exige `ADMIN_PASSWORD` (≥ 12 caracteres); antes había una contraseña por defecto pública en el repo.
- El correo de prueba que se enviaba a un Gmail fijo en **cada arranque/deploy** ahora solo se envía si `SEND_STARTUP_TEST_EMAIL=true` en producción.
- Se quitó del repo `uploads/…SistemaAcademico…pdf` (estaba versionado y se servía públicamente) y se reforzó `.gitignore` (`.env.*`, `*.pem`, `*.key`, `uploads/**`).

---

## 3. Acciones que tenés que hacer vos

1. **Aplicar los cambios** (ver §7) y esperar el redeploy en Railway.
2. **Revisá el log de arranque.** Si ves `⚠️ JWT_SECRET tiene menos de 32 caracteres`, generá uno largo y aleatorio
   (`openssl rand -hex 48`) y reemplazá la variable (cierra todas las sesiones activas, es normal).
3. Variables en Railway (todas **opcionales**; sin ellas todo sigue funcionando):

   | Variable | Para qué |
   |----------|----------|
   | `CORS_ALLOWED_ORIGINS` | Orígenes extra separados por coma (p. ej. dominio definitivo + preview). **No** uses `FRONTEND_URL` con varios valores: también arma los links de los emails. |
   | `UPLOADS_URL_TTL_SECONDS` | Vigencia de URLs de archivos privados (default `1800`). |
   | `URL_SIGNING_SECRET` | Clave de las firmas (si no existe se deriva de `JWT_SECRET`). |
   | `SEND_STARTUP_TEST_EMAIL` | `true` para conservar el correo de prueba en cada arranque. |
   | `ADMIN_PASSWORD` | Obligatoria (≥ 12) si corrés `seedAdmin` en producción. |

4. Cuando tengas el dominio definitivo: cambiá `FRONTEND_URL` y `PAYMENT_RETURN_BASE_URL`, y agregá el dominio a `CORS_ALLOWED_ORIGINS` si querés mantener también el preview.

---

## 4. Qué conviene verificar en el front después del deploy

1. **Panel admin → revisión de KYC:** las fotos/video deben seguir viéndose. Funciona si el front usa la URL tal como la devuelve
   la API (`.../uploads/<url>`); si en algún lugar la reconstruye o la pasa por `encodeURIComponent`, hay que ajustarlo.
2. **Contratos:** la descarga por `/api/contratos/descargar/:id` no cambia. Un enlace directo a `/uploads/contratos/...` solo
   funciona con la URL firmada que ahora trae `url_archivo` en las respuestas.
3. **Pago con PayPal:** probar un pago completo y uno cancelado.
4. **"Reenviar confirmación":** ahora responde siempre con el mensaje genérico de éxito.
5. **Restablecer contraseña:** el front debería exigir ≥ 8 caracteres (el servidor ya lo exige).

---

## 5. Pendientes recomendados (NO aplicados a propósito)

Los dejé afuera porque implican migrar datos, decisiones de producto o pueden afectar flujos que hoy funcionan.

| Prioridad | Tema | Detalle |
|-----------|------|---------|
| Alta | **Cifrar `twofa_secret` en la BD** y **guardar hasheados** los tokens de reset/confirmación | Hoy están en texto plano: si se filtra la BD, se pueden clonar los 2FA. Requiere migración con compatibilidad hacia atrás. |
| Alta | **`sync({ alter: true })` en cada arranque de producción** (`app.js`) | Puede alterar o eliminar columnas sin control. Pasar a migraciones (`sequelize-cli`/umzug). |
| Alta | **Documentos KYC en disco local** | Idealmente almacenamiento privado cifrado (S3/R2 con URLs prefirmadas). `StorageProvider` ya permite cambiar la implementación. |
| Media | Cambiar el **email** desde `PUT /api/usuarios/me` no pide contraseña/2FA ni reconfirma | Con una sesión robada permite tomar la cuenta vía "olvidé mi contraseña". |
| Media | `reenviar_confirmacion` y `reset-password` **reactivan cuentas desactivadas por un admin** | Anula el bloqueo/baja manual. Decisión de negocio; conviene distinguir baja voluntaria de sanción. |
| Media | Rate limit: `getIp()` prioriza `X-Real-IP` | Confirmar que Railway lo sobrescribe; si no, es falsificable. Más seguro: usar solo `req.ip` (ya hay `trust proxy: 1`). |
| Media | Conexión a la BD con `rejectUnauthorized: false` | Usar la URL **interna** de Railway (`*.railway.internal`) o validar el certificado. |
| Media | Dependencias restantes (4): `nodemailer` (requiere salto de versión mayor), `uuid` vía `sequelize`/`mercadopago` | Planificar actualización con pruebas de envío de emails y pagos. |
| Baja | TOTP sin protección contra reutilización del mismo código ni bloqueo por usuario | Agregar contador de intentos por cuenta y códigos de respaldo. |
| Baja | Webhook de Mercado Pago sin tolerancia de timestamp | Confirmar idempotencia; rechazar `ts` muy antiguo. |
| Baja | Repositorio: `FrontEndIntegration.md`, `BackupDocumentacion.txt` y la colección Postman describen toda la API | Si el repo es **público**, considerar hacerlo privado o sacar esos archivos. La colección contiene un JWT (ya vencido). No encontré credenciales reales en el historial de git. |

**Bug funcional detectado (no de seguridad):** varios controladores usan `req.user.isAdmin` / `req.user.role`, que no existen
(el modelo usa `rol`). Falla "cerrado": los admins no pueden ver/descargar contratos ajenos (`contratoGeneral.controller`, `contrato.controller`).
No lo modifiqué porque cambiaría permisos.

**Alcance:** auditoría centrada en autenticación/autorización, exposición de datos, subida y servicio de archivos, pagos/webhooks,
configuración y dependencias. Hice **muestreo** de IDOR (contratos, adhesión, pagos, resúmenes de cuenta: correctos). No revisé a
fondo la lógica financiera (inversiones, pujas, cuotas), las plantillas HTML de los emails, ni los cron jobs.

---

## 6. Pruebas realizadas

Entorno: app completa + PostgreSQL 16 local. Mismos ataques contra `main` y contra `hardening`.

| Ataque | `main` | `hardening` |
|--------|:------:|:-----------:|
| Crear admin vía `POST /api/usuarios` y acceder a rutas admin | ❌ posible | ✅ bloqueado (cliente, 403) |
| Descargar foto de DNI sin sesión | ❌ 200 | ✅ 401 |
| Descargar contrato sin sesión | ❌ 200 | ✅ 401 |
| Imágenes públicas de proyectos | 200 | ✅ 200 (sin cambios) |
| Cancelar transacción ajena con `/pago/fallo/:id` | ❌ cancelada | ✅ sigue pendiente |
| `/test-email` sin autenticación | ❌ ejecuta | ✅ 401 |
| `/api/usuarios/me` devuelve hash / secreto 2FA | ❌ sí | ✅ no |
| `X-Powered-By`, `nosniff` | ❌ | ✅ |

Flujos legítimos verificados en `hardening` (40/41): registro, confirmación de email, login (OK / clave mala / usuario inexistente),
perfil y edición, **login con 2FA completo (TOTP real)**, token 2FA que no sirve como sesión, JWT `alg:none`/HS512 rechazados,
forgot/reset (con cierre de sesiones), CORS (preview, origen extra con `/` final, origen no listado, preflight), URL firmada válida /
vencida / de otro archivo / path traversal, acceso admin vs. cliente a archivos privados, panel `GET /api/kyc/pending` con URLs firmadas
que descargan, subida KYC con contenido falso y SVG rechazados, **cancelación legítima de PayPal con firma**, retornos `exito`/`pendiente`,
JSON malformado → 400. Modo `NODE_ENV=production`: HSTS, sin `localhost` en CORS, sin correo de arranque.

La única prueba marcada como fallida esperaba ver URLs de archivos en `GET /api/kyc/status`; ese endpoint **nunca** las devolvió
(el servicio las excluye), así que la expectativa del test era incorrecta. Las URLs firmadas se comprobaron en el listado de admin (`/api/kyc/pending`).

---

## 7. Archivos modificados

Nuevos: `middleware/privateUploads.js`, `middleware/securityHeaders.js`, `utils/signedUrl.js`, `utils/jsonSanitizer.js`, `SECURITY_HARDENING.md`.
Modificados: `app.js`, `config/paymentUrls.js`, `controllers/{auth,usuario,pagoMercado,redireccion}.controller.js`,
`middleware/{auth.middleware,imageUpload.middleware}.js`, `routes/{usuario,redireccion}.routes.js`,
`services/jwt.service.js`, `services/storage/LocalStorageProvider.js`, `services/verificacionIdentidad.service.js`,
`Scripts/seedAdmin.js`, `.gitignore`, `package-lock.json`. Eliminado: `uploads/1757682567049-SistemaAcademico-Ver1-Resoluc.pdf`.

No hay migraciones de base de datos ni nuevas dependencias.

**Cómo aplicarlo**

```bash
git checkout -b hardening
git apply --index nectarea_hardening.patch     # o copiar los archivos del .zip respetando las rutas
git commit -m "Security hardening"
git push origin hardening                      # probar en un entorno antes de mergear a main
```

Para volver atrás en cualquier momento alcanza con revertir ese commit.

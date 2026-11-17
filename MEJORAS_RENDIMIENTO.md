# Mejoras de rendimiento y estabilidad — Backend Crowdfunding

Paquete con **solo los archivos nuevos o modificados**, en sus rutas originales. Copia y reemplaza sobre tu proyecto.
La lógica de negocio no cambia: los cambios son de infraestructura, consultas, concurrencia y robustez.
Todo lo medido se probó contra tu backend real con PostgreSQL 16 y un dataset de 30 000 usuarios, 40 000 suscripciones,
400 000 pagos, 150 000 transacciones y 300 000 audit logs.

> ⚠️ Mediciones hechas en un sandbox de **1 CPU** compartido entre app, Postgres y generador de carga. Los valores
> absolutos serán mejores en Railway; lo comparable es la relación antes/después.

---

## 1. Pasos de despliegue (en este orden)

1. **Backup** de la base de datos.
2. `npm install` (agrega `compression` y `bcrypt` nativo; este último es *optionalDependency*: si no compila en el
   servidor, la app usa `bcryptjs` como antes y avisa en el log). Sube también `package-lock.json`.
3. **Índices y limpieza** (idempotente, `CREATE INDEX CONCURRENTLY`, no bloquea lecturas ni escrituras; además elimina UNIQUE duplicados y deja el sobreviviente con el nombre canónico que esperan los modelos):
   ```bash
   node Scripts/performanceIndexes.js --dedupe --dry-run   # solo muestra qué haría
   node Scripts/performanceIndexes.js --dedupe             # lo ejecuta
   ```
   (equivalente a `npx sequelize-cli db:migrate` con `migrations/20261111120000-add-performance-indexes.js`).
4. Desplegar el código. Con el esquema ya migrado se recomienda además `DB_SYNC_ALTER=false` (ver §4).
5. Verificar: `GET /health` → `{"status":"ok"}` y `GET /health/ready` → `{"status":"ready"}`.
   Configura el healthcheck de Railway sobre `/health`.

### ⚠️ Antes de desplegar: revisa si ya perdiste datos (hallazgo crítico)
Ejecuta en tu BD de producción:
```sql
SELECT count(id_proyecto)         AS puja_con_proyecto,      count(*) AS pujas       FROM puja;
SELECT count(id_suscripcion)      AS inv_con_suscripcion,    count(*) AS inversiones FROM inversion;
SELECT count(id_creador_proyecto) AS proy_con_creador,       count(*) AS proyectos   FROM proyecto;
```
Si los primeros números son mucho menores que los totales, esos datos se han ido borrando con los reinicios (no puedo saber el estado
de tu producción; esto solo lo confirma tu BD). Lo único **derivable** es `puja.id_proyecto`, desde el lote:
```sql
UPDATE puja p SET id_proyecto = l.id_proyecto FROM lote l WHERE l.id = p.id_lote AND p.id_proyecto IS NULL;
```
`inversion.id_suscripcion` y `proyecto.id_creador_proyecto` no se pueden reconstruir con certeza desde otras tablas; revisa si tienes
una copia anterior o si `audit_log` registró la creación (usuario que creó el proyecto). Ojo: `mis-proyectos` y cualquier lógica
que use esas columnas ha estado leyendo NULL tras cada deploy.

**Rollback:** cada comportamiento nuevo tiene un flag (§4). Los índices se quitan con el `down` de la migración.

---

## 2. Resultados medidos (original vs modificado, ambos con estadísticas de Postgres sanas)

| Escenario | Original | Modificado |
|---|---|---|
| Mix de cliente autenticado, 100 conexiones | 78 req/s · p99 1.95 s | **232 req/s** · p99 0.60 s |
| Mix de cliente autenticado, 300 conexiones | 85 req/s · p99 5.0 s | **244 req/s** · p99 2.6 s |
| Catálogo público liviano | 99 req/s · p99 4.9 s | **2 755 req/s** · p99 0.14 s |
| Catálogo público pesado (8.5 MB) | 0.8 req/s · p50 6.7 s | **61 req/s** · p50 0.28 s |
| Mix realista (70 % cliente, 20 % público, 10 % catálogo pesado) | 2.8 req/s · p99 19 s | **192 req/s** · p99 1.7 s |
| Consultas SQL por request (mix cliente) | 3.25 | **1.99** |
| 40 pujas simultáneas sobre el mismo lote | 36–40 timeouts de 40 | **0 timeouts** (probado hasta 200) |
| Tráfico normal mientras 40 usuarios inician sesión | 7.7 req/s · p50 3.2 s | **203 req/s** · p50 98 ms |
| Transacción abierta por el cron mensual (1 599 suscripciones) | 203 s | **6.4 s** (mismos datos finales) |
| Arranque con datos (`DB_SYNC_ALTER=false`) | 3.6 s | **1.0 s** |
| Respuesta del catálogo público con gzip | 8.5 MB | **≈ 260 KB** |

Resistencia: **soak de 4 min** (50 605 requests, 212 req/s sostenidos) con 0 errores, 0 timeouts y memoria plana (~305–323 MB).
**Spike** de 500 y 1 000 conexiones simultáneas: sin errores ni timeouts, el throughput se mantiene (~174 req/s) y la
latencia se encola (p50 2.4 s / 6.3 s); recuperación inmediata (p50 ≈ 220 ms).

---

## 3. Qué se encontró y qué se cambió

### Críticos
| Problema | Causa | Solución |
|---|---|---|
| **🚨 PÉRDIDA DE DATOS en cada reinicio/deploy** | En la Fase 1 del sync (`alter: true` *antes* de cargar las asociaciones) las columnas `inversion.id_suscripcion`, `puja.id_proyecto` y `proyecto.id_creador_proyecto` existen solo vía asociación, no como atributos del modelo. Sequelize las veía como "sobrantes" y ejecutaba `DROP COLUMN`; la Fase 2 las recreaba **vacías**. Reproducido con tu código original: un solo arranque pasó `puja.id_proyecto` de 79 983 a **0** e `inversion.id_suscripcion` de 40 000 a **0**. | La Fase 1 solo crea tablas faltantes (`sync()` sin `alter`); el `alter` se aplica en la Fase 2 con las asociaciones cargadas. Verificado: 0 `DROP COLUMN` y datos intactos tras 3 arranques. |
| **Deadlock del pool en `POST /api/pujas`** | La transacción retenía 1 conexión y la validación de contratos pedía una 2ª sin la transacción. Con el pool en 10, bastaban 10 pujas simultáneas para bloquear todo 30 s. | `checkAllSubscriptionsHaveContract(…, { transaction })` (y en 1 consulta en vez de N). Idem `findHighestBidForLote` en `endAuction`. |
| **Condición de carrera en pujas del mismo lote** | `Lote.findByPk` sin bloqueo: dos pujas simultáneas validaban contra la misma "puja más alta". | `lock: t.LOCK.UPDATE` sobre el lote (serializa solo ese lote; lotes distintos siguen en paralelo). |
| **Cada reinicio borra las estadísticas del planificador** | `sync({ alter: true })` ejecuta `ALTER COLUMN … TYPE` y Postgres descarta las estadísticas (120 → 12 columnas). El planificador queda a ciegas hasta el próximo autoanalyze (puede tardar días): una consulta pasó de 0.8 ms a 35 ms. | `ANALYZE` en segundo plano al terminar el sync + flag `DB_SYNC_ALTER=false`. |
| **Listados sin paginación** | `/transacciones` = 128 MB / 19.7 s; `/pujas/activas` = 87 MB / 7.8 s; catálogo público = 8.5 MB por visita. | Paginación **opt-in** (`?limit=&page=`) + gzip + micro-caché pública. |
| **Faltan índices en FKs** | `pago` leyó 44 M de filas por seq scan en una prueba corta. | 35 índices (`Scripts/performanceIndexes.js`). |
| **`bcryptjs` bloquea el event loop** | JS puro en el hilo principal: 20 logins congelan toda la API 1.28 s. | `bcrypt` nativo con fallback a `bcryptjs` (hashes 100 % compatibles). |
| **UNIQUE duplicados en cada arranque** | `unique: true` + `alter` creaba un constraint nuevo por reinicio (`pagos_mercado`, `verificacion_identidad`). | Modelos corregidos (índice único con nombre fijo) + limpieza `--dedupe`. |
| **Cron mensual: una sola transacción de horas** | Un único `transaction` con envío de emails SMTP adentro: conexión y locks retenidos tanto como tarden N correos; un fallo final deshacía pagos pero los correos ya habían salido. | Los correos se envían **después del COMMIT**, con una sola consulta de usuarios. Resultado en BD idéntico (misma firma MD5 de los pagos creados). |

### Altos / medios
- **Rate limiter** escribía en Postgres en **cada request**: ahora en memoria por defecto (mismos límites: 100/min por IP y 300/min por usuario).
- **`authenticate`** hacía un SELECT por request (y `authorizeAdmin` repetía otro): caché de 5 s, *single-flight* e invalidación inmediata por hooks de Sequelize.
- **Pool** fijo en 10 → configurable (default 20), con `statement_timeout` e `idle_in_transaction_session_timeout` para que una consulta o transacción colgada no retenga una conexión indefinidamente.
- **Registro**: el email de confirmación ya no se espera (el error ya se capturaba y no afectaba la respuesta).
- **Proceso**: `unhandledRejection` se registra en vez de tumbar la API (Node 22 la cierra por defecto); **cierre ordenado** con SIGTERM (los requests en curso terminan); `keepAliveTimeout` de 65 s (evita 502 esporádicos tras el proxy de Railway); `Cache-Control` de 7 días para `/uploads/imagenes` (los privados KYC/contratos no se tocan).
- **Health checks**: `/health`, `/health/ready` y `/health/metrics` (este último desactivado salvo que definas `HEALTH_METRICS_TOKEN`).

### Compatibilidad con el frontend
No hay cambios de contrato. Sin `?limit=` todos los listados devuelven exactamente lo mismo que antes. Con `?limit=50&page=2`
(o `&offset=`) devuelven un array de 50 filas (máximo 200, configurable). Si recibes exactamente `limit` elementos, pide la
página siguiente. Los GET públicos de proyectos/lotes aceptan `If-None-Match` y responden `304`.

---

## 4. Variables de entorno nuevas (todas opcionales)

| Variable | Default | Efecto |
|---|---|---|
| `DB_POOL_MAX` / `DB_POOL_MIN` | `20` / `2` | Tamaño del pool. Regla: instancias × `DB_POOL_MAX` < `max_connections` de Postgres. |
| `DB_POOL_ACQUIRE_MS` / `DB_POOL_IDLE_MS` | `30000` / `10000` | Espera máxima por una conexión / vida de conexiones ociosas. |
| `DB_STATEMENT_TIMEOUT_MS` | `120000` | Corta consultas largas (`0` = desactivado). |
| `DB_IDLE_IN_TX_TIMEOUT_MS` | `300000` | Corta transacciones olvidadas (`0` = desactivado). |
| `DB_SYNC_ALTER` | (activo) | `false` → `sync()` sin `alter`. **Recomendado en producción** con el esquema migrado. |
| `DB_ANALYZE_AFTER_SYNC` | (activo) | `false` desactiva el `ANALYZE` post-sync (solo aplica si `alter` está activo). |
| `RATE_LIMIT_STORE` | `memory` | `postgres` restaura el comportamiento anterior (contadores compartidos entre instancias, 1 UPSERT por request). |
| `AUTH_USER_CACHE_TTL_MS` | `5000` | Caché de usuarios en `authenticate` (`0` = desactivada). |
| `PUBLIC_CACHE_TTL_MS` / `PUBLIC_CACHE_MAX_MB` | `10000` / `64` | Micro-caché de GET públicos (`0` = desactivada). |
| `PAGINATION_MAX_LIMIT` | `200` | Máximo de `?limit=`. |
| `ENABLE_CRON` / `ENABLE_HTTP` | (activos) | `ENABLE_CRON=false` en la API y un 2º servicio con `ENABLE_HTTP=false` = worker de cron aparte. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Espera máxima de requests en curso al recibir SIGTERM. |
| `EXIT_ON_UNHANDLED_REJECTION` | (no) | `true` vuelve al comportamiento de Node. |
| `HEALTH_METRICS_TOKEN` | (sin definir) | Habilita `/health/metrics` (header `x-health-token`): pool, event loop, memoria, caché. |

### Cambios de comportamiento a conocer
- **Varias instancias:** el rate limiter en memoria cuenta por instancia (usa `RATE_LIMIT_STORE=postgres` si necesitas contadores compartidos), y un cierre de sesión puede tardar hasta 5 s en verse en otra instancia.
- **Micro-caché pública:** los cambios hechos por tareas programadas o por otra instancia pueden verse con hasta 10 s de retraso; los hechos vía API de la misma instancia, al instante (cualquier POST/PUT/PATCH/DELETE exitoso la vacía).
- **Cron mensual:** los correos salen tras el COMMIT, no durante.

---

## 5. Hallazgos que NO se modificaron (requieren tu decisión)

**Seguridad**
1. `GET /api/pujas/activas` (ruta de **cliente**) devuelve las pujas de **todos** los usuarios con `email`, `nombre` y `apellido`. Fuga de datos personales.
2. El zip original incluía `.env` con secretos y `uploads/kyc`. Si circuló, rota `JWT_SECRET`, tokens de MercadoPago/PayPal y credenciales de email.
3. `getIp()` confía en `x-real-ip`: verifica que Railway lo sobrescriba; si no, el rate limit por IP se puede evadir.
4. `loginLimiter` (5 intentos / 5 min por IP) bloquea a usuarios legítimos detrás de una misma IP (NAT, oficinas).

**Concurrencia / diseño**
5. `LoteService.procesarImpagoLote` (y flujos similares de cancelación) llama a `mensajeService.enviarMensajeSistema` **dentro** de la transacción sin pasarla (2ª conexión). Baja frecuencia, riesgo bajo; no se tocó porque pasar la transacción cambia la semántica de errores (un fallo abortaría toda la transacción).
6. `startAuction` e `iniciarProceso` notifican a todos los suscriptores **uno por uno dentro del request** (266 suscriptores ≈ 16–20 s con el SMTP fallando rápido; con SMTP real, minutos). Conviene responder primero y notificar en segundo plano.
7. `req.user.role` e `isAdmin` se usan en 5 lugares pero el modelo solo tiene `rol`: probablemente siempre `undefined`.
8. `GET /api/proyectos/mis-proyectos` devolvió 500 con un usuario normal (no se investigó la causa; es compatible con `proyecto.id_creador_proyecto` vacío, pero es una hipótesis sin confirmar).
9. `mis_pujas` y `mis_transacciones` (7 JOINs) siguen siendo los endpoints de cliente más lentos.

---

## 6. Límites de las pruebas
- Sin SMTP, MercadoPago ni PayPal reales; los flujos con 2FA por email no se ejercitaron.
- Una sola instancia de la app (el comportamiento multi-instancia no se probó).
- La corrección del "lost update" de pujas es el patrón correcto (`FOR UPDATE`), pero no se reprodujo la carrera en el código original porque los timeouts la enmascaraban.
- Pujas simultáneas del **mismo usuario**: la puja más alta y la unicidad quedaron correctas, pero el conteo exacto de tokens no se auditó.

## 7. Repetir las pruebas
Carpeta `pruebas_carga/` (usar **solo** contra BD local o de staging; los scripts se niegan a correr contra URLs de producción):
```bash
cd pruebas_carga && npm install
JWT_SECRET=<el del backend> node run.js cliente 100 20          # mix cliente, 100 conexiones, 20 s
JWT_SECRET=<...> GZIP=1 node run.js mixto 200 60                # mix realista como navegador (gzip)
ALLOW_DESTRUCTIVE=yes JWT_SECRET=<...> DB_HOST=127.0.0.1 DB_USER=.. DB_PASS=.. DB_NAME=.. node race_bids.js 5 40
```
Requisitos: usuarios con `token_version = 0`, e IPs distintas por request (el script ya las genera) para no chocar con el
rate limit de 100 req/min por IP.

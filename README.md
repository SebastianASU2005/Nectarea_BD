# 🌿 Nectárea Backend - Plataforma de Inversión en Proyectos

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.1.0-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.37.7-52B0E7.svg)](https://sequelize.org/)
[![Mercado Pago](https://img.shields.io/badge/Mercado%20Pago-SDK-00AAFF.svg)](https://www.mercadopago.com/)

API RESTful completa para la plataforma **Nectárea**, un sistema de crowdfunding que permite a inversores participar mediante inversiones directas, pujas en subastas, y suscripciones mensuales con gestión automatizada de pagos.

> 📋 Para una explicación no técnica de la plataforma dirigida a stakeholders, ver [docs/GUIA_EJECUTIVA.md](docs/GUIA_EJECUTIVA.md)

---

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Stack Tecnológico](#-stack-tecnológico)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Variables de Entorno](#-variables-de-entorno)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Modelos de Base de Datos](#-modelos-de-base-de-datos)
- [API Endpoints](#-api-endpoints)
- [Sistema de Autenticación](#-sistema-de-autenticación)
- [Sistema de Pagos](#-sistema-de-pagos)
- [Tareas Programadas](#-tareas-programadas)
- [Seguridad](#-seguridad)
- [Despliegue](#-despliegue)

---

## ✨ Características Principales

### 💰 Gestión de Inversiones

- **Inversiones Directas**: Compra de participaciones en proyectos con confirmación automática
- **Sistema de Pujas**: Subastas con validación de conflictos y gestión de ganadores
- **Suscripciones Mensuales**: Pagos recurrentes con generación automática de cuotas
- **Gestión de Lotes**: División de proyectos en lotes vendibles

### 💳 Integración con Mercado Pago

- Procesamiento de pagos con validación de firma HMAC-SHA256
- Webhooks seguros para confirmación automática de transacciones
- Soporte para múltiples tipos de pago (inversiones, pujas, suscripciones)
- Sistema de reembolso automático ante errores de negocio
- Sistema de redirección post-pago

### 🔐 Seguridad y Autenticación

- JWT con tokens de acceso
- Autenticación de dos factores (2FA) con Google Authenticator (TOTP)
- Verificación KYC (Know Your Customer) con upload de documentos
- Validación de roles (`admin`, `cliente`)
- **Rate limiting en tres capas** con persistencia en PostgreSQL

### 📄 Gestión de Contratos

- Sistema de plantillas de contratos personalizables
- Generación automática de contratos firmados
- Verificación de integridad con hash SHA-256
- Upload y almacenamiento seguro de documentos

### 📧 Notificaciones y Comunicación

- Sistema de mensajería interna
- Emails transaccionales con Nodemailer y Resend
- Recordatorios automáticos de pagos vencidos
- Notificaciones de eventos importantes (subastas, pagos, reembolsos)

### 🤖 Automatización

- **11 tareas programadas** con node-cron para generación de cuotas, cierre de subastas, limpieza de datos y gestión de impagos

---

## 🏗 Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vue)                      │
│                    HTTP/HTTPS Requests                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     EXPRESS SERVER                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              MIDDLEWARE LAYER                        │   │
│  │  CORS · Auth JWT · Rate Limiter (3 capas) · Multer  │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 ROUTES LAYER                         │   │
│  │  /auth · /usuarios · /proyectos · /inversiones      │   │
│  │  /pujas · /pagos · /contratos · /mensajes           │   │
│  │  /payment · /kyc · /favoritos                       │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CONTROLLERS LAYER                       │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               SERVICES LAYER                         │   │
│  │  Lógica de negocio · Transacciones · MP · Email     │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              MODELS LAYER (Sequelize ORM)            │   │
│  └────────────────────┬─────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   POSTGRESQL DB      │
              │  • 20+ Tablas        │
              │  • Relaciones FK     │
              └─────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌──────────────────┐         ┌──────────────────┐
│  MERCADO PAGO    │         │   EMAIL SERVER   │
│  • Webhooks      │         │  Nodemailer/     │
│  • Payments API  │         │  Resend          │
└──────────────────┘         └──────────────────┘
```

---

## 🛠 Stack Tecnológico

| Categoría        | Tecnología            | Versión |
| ---------------- | --------------------- | ------- |
| Runtime          | Node.js               | 18.x    |
| Framework        | Express               | 5.1.0   |
| ORM              | Sequelize             | 6.37.7  |
| Base de datos    | PostgreSQL            | 14+     |
| Autenticación    | jsonwebtoken          | 9.0.2   |
| Hash contraseñas | bcryptjs              | 3.0.2   |
| 2FA              | speakeasy             | 2.0.0   |
| Pagos            | mercadopago SDK       | 2.9.0   |
| Rate limiting    | rate-limiter-flexible | latest  |
| Uploads          | multer                | 2.0.2   |
| Emails           | nodemailer + resend   | latest  |
| Tareas           | node-cron             | 4.2.1   |
| HTTP             | axios                 | 1.12.2  |

---

## 🚀 Instalación y Configuración

### Prerrequisitos

- **Node.js** >= 18.x
- **PostgreSQL** >= 14
- **npm**
- **Cuenta de Mercado Pago** (Access Token y Webhook Secret)
- **Cuenta de Email SMTP**

### Paso 1: Clonar el Repositorio

```bash
git clone https://github.com/SebastianASU2005/Nectarea_BD.git
cd Nectarea_BD
```

### Paso 2: Instalar Dependencias

```bash
npm install
```

### Paso 3: Configurar Variables de Entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales reales
```

### Paso 4: Configurar Base de Datos

```sql
-- Conectarse a PostgreSQL
psql -U postgres

-- Crear la base de datos y usuario
CREATE DATABASE nectarea_db;
CREATE USER nectarea_user WITH ENCRYPTED PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE nectarea_db TO nectarea_user;
\c nectarea_db
GRANT ALL ON SCHEMA public TO nectarea_user;
```

### Paso 5: Iniciar el Servidor

```bash
# Desarrollo (con recarga automática)
npm run dev

# Producción
npm start
```

Al iniciar, Sequelize sincroniza los modelos automáticamente (`alter: true`) y el rate limiter crea sus tablas en la DB. El servidor queda disponible en `http://localhost:3000`.

---

## 🔑 Variables de Entorno

Crea un archivo `.env` basándote en `.env.example`. Las variables críticas son:

```env
# ============================================
# SERVIDOR
# ============================================
NODE_ENV=development
PORT=3000
HOST_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# ============================================
# BASE DE DATOS POSTGRESQL
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nectarea_db
DB_USER=nectarea_user
DB_PASSWORD=tu_password_seguro
DB_DIALECT=postgres

# ============================================
# AUTENTICACIÓN JWT
# ============================================
JWT_SECRET=minimo_32_caracteres_aleatorios_cambiar_en_produccion
JWT_EXPIRES_IN=7d

# ============================================
# MERCADO PAGO
# ============================================
# Token LIVE (producción): https://www.mercadopago.com.ar/developers/panel
MP_ACCESS_TOKEN=APP_USR-...
# Token TEST (desarrollo/sandbox)
MP_TEST_ACCESS_TOKEN=TEST-...
# Secret del Webhook: Panel MP → Integraciones → Webhooks
MP_WEBHOOK_SECRET=tu_webhook_secret
MP_CURRENCY_ID=ARS

# ============================================
# EMAIL
# ============================================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password_gmail
EMAIL_FROM=noreply@nectarea.com
RESEND_API_KEY=re_...

# ============================================
# ARCHIVOS
# ============================================
MAX_FILE_SIZE=5242880

# ============================================
# TAREAS PROGRAMADAS
# ============================================
TIMEZONE=America/Argentina/Buenos_Aires
```

### ⚠️ Seguridad Crítica

- **NUNCA** subas `.env` a Git (ya está en `.gitignore`)
- Usa secretos **diferentes** en desarrollo y producción
- El `JWT_SECRET` debe tener **mínimo 32 caracteres aleatorios**

```bash
# Generar secreto seguro
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 📁 Estructura del Proyecto

```
Nectarea_BD/
│
├── config/
│   └── database.js               # Configuración de Sequelize y PostgreSQL
│
├── models/                       # 20+ modelos de Sequelize
│   ├── adhesion.js
│   ├── pagoAdhesion.js
│   ├── usuario.js
│   ├── proyecto.js
│   ├── inversion.js
│   ├── puja.js
│   ├── lote.js
│   ├── transaccion.js
│   ├── pagoMercado.js
│   ├── suscripcion_proyecto.js
│   ├── suscripcion_cancelada.js
│   ├── pago.js
│   ├── CuotaMensual.js
│   ├── contrato.js
│   ├── ContratoPlantilla.js
│   ├── ContratoFirmado.js
│   ├── mensaje.js
│   ├── imagen.js
│   ├── Favorito.js
│   ├── resumen_cuenta.js
│   ├── verificacion_identidad.js
│   ├── associations.js           # Relaciones entre modelos
│   └── base.js                   # Campos base compartidos (id, createdAt, updatedAt)
│
├── services/                     # Lógica de negocio
│   ├── auth.service.js
│   ├── auth2fa.service.js
│   ├── transaccion.service.js    # Flujo central de pagos
│   ├── pagoMercado.service.js    # Integración MP (preferencias, webhooks, reembolsos)
│   ├── email.service.js
│   └── ...
│
├── controllers/                  # Controladores HTTP
│   ├── pagoMercado.controller.js # Webhook y checkout
│   └── ...
│
├── routes/                       # 20 archivos de rutas
│   ├── auth.routes.js            # /api/auth/*
│   ├── usuario.routes.js         # /api/usuarios/*
│   ├── proyecto.routes.js        # /api/proyectos/*
│   ├── inversion.routes.js       # /api/inversiones/*
│   ├── puja.routes.js            # /api/pujas/*
│   ├── lote.routes.js            # /api/lotes/*
│   ├── pago.routes.js            # /api/pagos/*
│   ├── pagoMercado.routes.js     # /api/payment/*
│   ├── transaccion.routes.js     # /api/transacciones/*
│   ├── suscripcion_proyecto.routes.js
│   ├── contrato.routes.js        # /api/contratos/*
│   ├── mensaje.routes.js         # /api/mensajes/*
│   ├── imagen.routes.js          # /api/imagenes/*
│   ├── favorito.routes.js        # /api/favoritos/*
│   ├── kyc.routes.js             # /api/kyc/*
│   ├── resumen_cuenta.routes.js
│   ├── cuota_mensual.routes.js
│   └── redireccion.routes.js     # /pago/exito|fallo|pendiente
│
├── middlewares/
│   ├── auth.middleware.js        # Verificación JWT + populate req.user
│   ├── rateLimiter.js            # Rate limiting (ver sección Seguridad)
│   ├── checkKYCandTwoFA.js       # Requiere KYC aprobado + 2FA activo
│   ├── roleValidation.js         # blockAdminTransactions
│   └── imageUpload.middleware.js # Multer (imágenes, KYC, contratos)
│
├── tasks/                        # 11 cron jobs
│   ├── monthlyPaymentGenerationTask.js
│   ├── paymentReminderScheduler.js
│   ├── OverduePaymentNotifier.js
│   ├── OverduePaymentManager.js
│   ├── auctionSchedulerTask.js
│   ├── ManejoImpagoPuja.js
│   ├── subscriptionCheckScheduler.js
│   ├── cleanupUnconfirmedUsersTask.js
│   └── expireOldTransactions.job.js
│
├── uploads/                      # Archivos subidos (en .gitignore)
│   ├── imagenes/
│   ├── contratos/
│   └── kyc/
│
├── docs/
│   └── GUIA_EJECUTIVA.md         # Documentación para stakeholders
│
├── app.js                        # Entry point — Express + middlewares + rutas
├── .env                          # Variables de entorno (NO subir a Git)
├── .env.example                  # Plantilla de variables
├── .gitignore
└── package.json
```

---

## 🗄️ Modelos de Base de Datos

### Modelo de Relaciones Principal

```
Usuario
   ├─── 1:N → Inversion
   ├─── 1:N → Puja
   ├─── 1:N → Transaccion
   ├─── 1:N → SuscripcionProyecto
   ├─── 1:N → Mensaje (remitente y receptor)
   ├─── 1:N → Favorito
   ├─── 1:N → ContratoFirmado
   ├─── 1:1 → VerificacionIdentidad
   └─── 1:N → VerificacionIdentidad (como verificador/admin)

Proyecto
   ├─── 1:N → Lote
   ├─── 1:N → Inversion
   ├─── 1:N → Puja
   ├─── 1:N → SuscripcionProyecto
   ├─── 1:N → Imagen
   ├─── 1:N → ContratoPlantilla
   └─── 1:N → ContratoFirmado

Transaccion
   └─── 1:1 → PagoMercado

SuscripcionProyecto
   ├─── 1:N → Pago (cuotas mensuales)
   ├─── 1:N → Puja
   ├─── 1:N → Inversion
   ├─── 1:1 → ResumenCuenta
   └─── 1:1 → SuscripcionCancelada

ContratoPlantilla
   └─── 1:N → ContratoFirmado
```

### Campos del Modelo Usuario

```javascript
{
  id, nombre, apellido, email, dni, nombre_usuario,
  contraseña_hash,
  rol: ENUM('admin', 'cliente'),  // solo dos roles
  activo, confirmado_email,
  is_2fa_enabled, twofa_secret, last_2fa_verification,
  reset_password_token, reset_password_expires,
  confirmacion_token, confirmacion_token_expiracion,
  fecha_registro, numero_telefono
}
```

### Estados de Transacción

```javascript
// Estado interno          ← Estado de Mercado Pago
"pendiente"; // pending, in_process
"en_proceso"; // in_process
"pagado"; // approved
"fallido"; // rejected, cancelled
"reembolsado"; // refunded, charged_back
"expirado"; // timeout interno (30 min sin confirmar)
"rechazado_por_capacidad"; // proyecto sin cupos al confirmar
"rechazado_proyecto_cerrado"; // proyecto finalizado/cancelado
```

### Adhesión y PagoAdhesión

La **adhesión** es un paso previo a la suscripción completa. Permite a un usuario comprometerse con un proyecto pagando el **4% del valor móvil** en cuotas (contado, 3 o 6 cuotas). Una vez pagadas todas las cuotas, se activa la suscripción (con 1 token de puja, resumen de cuenta, etc.).

**Modelo `Adhesion`**:

| Campo                    | Tipo    | Descripción                                               |
| ------------------------ | ------- | --------------------------------------------------------- |
| `id_usuario`             | INT     | Usuario que se adhiere                                    |
| `id_proyecto`            | INT     | Proyecto al que se adhiere                                |
| `valor_movil_referencia` | DECIMAL | Valor del cemento × unidades en el momento de la adhesión |
| `porcentaje_adhesion`    | DECIMAL | Siempre 4.00%                                             |
| `monto_total_adhesion`   | DECIMAL | Valor móvil × (porcentaje/100)                            |
| `plan_pago`              | ENUM    | `contado`, `3_cuotas`, `6_cuotas`                         |
| `cuotas_totales`         | INT     | 1, 3 o 6                                                  |
| `cuotas_pagadas`         | INT     | 0 al inicio                                               |
| `estado`                 | ENUM    | `pendiente`, `en_curso`, `completada`, `cancelada`        |
| `id_suscripcion`         | INT     | Suscripción asociada (reserva cupo)                       |

**Modelo `PagoAdhesion`**:

| Campo               | Tipo    | Descripción                                              |
| ------------------- | ------- | -------------------------------------------------------- |
| `id_adhesion`       | INT     | FK a adhesión                                            |
| `numero_cuota`      | INT     | Número de cuota (1..N)                                   |
| `monto`             | DECIMAL | Monto de la cuota (total ÷ cuotas)                       |
| `fecha_vencimiento` | DATE    | Siempre día 10 del mes correspondiente                   |
| `estado`            | ENUM    | `pendiente`, `pagado`, `vencido`, `cancelado`, `forzado` |
| `id_transaccion`    | INT     | FK a transacción de pago                                 |

---

## 📡 API Endpoints

### Base URL

```
http://localhost:3000/api
```

### Autenticación

La mayoría de endpoints requieren JWT en el header:

```http
Authorization: Bearer {token}
```

### Auth (`/api/auth`)

| Método | Ruta                      | Acceso      | Descripción                         |
| ------ | ------------------------- | ----------- | ----------------------------------- |
| POST   | `/register`               | Público     | Registro de usuario                 |
| POST   | `/login`                  | Público     | Login (paso 1)                      |
| POST   | `/2fa/verify`             | Público     | Verificar código 2FA (paso 2 login) |
| GET    | `/confirmar_email/:token` | Público     | Confirmar email                     |
| POST   | `/reenviar_confirmacion`  | Público     | Reenviar email de confirmación      |
| POST   | `/forgot-password`        | Público     | Solicitar reset de contraseña       |
| POST   | `/reset-password/:token`  | Público     | Aplicar nueva contraseña            |
| POST   | `/logout`                 | Autenticado | Cerrar sesión                       |
| POST   | `/2fa/generate-secret`    | Autenticado | Generar QR para 2FA                 |
| POST   | `/2fa/enable`             | Autenticado | Activar 2FA                         |
| POST   | `/2fa/disable`            | Autenticado | Desactivar 2FA                      |

### Pagos (`/api/payment`)

| Método | Ruta                          | Acceso       | Descripción                        |
| ------ | ----------------------------- | ------------ | ---------------------------------- |
| POST   | `/checkout/:modelo/:modeloId` | Autenticado  | Iniciar pago (inversion/puja/pago) |
| POST   | `/checkout/generico`          | Autenticado  | Checkout genérico                  |
| POST   | `/checkout`                   | Autenticado  | Checkout legacy (inversión)        |
| GET    | `/status/:id_transaccion`     | Autenticado  | Consultar estado de pago           |
| POST   | `/webhook/:metodo`            | Mercado Pago | Notificación de pago (sin auth)    |

### Proyectos (`/api/proyectos`)

| Método | Ruta                      | Acceso      | Descripción                 |
| ------ | ------------------------- | ----------- | --------------------------- |
| GET    | `/activos`                | Autenticado | Proyectos disponibles       |
| GET    | `/activos/ahorristas`     | Público     | Proyectos tipo mensual      |
| GET    | `/activos/inversionistas` | Público     | Proyectos tipo directo      |
| GET    | `/mis-proyectos`          | Autenticado | Proyectos del usuario       |
| GET    | `/:id/activo`             | Público     | Detalle de proyecto activo  |
| POST   | `/`                       | Admin       | Crear proyecto              |
| PUT    | `/:id`                    | Admin       | Actualizar proyecto         |
| PUT    | `/:id/lotes`              | Admin       | Asignar lotes               |
| PUT    | `/:id/iniciar-proceso`    | Admin       | Iniciar proceso de proyecto |

### Inversiones (`/api/inversiones`)

| Método | Ruta                | Acceso              | Descripción               |
| ------ | ------------------- | ------------------- | ------------------------- |
| POST   | `/`                 | Cliente + KYC + 2FA | Crear inversión           |
| POST   | `/iniciar-pago/:id` | Cliente + KYC + 2FA | Iniciar pago de inversión |
| GET    | `/mis_inversiones`  | Autenticado         | Mis inversiones           |
| GET    | `/:id`              | Autenticado         | Detalle de inversión      |

### Pujas (`/api/pujas`)

| Método | Ruta                     | Acceso      | Descripción         |
| ------ | ------------------------ | ----------- | ------------------- |
| POST   | `/`                      | Cliente     | Crear puja          |
| POST   | `/iniciar-pago/:id`      | Cliente     | Pagar puja ganadora |
| GET    | `/activas`               | Autenticado | Pujas en curso      |
| GET    | `/mis_pujas`             | Autenticado | Mis pujas           |
| DELETE | `/mis_pujas/:id/retirar` | Cliente     | Retirar puja propia |

### Suscripciones (`/api/suscripciones`)

| Método | Ruta                     | Acceso              | Descripción          |
| ------ | ------------------------ | ------------------- | -------------------- |
| POST   | `/iniciar-pago`          | Cliente + KYC + 2FA | Iniciar suscripción  |
| GET    | `/mis_suscripciones`     | Autenticado         | Mis suscripciones    |
| DELETE | `/mis_suscripciones/:id` | Cliente + KYC + 2FA | Cancelar suscripción |

### Contratos (`/api/contratos`)

| Método | Ruta                 | Acceso                  | Descripción            |
| ------ | -------------------- | ----------------------- | ---------------------- |
| GET    | `/mis_contratos`     | Autenticado             | Mis contratos firmados |
| GET    | `/descargar/:id`     | Autenticado + KYC + 2FA | Descargar PDF          |
| POST   | `/plantillas/upload` | Admin                   | Subir plantilla        |
| GET    | `/plantillas/active` | Autenticado             | Plantillas activas     |

### KYC (`/api/kyc`)

| Método | Ruta                  | Acceso      | Descripción                    |
| ------ | --------------------- | ----------- | ------------------------------ |
| POST   | `/submit`             | Autenticado | Enviar documentos de identidad |
| GET    | `/status`             | Autenticado | Estado de verificación         |
| GET    | `/pending`            | Admin       | Solicitudes pendientes         |
| POST   | `/approve/:idUsuario` | Admin       | Aprobar verificación           |
| POST   | `/reject/:idUsuario`  | Admin       | Rechazar verificación          |

### Adhesión (`/api/adhesion`)

| Método | Ruta                      | Acceso      | Descripción                                                            |
| ------ | ------------------------- | ----------- | ---------------------------------------------------------------------- |
| POST   | `/`                       | Autenticado | Crear adhesión (body: `proyectoId`, `planPago`)                        |
| GET    | `/usuario`                | Autenticado | Listar mis adhesiones                                                  |
| GET    | `/:id`                    | Autenticado | Detalle de una adhesión (con sus cuotas)                               |
| GET    | `/:id/cuotas-pendientes`  | Autenticado | Cuotas pendientes/vencidas de una adhesión                             |
| POST   | `/pago/iniciar`           | Autenticado | Iniciar pago de una cuota (body: `adhesionId`, `numeroCuota`)          |
| POST   | `/pago/confirmar`         | Autenticado | Confirmar pago de cuota con 2FA (body: `pagoAdhesionId`, `codigo_2fa`) |
| POST   | `/:id/cancelar/iniciar`   | Autenticado | Solicitar cancelación de adhesión (retorna `requires2FA`)              |
| POST   | `/:id/cancelar/confirmar` | Autenticado | Confirmar cancelación con 2FA (body: `codigo_2fa`)                     |

### Rutas de Administrador para Adhesión

| Método | Ruta                                 | Acceso | Descripción                                                            |
| ------ | ------------------------------------ | ------ | ---------------------------------------------------------------------- |
| GET    | `/admin/all`                         | Admin  | Listar todas las adhesiones                                            |
| POST   | `/admin/forzar-pago`                 | Admin  | Forzar pago de una cuota (body: `adhesionId`, `numeroCuota`, `motivo`) |
| GET    | `/admin/metrics`                     | Admin  | Métricas globales de adhesiones (filtro por fechas)                    |
| GET    | `/admin/overdue`                     | Admin  | Listar cuotas de adhesión vencidas                                     |
| GET    | `/admin/payment-history/:adhesionId` | Admin  | Historial completo de pagos de una adhesión                            |

---

## 💳 Sistema de Pagos con Mercado Pago

### Flujo Completo

```
1. Usuario inicia pago (POST /api/payment/checkout/:modelo/:modeloId)
       ↓
2. Backend crea Transaccion (estado: pendiente) + PagoMercado
       ↓
3. Backend genera preferencia en MP API → devuelve redirectUrl
       ↓
4. Usuario paga en Mercado Pago
       ↓
5. MP envía webhook → POST /api/payment/webhook/mercadopago
       ↓
6. Backend valida firma HMAC-SHA256 con MP_WEBHOOK_SECRET
       ↓
7. Backend consulta pago en MP API (/v1/payments/{id})
       ↓
8. Si approved → confirmarTransaccion():
       • Confirma Inversion / Puja / Suscripcion
       • Genera ContratoFirmado
       • Envía email de confirmación
   Si rejected → procesarFalloTransaccion()
   Si proyecto sin cupos → reembolso automático + notificación
       ↓
9. MP redirige usuario → /pago/exito|fallo|pendiente/:id
       ↓
10. Frontend consulta estado → GET /api/payment/status/:id
```
### Pago de cuotas de adhesión

El flujo es idéntico al de inversiones/suscripciones, con dos particularidades:

- **Pago secuencial**: no se puede pagar una cuota si las anteriores no están pagadas.
- **2FA stateless**: el controlador `iniciarPagoCuota` devuelve `requires2FA` si el usuario tiene 2FA activo, y luego `confirmarPagoCuota` verifica el código antes de crear la transacción.

Una vez pagada la última cuota, la suscripción asociada se activa automáticamente (adhesión completada).
### Validación del Webhook

```javascript
// El manifest se construye así:
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;

// Se valida con HMAC-SHA256
const expectedHash = crypto
  .createHmac("sha256", process.env.MP_WEBHOOK_SECRET)
  .update(manifest)
  .digest("hex");

// Si no coincide → 401 Unauthorized
```

### Configuración en el Dashboard de Mercado Pago

1. Panel → Credenciales → copiar `Access Token` → `MP_ACCESS_TOKEN`
2. Panel → Integraciones → Webhooks → URL: `https://tu-dominio.com/api/payment/webhook/mercadopago`
3. Eventos: ✅ solo **Pagos**
4. Copiar `Secret Key` → `MP_WEBHOOK_SECRET`

---

## ⏰ Tareas Programadas (Cron Jobs)

| Tarea                  | Archivo                        | Horario        | Función                                 |
| ---------------------- | ------------------------------ | -------------- | --------------------------------------- |
| Generación cuotas      | `monthlyPaymentGenerationTask` | `0 0 1 * *`    | Crea cuotas el día 1 de cada mes        |
| Recordatorios pago     | `paymentReminderScheduler`     | `0 9 * * *`    | Email si vence en 3 días                |
| Notificador mora       | `OverduePaymentNotifier`       | `0 10 * * *`   | Marca vencidos, calcula mora            |
| Gestor impagos         | `OverduePaymentManager`        | `0 0 * * *`    | Suspende con +30 días mora              |
| Subastas               | `auctionSchedulerTask`         | `*/15 * * * *` | Abre/cierra subastas automáticamente    |
| Impagos pujas          | `ManejoImpagoPuja`             | `0 */6 * * *`  | Reasigna lote al segundo postor         |
| Suscripciones          | `subscriptionCheckScheduler`   | `0 2 * * *`    | Verifica/finaliza suscripciones         |
| Usuarios sin confirmar | `cleanupUnconfirmedUsersTask`  | `0 4 * * *`    | Elimina cuentas sin confirmar en 7 días |
| Transacciones viejas   | `expireOldTransactions.job`    | `0 5 * * *`    | Expira pendientes > 30 min              |

---

## 🔒 Seguridad

### Middleware de Autenticación (`auth.middleware.js`)

Verifica el JWT en cada request protegido y popula `req.user` con los datos del usuario desde la DB. Si el token expiró o el usuario está inactivo, responde `401`.

```
Authorization: Bearer {jwt} → verifica → req.user = { id, rol, ... }
```

### KYC + 2FA (`checkKYCandTwoFA.js`)

Middleware requerido en todas las operaciones financieras (invertir, pagar cuota, pujar, firmar contrato). Verifica que el usuario tenga:

- Verificación de identidad aprobada (`estado_verificacion = 'aprobado'`)
- 2FA activo (`is_2fa_enabled = true`)

### Bloqueo de Admin en Transacciones (`roleValidation.js`)

`blockAdminTransactions` impide que cuentas de administrador realicen inversiones, pujas o pagos, separando el rol operativo del financiero.

---

### Rate Limiting (`middlewares/rateLimiter.js`)

El sistema implementa **tres capas independientes** de protección usando `rate-limiter-flexible` con persistencia en PostgreSQL. Los stores se inicializan en `synchronizeDatabase()` y crean sus tablas automáticamente.

#### Capa 1 — Global por IP (`globalRateLimiter`)

```javascript
// Aplica a TODA la API antes de cualquier ruta
// Montado con app.use(globalRateLimiter) en app.js
app.use(globalRateLimiter);

// Límite: 100 req/min por IP
// Store: tabla rate_limit_global_ip en PostgreSQL
// Excluye: /api/payment/webhook (tráfico de servidores de MP)
// Fail-open: si la DB cae, el request pasa (evita bloquear usuarios)
```

#### Capa 2 — Por usuario autenticado (`userRateLimiter`)

```javascript
// Aplica DESPUÉS de authMiddleware.authenticate
// Se agrega manualmente en rutas específicas de alto impacto

// Operaciones de pago (checkout, iniciar-pago):
router.post(
  "/checkout/:modelo/:modeloId",
  authMiddleware.authenticate,
  userRateLimiter, // ← aquí
  paymentController.iniciarPagoPorModelo,
);

// Límite: 300 req/min por userId
// Admin: sin límite (pasa directamente con next())
// Store: tabla rate_limit_cliente en PostgreSQL
// Campo: req.user.rol ('admin' | 'cliente')
```

**Rutas con `userRateLimiter` aplicado:**

| Ruta                                   | Motivo                          |
| -------------------------------------- | ------------------------------- |
| `POST /payment/checkout*`              | Crea transacciones reales en MP |
| `POST /inversiones/iniciar-pago/:id`   | Inicia checkout de inversión    |
| `POST /pagos/pagar-mes/:id`            | Inicia checkout de cuota        |
| `POST /suscripciones/iniciar-pago`     | Inicia checkout de suscripción  |
| `POST /pujas/iniciar-pago/:id`         | Inicia checkout de puja         |
| `GET /payment/status/:id`              | Polling post-pago               |
| `GET /mensajes` y `/:id_receptor`      | Polling de chat                 |
| `GET /pujas/activas`                   | Polling durante subastas        |
| `GET /transacciones/mis_transacciones` | Polling de estado               |

#### Capa 3 — Autenticación (`loginLimiter` / `fa2Limiter`)

```javascript
// Usa express-rate-limit con store en memoria
// Aplicado directamente en auth.routes.js

// loginLimiter: login, register, forgot-password, reenviar_confirmacion
// → 5 intentos cada 5 minutos por IP

// fa2Limiter: 2fa/verify, reset-password/:token
// → 3 intentos por minuto por IP
```

#### Tablas creadas automáticamente en PostgreSQL

```
rate_limit_global_ip   → contador por IP (toda la API)
rate_limit_cliente     → contador por userId (rutas de pago y polling)
```

#### Resumen de límites

| Situación                           | Límite                    | Capa    |
| ----------------------------------- | ------------------------- | ------- |
| Cualquier visitante                 | 100 req/min por IP        | Global  |
| Cliente autenticado (rutas de pago) | 300 req/min por userId    | Usuario |
| Admin autenticado                   | Sin límite por userId     | —       |
| Login / registro                    | 5 intentos / 5 min por IP | Auth    |
| 2FA / reset password                | 3 intentos / min por IP   | Auth    |
| Webhook de Mercado Pago             | Sin límite (excluido)     | —       |

#### Inicialización en `app.js`

```javascript
// Import
const {
  initRateLimiters,
  globalRateLimiter,
} = require("./middlewares/rateLimiter");

// En synchronizeDatabase(), después de los .sync() de Sequelize:
await initRateLimiters(); // crea tablas y conecta stores a PostgreSQL

// En la cadena de middlewares, después de express.json():
app.use(globalRateLimiter);
```

---

### Orden de Middlewares en `app.js`

```
1. CORS
2. Archivos estáticos (/uploads)
3. Webhook MP  ← router propio con raw body, antes del body parsing
4. express.json() + express.urlencoded()
5. globalRateLimiter  ← bloquea IPs abusivas
6. Rutas de la API
   └─ Rutas autenticadas con userRateLimiter en puntos críticos
```

---

### Protección contra SQL Injection

Sequelize usa queries parametrizadas automáticamente. Nunca se construyen queries con concatenación de strings.

### Hash de contraseñas

bcryptjs con salt rounds configurables. Las contraseñas nunca se almacenan en texto plano.

### Integridad de contratos

Cada contrato firmado tiene un hash SHA-256 del documento. Al descargar, el sistema recalcula el hash y lo compara para detectar modificaciones.

---

## 📜 Auditoría de Acciones de Administradores

Toda modificación realizada por un administrador sobre usuarios, proyectos o pagos queda registrada automáticamente en la tabla `audit_log`. Esto garantiza trazabilidad y cumplimiento normativo.

### Tabla `audit_log`

| Campo           | Tipo         | Descripción                                                                                             |
| --------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `usuario_id`    | INT          | ID del administrador que ejecutó la acción                                                              |
| `accion`        | VARCHAR(100) | Código de la acción (ver lista abajo)                                                                   |
| `entidad_tipo`  | VARCHAR(50)  | Modelo afectado (`Usuario`, `Proyecto`, `Pago`)                                                         |
| `entidad_id`    | INT          | ID del registro modificado                                                                              |
| `datos_previos` | JSON         | Estado completo antes del cambio (campos sensibles se ofuscan: `contraseña_hash`, `twofa_secret`, etc.) |
| `datos_nuevos`  | JSON         | Estado después del cambio                                                                               |
| `motivo`        | VARCHAR(500) | Razón aportada por el administrador (solo para usuarios)                                                |
| `ip_origen`     | VARCHAR(45)  | Dirección IP desde la que se hizo la modificación                                                       |
| `user_agent`    | TEXT         | Navegador / cliente utilizado                                                                           |
| `created_at`    | TIMESTAMP    | Momento exacto de la acción                                                                             |

### Acciones auditadas

| Entidad  | Acción                     | Cuándo se registra                                                        |
| -------- | -------------------------- | ------------------------------------------------------------------------- |
| Usuario  | `ACTUALIZAR_USUARIO`       | Admin edita email, nombre, rol, etc.                                      |
| Usuario  | `DESACTIVAR_USUARIO`       | Admin desactiva una cuenta                                                |
| Usuario  | `REACTIVAR_USUARIO`        | Admin reactiva una cuenta inactiva                                        |
| Usuario  | `RESET_2FA_USUARIO`        | Admin desactiva el 2FA de un usuario                                      |
| Usuario  | `RESET_PASSWORD_USUARIO`   | Admin cambia la contraseña de un usuario                                  |
| Proyecto | `ACTUALIZAR_PROYECTO`      | Admin modifica datos del proyecto                                         |
| Proyecto | `DESACTIVAR_PROYECTO`      | Admin oculta un proyecto (soft delete)                                    |
| Proyecto | `ASIGNAR_LOTES_A_PROYECTO` | Admin asigna lotes a un proyecto                                          |
| Proyecto | `INICIAR_CONTEO_MENSUAL`   | Admin inicia el conteo de meses de un proyecto mensual                    |
| Pago     | `MODIFICAR_MONTO_PAGO`     | Admin cambia el monto de una cuota pendiente o vencida                    |
| Pago     | `CAMBIAR_ESTADO_PAGO`      | Admin fuerza un cambio de estado (`pagado`, `cancelado`, `forzado`, etc.) |

### Uso desde el código

El servicio `auditService.registrar()` se encarga de crear el log. Ejemplo:

````javascript
await auditService.registrar({
  usuarioId: adminId,
  accion: "ACTUALIZAR_USUARIO",
  entidadTipo: "Usuario",
  entidadId: usuario.id,
  datosPrevios,
  datosNuevos: usuarioActualizado.toJSON(),
  motivo: "Corrección de email por solicitud del usuario",
  ip: req.ip,
  userAgent: req.headers["user-agent"],
});
---

## 🚀 Despliegue

### Render (recomendado — configuración actual)

```yaml
Build Command: npm install
Start Command: npm start
````

Variables de entorno a configurar en el panel de Render: todas las del `.env.example`.

**Nota importante:** En producción, Render actúa como proxy. El `app.js` ya maneja esto:

```javascript
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1); // resuelve IP real desde X-Forwarded-For
}
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "app.js"]
```

### VPS con PM2

```bash
npm install -g pm2
pm2 start app.js --name nectarea-api
pm2 startup && pm2 save
```

---

## 🔧 Troubleshooting

**"Cannot connect to database"**

```bash
# Verificar que PostgreSQL esté corriendo
sudo systemctl status postgresql
# Probar conexión manual
psql -h localhost -U nectarea_user -d nectarea_db
```

**"Invalid signature" en Webhook**

```bash
# Verificar MP_WEBHOOK_SECRET en .env — debe ser exactamente el que muestra el panel de MP
# Probar localmente con ngrok y configurar esa URL en MP
ngrok http 3000
```

**Rate limit bloqueando usuarios legítimos**

```javascript
// Ajustar en middlewares/rateLimiter.js
globalLimiterStore = await createDbLimiter("global_ip", 200, 60); // aumentar a 200
```

**Tablas de rate limit no se crean**

```bash
# Verificar que initRateLimiters() se llame después de los .sync() en synchronizeDatabase()
# Revisar logs al arrancar: "[RateLimiter] ✅ Store DB listo: rate_limit_global_ip"
```

**Cron jobs no ejecutan**

```bash
# Verificar zona horaria
TIMEZONE=America/Argentina/Buenos_Aires
# Ver logs de PM2
pm2 logs nectarea-api
```

---

## 🔐 Checklist de Seguridad

- ✅ JWT para autenticación sin estado
- ✅ bcryptjs para hash de contraseñas
- ✅ 2FA (TOTP) para operaciones financieras
- ✅ KYC obligatorio antes de invertir
- ✅ Rate limiting en 3 capas con persistencia en DB
- ✅ Validación HMAC-SHA256 en webhooks de MP
- ✅ SQL Injection prevenido por Sequelize ORM
- ✅ CORS configurado con whitelist explícita
- ✅ Trust proxy correctamente configurado para Render
- ✅ Contratos con hash SHA-256 para integridad
- ✅ Admins bloqueados de realizar transacciones financieras
- ✅ Reembolso automático ante errores de negocio post-pago

---

## 📄 Licencia

MIT License — Copyright (c) 2025 Nectárea

---

## 📞 Contacto

- **Repositorio:** [GitHub - Nectarea_BD](https://github.com/SebastianASU2005/Nectarea_BD)
- **Issues:** [Reportar Bug](https://github.com/SebastianASU2005/Nectarea_BD/issues)

---

<p align="center">
  <strong>Desarrollado con 💚 para Nectárea</strong>
</p>

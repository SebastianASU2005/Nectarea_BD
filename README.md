# 🌿 Nectárea Backend - Plataforma de Inversión en Proyectos Agrícolas

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21.1-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.37.5-52B0E7.svg)](https://sequelize.org/)
[![Mercado Pago](https://img.shields.io/badge/Mercado%20Pago-SDK-00AAFF.svg)](https://www.mercadopago.com/)

API RESTful completa para la plataforma **Nectárea**, un sistema de crowdfunding especializado en proyectos agrícolas que permite a inversores participar mediante inversiones directas, pujas en subastas, y suscripciones mensuales con gestión automatizada de pagos.

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
- **Inversiones Directas**: Compra de tokens de proyectos con confirmación automática
- **Sistema de Pujas**: Subastas con validación de conflictos y gestión de ganadores
- **Suscripciones Mensuales**: Pagos recurrentes con generación automática de cuotas
- **Gestión de Lotes**: División de proyectos en lotes vendibles

### 💳 Integración con Mercado Pago
- Procesamiento de pagos con validación de firma HMAC-SHA256
- Webhooks seguros para confirmación de transacciones
- Soporte para múltiples tipos de pago (inversiones, pujas, suscripciones)
- Sistema de redirección post-pago

### 🔐 Seguridad y Autenticación
- JWT con tokens de acceso y refresh
- Autenticación de dos factores (2FA) con códigos temporales
- Verificación KYC (Know Your Customer) con upload de documentos
- Validación de roles (Admin, Usuario, Inversionista)
- Rate limiting para prevenir ataques de fuerza bruta

### 📄 Gestión de Contratos
- Sistema de plantillas de contratos personalizables
- Generación automática de contratos firmados
- Firma digital con hash SHA-256
- Upload y almacenamiento seguro de documentos

### 📧 Notificaciones y Comunicación
- Sistema de mensajería interna entre usuarios
- Emails transaccionales con Nodemailer
- Recordatorios automáticos de pagos vencidos
- Notificaciones de proyectos favoritos

### 🤖 Automatización
- **11 tareas programadas** con node-cron:
  - Generación mensual de cuotas
  - Notificaciones de pagos vencidos
  - Limpieza de usuarios no confirmados
  - Gestión de proyectos expirados
  - Cierre automático de subastas
  - Manejo de impagos

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
│  │  • CORS  • Auth JWT  • Rate Limiter  • Validation   │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 ROUTES LAYER                         │   │
│  │  /auth  /usuarios  /proyectos  /inversiones         │   │
│  │  /pujas  /pagos  /contratos  /mensajes              │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              CONTROLLERS LAYER                       │   │
│  │  • Manejo de HTTP Request/Response                   │   │
│  │  • Validación de datos de entrada                    │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               SERVICES LAYER                         │   │
│  │  • Lógica de negocio compleja                        │   │
│  │  • Transacciones y validaciones                      │   │
│  │  • Integraciones externas (MP, Email)               │   │
│  └────────────────────┬─────────────────────────────────┘   │
│                       │                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              MODELS LAYER (ORM)                      │   │
│  │  • Sequelize Models                                  │   │
│  │  • Relaciones y Asociaciones                         │   │
│  └────────────────────┬─────────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   POSTGRESQL DB      │
              │  • 20+ Tablas        │
              │  • Relaciones 1:N    │
              │  • Triggers          │
              └─────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌──────────────────┐         ┌──────────────────┐
│  MERCADO PAGO    │         │   EMAIL SERVER   │
│  • Webhooks      │         │   (SMTP/Gmail)   │
│  • Payments API  │         │   • Nodemailer   │
└──────────────────┘         └──────────────────┘
```

### Flujo de una Inversión Completa

```
1. Usuario crea inversión
       ↓
2. Service valida fondos y disponibilidad
       ↓
3. Se crea Transacción (estado: pendiente)
       ↓
4. Se genera preferencia de pago en Mercado Pago
       ↓
5. Usuario completa pago en MP
       ↓
6. MP envía webhook → Validación HMAC-SHA256
       ↓
7. Service confirma inversión y actualiza tokens
       ↓
8. Se genera contrato firmado automáticamente
       ↓
9. Email de confirmación al usuario
       ↓
10. Actualización de saldo y resumen de cuenta
```

---

## 🛠 Stack Tecnológico

### Backend Core
```json
{
  "express": "^4.21.1",
  "sequelize": "^6.37.5",
  "pg": "^8.13.1",
  "pg-hstore": "^2.3.4"
}
```

### Seguridad y Autenticación
```json
{
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "speakeasy": "^2.0.0",
  "qrcode": "^1.5.4",
  "crypto": "built-in"
}
```

### Pagos y Transacciones
```json
{
  "mercadopago": "^2.0.15"
}
```

### Uploads y Archivos
```json
{
  "multer": "^1.4.5-lts.1",
  "pdf-lib": "^1.17.1"
}
```

### Emails
```json
{
  "nodemailer": "^6.9.16"
}
```

### Tareas Programadas
```json
{
  "node-cron": "^3.0.3"
}
```

### Validación y Utilidades
```json
{
  "express-validator": "^7.2.0",
  "cors": "^2.8.5",
  "dotenv": "^16.4.7",
  "morgan": "^1.10.0"
}
```

---

## 🚀 Instalación y Configuración

### Prerrequisitos

- **Node.js** >= 18.x
- **PostgreSQL** >= 14
- **npm** o **yarn**
- **Cuenta de Mercado Pago** (Access Token y Webhook Secret)
- **Cuenta de Email SMTP** (Gmail, SendGrid, etc.)

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

Crea un archivo `.env` en la raíz del proyecto:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales (ver sección completa más abajo).

### Paso 4: Configurar Base de Datos

```sql
-- Conéctate a PostgreSQL
psql -U postgres

-- Crea la base de datos
CREATE DATABASE nectarea_db;

-- Crea el usuario
CREATE USER nectarea_user WITH ENCRYPTED PASSWORD 'tu_password_seguro';

-- Otorga privilegios
GRANT ALL PRIVILEGES ON DATABASE nectarea_db TO nectarea_user;

-- Conéctate a la base de datos
\c nectarea_db

-- Otorga privilegios en el esquema
GRANT ALL ON SCHEMA public TO nectarea_user;
```

### Paso 5: Ejecutar Migraciones

```bash
# Sequelize sincronizará automáticamente los modelos
npm run dev
```

O si prefieres sincronización manual:

```javascript
// En app.js, la sincronización ya está configurada:
await sequelize.sync({ alter: true });
```

### Paso 6: Iniciar el Servidor

**Desarrollo:**
```bash
npm run dev
```

**Producción:**
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

---

## 🔑 Variables de Entorno

Crea un archivo `.env` con las siguientes variables:

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
DB_LOGGING=false

# ============================================
# AUTENTICACIÓN JWT
# ============================================
JWT_SECRET=tu_secreto_super_seguro_minimo_32_caracteres_cambiar_en_produccion
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=otro_secreto_diferente_para_refresh_tokens
JWT_REFRESH_EXPIRES_IN=30d

# ============================================
# MERCADO PAGO
# ============================================
# Obtén tu Access Token desde: https://www.mercadopago.com.ar/developers/panel
MP_ACCESS_TOKEN=TEST-1234567890-abcdef-ghijklmnopqrstuvwx
# Obtén tu Webhook Secret desde la configuración de Webhooks
MP_WEBHOOK_SECRET=tu_webhook_secret_de_mercado_pago
MP_CURRENCY_ID=ARS
MP_SUCCESS_URL=http://localhost:5173/pago-exitoso
MP_FAILURE_URL=http://localhost:5173/pago-fallido
MP_PENDING_URL=http://localhost:5173/pago-pendiente

# ============================================
# EMAIL (NODEMAILER)
# ============================================
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu_email@gmail.com
# Para Gmail, genera una "Contraseña de Aplicación"
EMAIL_PASSWORD=tu_app_password_de_16_caracteres
EMAIL_FROM=noreply@nectarea.com
EMAIL_FROM_NAME=Nectárea

# ============================================
# ARCHIVOS Y UPLOADS
# ============================================
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=application/pdf,image/jpeg,image/png
UPLOAD_PATH=./uploads

# ============================================
# SEGURIDAD
# ============================================
BCRYPT_SALT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# TAREAS PROGRAMADAS (CRON)
# ============================================
ENABLE_CRON_JOBS=true
TIMEZONE=America/Argentina/Buenos_Aires

# ============================================
# GOOGLE MAPS (OPCIONAL)
# ============================================
GOOGLE_MAPS_API_KEY=tu_api_key_de_google_maps

# ============================================
# 2FA (AUTENTICACIÓN DOS FACTORES)
# ============================================
TWO_FA_ISSUER=Nectarea
TWO_FA_TOKEN_EXPIRY=300
```

### ⚠️ Seguridad Crítica

- **NUNCA** subas el archivo `.env` a Git (ya está en `.gitignore`)
- Usa **secretos diferentes** en desarrollo y producción
- **Rota los secretos cada 90 días** como mínimo
- En producción, usa **variables de entorno del sistema** (no archivos)
- El `JWT_SECRET` debe tener **mínimo 32 caracteres aleatorios**

### Generar Secretos Seguros

```bash
# En Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# En Linux/Mac
openssl rand -hex 64
```

---

## 📁 Estructura del Proyecto

```
Nectarea_BD/
│
├── config/
│   ├── config.js                 # Configuración general de la app
│   └── database.js               # Configuración de Sequelize y PostgreSQL
│
├── models/                       # 🗄️ Modelos de Sequelize (20+ modelos)
│   ├── usuario.js                # Modelo de usuarios
│   ├── proyecto.js               # Proyectos de inversión
│   ├── inversion.js              # Inversiones directas
│   ├── puja.js                   # Sistema de subastas
│   ├── lote.js                   # Lotes vendibles de proyectos
│   ├── transaccion.js            # Transacciones financieras
│   ├── pagoMercado.js            # Pagos de Mercado Pago
│   ├── suscripcion_proyecto.js   # Suscripciones mensuales
│   ├── pago.js                   # Cuotas mensuales
│   ├── CuotaMensual.js           # Pagos de suscripciones
│   ├── contrato.js               # Contratos base
│   ├── ContratoPlantilla.js      # Plantillas de contratos
│   ├── ContratoFirmado.js        # Contratos firmados digitalmente
│   ├── mensaje.js                # Mensajería interna
│   ├── imagen.js                 # Imágenes de proyectos
│   ├── Favorito.js               # Proyectos favoritos
│   ├── resumen_cuenta.js         # Resumen financiero de usuarios
│   ├── verificacion_identidad.js # KYC - Verificación de identidad
│   ├── suscripcion_cancelada.js  # Historial de cancelaciones
│   ├── associations.js           # Relaciones entre modelos
│   └── base.js                   # Modelo base compartido
│
├── services/                     # 🔧 Lógica de negocio (24 servicios)
│   ├── auth.service.js           # Autenticación y registro
│   ├── auth2fa.service.js        # Autenticación de dos factores
│   ├── usuario.service.js        # Gestión de usuarios
│   ├── proyecto.service.js       # CRUD de proyectos
│   ├── inversion.service.js      # Lógica de inversiones
│   ├── puja.service.js           # Lógica de pujas
│   ├── lote.service.js           # Gestión de lotes
│   ├── transaccion.service.js    # Transacciones financieras
│   ├── pagoMercado.service.js    # Integración con Mercado Pago
│   ├── suscripcion_proyecto.service.js  # Suscripciones
│   ├── pago.service.js           # Gestión de cuotas
│   ├── cuota_mensual.service.js  # Generación de cuotas
│   ├── contrato.service.js       # Contratos base
│   ├── contratoPlantilla.service.js  # Plantillas
│   ├── contratoFirmado.service.js    # Firmas digitales
│   ├── contratoGeneral.service.js    # Operaciones generales
│   ├── email.service.js          # Envío de emails
│   ├── jwt.service.js            # Generación y validación de JWT
│   ├── mensaje.service.js        # Mensajería
│   ├── imagen.service.js         # Upload de imágenes
│   ├── localFileStorage.service.js  # Almacenamiento local
│   ├── favorito.service.js       # Favoritos
│   ├── resumen_cuenta.service.js # Resúmenes financieros
│   └── verificacionIdentidad.service.js  # KYC
│
├── controllers/                  # 🎮 Controladores HTTP (24 controladores)
│   ├── auth.controller.js        # Login, registro, logout
│   ├── auth2fa.controller.js     # 2FA setup y verificación
│   ├── usuario.controller.js     # CRUD usuarios
│   ├── proyecto.controller.js    # CRUD proyectos
│   ├── inversion.controller.js   # Gestión de inversiones
│   ├── puja.controller.js        # Gestión de pujas
│   ├── lote.controller.js        # CRUD lotes
│   ├── transaccion.controller.js # Transacciones
│   ├── pago.controller.js        # Cuotas de suscripciones
│   ├── pagoMercado.controller.js # Webhooks y checkout de MP
│   ├── redireccion.controller.js # Redirecciones post-pago
│   ├── suscripcion.controller.js # CRUD suscripciones
│   ├── suscripcion_proyecto.controller.js  # Suscripciones a proyectos
│   ├── cuota_mensual.controller.js  # Cuotas mensuales
│   ├── contrato.controller.js    # Contratos base
│   ├── contratoPlantilla.controller.js  # Plantillas
│   ├── contratoFirmado.controller.js    # Contratos firmados
│   ├── contratoGeneral.controller.js    # Operaciones generales
│   ├── mensaje.controller.js     # Mensajería
│   ├── imagen.controller.js      # Upload de imágenes
│   ├── favorito.controller.js    # Favoritos
│   ├── resumen_cuenta.controller.js  # Resúmenes
│   └── verificacionIdentidad.controller.js  # KYC
│
├── routes/                       # 🛣️ Definición de rutas (20 archivos)
│   ├── auth.routes.js            # /api/auth/*
│   ├── usuario.routes.js         # /api/usuarios/*
│   ├── proyecto.routes.js        # /api/proyectos/*
│   ├── inversion.routes.js       # /api/inversiones/*
│   ├── puja.routes.js            # /api/pujas/*
│   ├── lote.routes.js            # /api/lotes/*
│   ├── pago.routes.js            # /api/pagos/*
│   ├── pagoMercado.routes.js     # /api/payment/*
│   ├── redireccion.routes.js     # /api/redirection/*
│   ├── transaccion.routes.js     # /api/transacciones/*
│   ├── suscripcion.routes.js     # /api/suscripciones/*
│   ├── suscripcion_proyecto.routes.js  # /api/suscripcion-proyecto/*
│   ├── cuota_mensual.routes.js   # /api/cuotas-mensuales/*
│   ├── contrato.routes.js        # /api/contratos/*
│   ├── mensaje.routes.js         # /api/mensajes/*
│   ├── imagen.routes.js          # /api/imagenes/*
│   ├── favorito.routes.js        # /api/favoritos/*
│   ├── resumen_cuenta.routes.js  # /api/resumen-cuenta/*
│   └── kyc.routes.js             # /api/kyc/*
│
├── middleware/                   # 🛡️ Middleware personalizado
│   ├── auth.middleware.js        # Verificación JWT
│   ├── checkKYCandTwoFA.js       # Validación KYC y 2FA
│   ├── imageUpload.middleware.js # Configuración de Multer
│   ├── rateLimiter.js            # Rate limiting
│   └── roleValidation.js         # Validación de roles
│
├── tasks/                        # ⏰ Tareas programadas (11 tareas)
│   ├── monthlyPaymentGenerationTask.js      # Genera cuotas mensuales (día 1)
│   ├── paymentReminderScheduler.js          # Recordatorios de pago (diario)
│   ├── OverduePaymentNotifier.js            # Notifica pagos vencidos
│   ├── OverduePaymentManager.js             # Gestiona impagos severos
│   ├── auctionSchedulerTask.js              # Cierra subastas automáticamente
│   ├── ManejoImpagoPuja.js                  # Maneja impagos de pujas
│   ├── projectScheduler.js                  # Gestiona inicio/fin de proyectos
│   ├── subscriptionCheckScheduler.js        # Verifica suscripciones activas
│   ├── cleanupCanceledPaymentsTask.js       # Limpia pagos cancelados
│   ├── cleanupUnconfirmedUsersTask.js       # Elimina usuarios no confirmados
│   └── expireOldTransactions.job.js         # Expira transacciones antiguas
│
├── utils/                        # 🔧 Utilidades y helpers
│   ├── dates.js                  # Manejo de fechas y zonas horarias
│   ├── generateFileHash.js       # Generación de hashes SHA-256
│   ├── networkUtils.js           # Utilidades de red (IPs, dominios)
│   └── responseUtils.js          # Respuestas HTTP estandarizadas
│
├── uploads/                      # 📦 Archivos subidos
│   ├── contratos/                # Contratos PDF
│   ├── kyc/                      # Documentos de identidad
│   └── proyectos/                # Imágenes de proyectos
│
├── Imagenes/                     # 🖼️ Imágenes estáticas
│
├── postman/                      # 📮 Colecciones de Postman
│
├── app.js                        # 🚀 Configuración principal de Express
├── .env                          # 🔐 Variables de entorno (NO SUBIR A GIT)
├── .env.example                  # 📋 Plantilla de variables
├── .gitignore                    # 🚫 Archivos ignorados por Git
├── package.json                  # 📦 Dependencias y scripts
├── package-lock.json             # 🔒 Lock de dependencias
└── README.md                     # 📖 Este archivo
```

### Flujo de Datos por Capas

```
HTTP Request
     ↓
[Route] → Define endpoint y método HTTP
     ↓
[Middleware] → auth.middleware → Verifica JWT
     ↓         roleValidation → Valida permisos
     ↓         rateLimiter → Previene abuso
     ↓
[Controller] → Parsea request, valida datos
     ↓          Llama al servicio correspondiente
     ↓
[Service] → Lógica de negocio compleja
     ↓       Transacciones de BD
     ↓       Llamadas a APIs externas (MP, Email)
     ↓
[Model] → Interacción con PostgreSQL vía Sequelize
     ↓     Validaciones a nivel de BD
     ↓
[PostgreSQL]
     ↓
Response (JSON)
```

---

## 🗄️ Modelos de Base de Datos

### Modelo de Relaciones

```
Usuario (id_usuario)
   ├─── 1:N ───> Inversion
   ├─── 1:N ───> Puja
   ├─── 1:N ───> Transaccion
   ├─── 1:N ───> SuscripcionProyecto
   ├─── 1:N ───> Mensaje (como remitente y receptor)
   ├─── 1:N ───> Favorito
   ├─── 1:1 ───> VerificacionIdentidad
   └─── 1:1 ───> ResumenCuenta

Proyecto (id_proyecto)
   ├─── 1:N ───> Inversion
   ├─── 1:N ───> Puja
   ├─── 1:N ───> Lote
   ├─── 1:N ───> SuscripcionProyecto
   ├─── 1:N ───> Imagen
   ├─── 1:N ───> Favorito
   └─── 1:N ───> Contrato

Transaccion (id_transaccion)
   └─── 1:1 ───> PagoMercado

Inversion (id_inversion)
   └─── 1:1 ───> Transaccion

Puja (id_puja)
   └─── 1:1 ───> Transaccion

SuscripcionProyecto (id_suscripcion_proyecto)
   └─── 1:N ───> Pago (CuotaMensual)

Contrato (id_contrato)
   ├─── 1:N ───> ContratoFirmado
   └─── N:1 ───> ContratoPlantilla
```

### Modelo Usuario

```javascript
// models/usuario.js
{
  id_usuario: INTEGER (PK, AUTO_INCREMENT),
  email: STRING(100) UNIQUE NOT NULL,
  password: STRING(255) NOT NULL, // Hash bcrypt
  nombre: STRING(100) NOT NULL,
  apellido: STRING(100),
  telefono: STRING(20),
  rol: ENUM('admin', 'usuario', 'inversionista') DEFAULT 'usuario',
  saldo_general: DECIMAL(15,2) DEFAULT 0.00,
  saldo_a_favor_general: DECIMAL(15,2) DEFAULT 0.00,
  email_confirmado: BOOLEAN DEFAULT false,
  token_confirmacion: STRING(255),
  fecha_confirmacion: DATE,
  fecha_registro: DATE DEFAULT NOW,
  activo: BOOLEAN DEFAULT true,
  two_fa_secret: STRING(255), // Para 2FA
  two_fa_enabled: BOOLEAN DEFAULT false,
  kyc_verificado: BOOLEAN DEFAULT false
}
```

### Modelo Proyecto

```javascript
// models/proyecto.js
{
  id_proyecto: INTEGER (PK, AUTO_INCREMENT),
  nombre: STRING(255) NOT NULL,
  descripcion: TEXT,
  monto_objetivo: DECIMAL(15,2) NOT NULL,
  monto_recaudado: DECIMAL(15,2) DEFAULT 0.00,
  tokens_totales: INTEGER NOT NULL,
  tokens_vendidos: INTEGER DEFAULT 0,
  precio_token: DECIMAL(10,2) NOT NULL,
  ubicacion: STRING(255),
  latitud: DECIMAL(10,8),
  longitud: DECIMAL(11,8),
  fecha_inicio: DATE,
  fecha_fin: DATE,
  estado: ENUM('pendiente', 'activo', 'finalizado', 'cancelado') DEFAULT 'pendiente',
  tipo_proyecto: ENUM('inversion_directa', 'subasta', 'suscripcion'),
  fecha_inicio_subasta: DATE,
  fecha_fin_subasta: DATE,
  puja_minima: DECIMAL(15,2),
  incremento_minimo: DECIMAL(15,2),
  imagen_principal: STRING(500),
  categoria: STRING(100),
  destacado: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Inversión

```javascript
// models/inversion.js
{
  id_inversion: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  id_proyecto: INTEGER (FK → Proyecto),
  id_lote: INTEGER (FK → Lote) NULLABLE,
  monto_invertido: DECIMAL(15,2) NOT NULL,
  tokens_adquiridos: INTEGER NOT NULL,
  fecha_inversion: DATE DEFAULT NOW,
  estado_inversion: ENUM('pendiente', 'confirmada', 'cancelada', 'reembolsada') DEFAULT 'pendiente',
  metodo_pago: ENUM('mercadopago', 'transferencia', 'saldo'),
  id_transaccion: INTEGER (FK → Transaccion),
  retorno_esperado: DECIMAL(5,2),
  fecha_retorno_estimada: DATE,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Puja

```javascript
// models/puja.js
{
  id_puja: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  id_proyecto: INTEGER (FK → Proyecto),
  monto_ofrecido: DECIMAL(15,2) NOT NULL,
  fecha_puja: DATE DEFAULT NOW,
  estado_puja: ENUM('activa', 'ganadora', 'perdedora', 'pagada', 'cancelada') DEFAULT 'activa',
  id_transaccion: INTEGER (FK → Transaccion),
  es_puja_automatica: BOOLEAN DEFAULT false,
  monto_maximo_autobid: DECIMAL(15,2),
  fecha_vencimiento_pago: DATE,
  notificacion_enviada: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Transacción

```javascript
// models/transaccion.js
{
  id_transaccion: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  monto: DECIMAL(15,2) NOT NULL,
  tipo_transaccion: ENUM('inversion', 'puja', 'suscripcion', 'retiro', 'recarga', 'cuota_mensual'),
  estado_transaccion: ENUM('pendiente', 'en_proceso', 'completada', 'fallida', 'cancelada', 'expirada', 'reembolsada') DEFAULT 'pendiente',
  metodo_pago: ENUM('mercadopago', 'transferencia', 'saldo'),
  fecha_creacion: DATE DEFAULT NOW,
  fecha_actualizacion: DATE,
  descripcion: TEXT,
  referencia_externa: STRING(255), // ID de Mercado Pago
  modelo_asociado: STRING(50), // 'inversion', 'puja', 'suscripcion'
  id_modelo_asociado: INTEGER,
  ip_origen: STRING(45),
  user_agent: TEXT,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo PagoMercado

```javascript
// models/pagoMercado.js
{
  id_pago_mercado: INTEGER (PK, AUTO_INCREMENT),
  id_transaccion: INTEGER (FK → Transaccion) UNIQUE,
  id_transaccion_pasarela: STRING(255) UNIQUE, // payment_id de MP
  preference_id: STRING(255),
  collection_id: STRING(255),
  collection_status: STRING(50),
  payment_type: STRING(50),
  merchant_order_id: STRING(255),
  external_reference: STRING(255),
  processing_mode: STRING(50),
  fecha_pago: DATE,
  monto_pagado: DECIMAL(15,2),
  estado_pago: ENUM('pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back') DEFAULT 'pending',
  webhook_data: JSON, // Datos completos del webhook
  signature_validated: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo SuscripcionProyecto

```javascript
// models/suscripcion_proyecto.js
{
  id_suscripcion_proyecto: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  id_proyecto: INTEGER (FK → Proyecto),
  fecha_inicio: DATE NOT NULL,
  fecha_fin: DATE,
  meses_a_pagar: INTEGER NOT NULL,
  monto_mensual: DECIMAL(15,2) NOT NULL,
  monto_total: DECIMAL(15,2),
  estado_suscripcion: ENUM('activa', 'pausada', 'cancelada', 'finalizada') DEFAULT 'activa',
  saldo_a_favor: DECIMAL(15,2) DEFAULT 0.00,
  pagos_realizados: INTEGER DEFAULT 0,
  pagos_pendientes: INTEGER,
  fecha_proximo_pago: DATE,
  tokens_acumulados: INTEGER DEFAULT 0,
  auto_renovacion: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Pago (CuotaMensual)

```javascript
// models/pago.js y CuotaMensual.js (mismo concepto)
{
  id_pago: INTEGER (PK, AUTO_INCREMENT),
  id_suscripcion_proyecto: INTEGER (FK → SuscripcionProyecto),
  id_transaccion: INTEGER (FK → Transaccion) NULLABLE,
  monto: DECIMAL(15,2) NOT NULL,
  fecha_vencimiento: DATE NOT NULL,
  fecha_pago: DATE,
  estado_pago: ENUM('pendiente', 'pagado', 'vencido', 'cancelado') DEFAULT 'pendiente',
  numero_cuota: INTEGER,
  notificacion_enviada: BOOLEAN DEFAULT false,
  dias_mora: INTEGER DEFAULT 0,
  interes_mora: DECIMAL(10,2) DEFAULT 0.00,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Contrato

```javascript
// models/contrato.js
{
  id_contrato: INTEGER (PK, AUTO_INCREMENT),
  id_proyecto: INTEGER (FK → Proyecto) NULLABLE,
  id_usuario: INTEGER (FK → Usuario) NULLABLE,
  titulo: STRING(255) NOT NULL,
  contenido: TEXT,
  ruta_archivo: STRING(500),
  tipo_contrato: ENUM('inversion', 'suscripcion', 'puja', 'servicio', 'general'),
  version: STRING(10),
  estado: ENUM('borrador', 'activo', 'archivado') DEFAULT 'activo',
  fecha_creacion: DATE DEFAULT NOW,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo ContratoPlantilla

```javascript
// models/ContratoPlantilla.js
{
  id_plantilla: INTEGER (PK, AUTO_INCREMENT),
  nombre_plantilla: STRING(255) NOT NULL,
  descripcion: TEXT,
  contenido_plantilla: TEXT NOT NULL, // Con variables {{variable}}
  tipo_contrato: ENUM('inversion', 'suscripcion', 'puja', 'servicio', 'general'),
  variables_disponibles: JSON, // ["{{nombre_usuario}}", "{{monto}}", etc.]
  version: STRING(10),
  activa: BOOLEAN DEFAULT true,
  fecha_creacion: DATE DEFAULT NOW,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo ContratoFirmado

```javascript
// models/ContratoFirmado.js
{
  id_contrato_firmado: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  id_proyecto: INTEGER (FK → Proyecto) NULLABLE,
  id_inversion: INTEGER (FK → Inversion) NULLABLE,
  id_puja: INTEGER (FK → Puja) NULLABLE,
  id_suscripcion: INTEGER (FK → SuscripcionProyecto) NULLABLE,
  id_plantilla: INTEGER (FK → ContratoPlantilla) NULLABLE,
  contenido_final: TEXT NOT NULL, // Plantilla con variables reemplazadas
  hash_documento: STRING(64), // SHA-256
  ruta_pdf: STRING(500),
  fecha_firma: DATE DEFAULT NOW,
  ip_firma: STRING(45),
  estado: ENUM('firmado', 'anulado', 'expirado') DEFAULT 'firmado',
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Lote

```javascript
// models/lote.js
{
  id_lote: INTEGER (PK, AUTO_INCREMENT),
  id_proyecto: INTEGER (FK → Proyecto),
  nombre_lote: STRING(255) NOT NULL,
  descripcion: TEXT,
  tokens_disponibles: INTEGER NOT NULL,
  tokens_vendidos: INTEGER DEFAULT 0,
  precio_por_token: DECIMAL(10,2) NOT NULL,
  estado_lote: ENUM('disponible', 'agotado', 'reservado', 'inactivo') DEFAULT 'disponible',
  orden: INTEGER DEFAULT 0,
  destacado: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Mensaje

```javascript
// models/mensaje.js
{
  id_mensaje: INTEGER (PK, AUTO_INCREMENT),
  id_remitente: INTEGER (FK → Usuario),
  id_receptor: INTEGER (FK → Usuario),
  asunto: STRING(255),
  contenido: TEXT NOT NULL,
  leido: BOOLEAN DEFAULT false,
  fecha_envio: DATE DEFAULT NOW,
  fecha_lectura: DATE,
  tipo_mensaje: ENUM('normal', 'sistema', 'notificacion', 'alerta'),
  relacionado_con: STRING(50), // 'proyecto', 'inversion', etc.
  id_relacionado: INTEGER,
  archivado: BOOLEAN DEFAULT false,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Imagen

```javascript
// models/imagen.js
{
  id_imagen: INTEGER (PK, AUTO_INCREMENT),
  id_proyecto: INTEGER (FK → Proyecto),
  ruta_imagen: STRING(500) NOT NULL,
  nombre_original: STRING(255),
  tipo_imagen: ENUM('principal', 'galeria', 'documento'),
  descripcion: TEXT,
  orden: INTEGER DEFAULT 0,
  tamaño_bytes: INTEGER,
  ancho: INTEGER,
  alto: INTEGER,
  formato: STRING(10),
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo Favorito

```javascript
// models/Favorito.js
{
  id_favorito: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario),
  id_proyecto: INTEGER (FK → Proyecto),
  fecha_agregado: DATE DEFAULT NOW,
  notificaciones_activas: BOOLEAN DEFAULT true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
  
  // Índice único compuesto
  UNIQUE(id_usuario, id_proyecto)
}
```

### Modelo ResumenCuenta

```javascript
// models/resumen_cuenta.js
{
  id_resumen: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario) UNIQUE,
  total_invertido: DECIMAL(15,2) DEFAULT 0.00,
  total_ganado: DECIMAL(15,2) DEFAULT 0.00,
  inversiones_activas: INTEGER DEFAULT 0,
  proyectos_participando: INTEGER DEFAULT 0,
  pujas_ganadas: INTEGER DEFAULT 0,
  pujas_activas: INTEGER DEFAULT 0,
  suscripciones_activas: INTEGER DEFAULT 0,
  pagos_pendientes: INTEGER DEFAULT 0,
  rendimiento_promedio: DECIMAL(5,2),
  ultima_actualizacion: DATE,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo VerificacionIdentidad

```javascript
// models/verificacion_identidad.js
{
  id_verificacion: INTEGER (PK, AUTO_INCREMENT),
  id_usuario: INTEGER (FK → Usuario) UNIQUE,
  tipo_documento: ENUM('DNI', 'pasaporte', 'licencia_conducir'),
  numero_documento: STRING(50),
  pais_emision: STRING(3), // Código ISO
  fecha_emision: DATE,
  fecha_vencimiento: DATE,
  ruta_documento_frontal: STRING(500),
  ruta_documento_dorso: STRING(500),
  ruta_selfie: STRING(500),
  estado_verificacion: ENUM('pendiente', 'en_revision', 'aprobado', 'rechazado') DEFAULT 'pendiente',
  fecha_solicitud: DATE DEFAULT NOW,
  fecha_verificacion: DATE,
  motivo_rechazo: TEXT,
  verificado_por: INTEGER (FK → Usuario) NULLABLE, // Admin que verificó
  nivel_confianza: INTEGER, // 0-100
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

### Modelo SuscripcionCancelada

```javascript
// models/suscripcion_cancelada.js
{
  id_cancelacion: INTEGER (PK, AUTO_INCREMENT),
  id_suscripcion_proyecto: INTEGER (FK → SuscripcionProyecto),
  id_usuario: INTEGER (FK → Usuario),
  fecha_cancelacion: DATE DEFAULT NOW,
  motivo_cancelacion: TEXT,
  monto_reembolsado: DECIMAL(15,2) DEFAULT 0.00,
  pagos_realizados_antes_cancelacion: INTEGER,
  saldo_restante: DECIMAL(15,2),
  cancelado_por: ENUM('usuario', 'sistema', 'admin'),
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP
}
```

---

## 📡 API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Autenticación Global
La mayoría de los endpoints requieren autenticación JWT. Incluye el token en el header:

```http
Authorization: Bearer {tu_token_jwt}
```

---

## 🔐 Autenticación y Usuarios

### Auth Endpoints

#### **POST** `/api/auth/register`
Registrar nuevo usuario.

**Request Body:**
```json
{
  "email": "usuario@example.com",
  "password": "Password123!",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "+54911234567"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "usuario": {
      "id_usuario": 1,
      "email": "usuario@example.com",
      "nombre": "Juan",
      "rol": "usuario"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "Usuario registrado exitosamente. Revisa tu email para confirmar."
}
```

---

#### **POST** `/api/auth/login`
Iniciar sesión.

**Request Body:**
```json
{
  "email": "usuario@example.com",
  "password": "Password123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "suscripciones": [
      {
        "id_suscripcion_proyecto": 1,
        "id_proyecto": 3,
        "proyecto": {
          "nombre": "Olivares Mediterráneos",
          "imagen_principal": "https://..."
        },
        "fecha_inicio": "2025-01-01",
        "fecha_fin": "2025-12-31",
        "meses_a_pagar": 12,
        "monto_mensual": 2500.00,
        "monto_total": 30000.00,
        "estado_suscripcion": "activa",
        "saldo_a_favor": 0.00,
        "pagos_realizados": 3,
        "pagos_pendientes": 9,
        "fecha_proximo_pago": "2025-04-01",
        "tokens_acumulados": 150,
        "auto_renovacion": true
      }
    ]
  }
}
```

---

#### **GET** `/api/suscripcion-proyecto/:id`
Obtener suscripción específica.

---

#### **POST** `/api/suscripcion-proyecto`
Crear nueva suscripción.

**Request Body:**
```json
{
  "id_proyecto": 3,
  "meses_a_pagar": 12,
  "monto_mensual": 2500.00,
  "auto_renovacion": true
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "suscripcion": {
      "id_suscripcion_proyecto": 1,
      "estado_suscripcion": "activa",
      "fecha_proximo_pago": "2025-02-01"
    },
    "cuotas_generadas": 12
  },
  "message": "Suscripción creada exitosamente. Primera cuota generada."
}
```

---

#### **PUT** `/api/suscripcion-proyecto/:id/cancelar`
Cancelar suscripción.

**Request Body:**
```json
{
  "motivo": "Ya no puedo continuar con los pagos"
}
```

---

#### **PUT** `/api/suscripcion-proyecto/:id/pausar`
Pausar suscripción temporalmente.

---

#### **PUT** `/api/suscripcion-proyecto/:id/reanudar`
Reanudar suscripción pausada.

---

## 💳 Pagos y Cuotas

#### **GET** `/api/pagos`
Listar cuotas mensuales del usuario.

**Query Params:**
```
?estado_pago=pendiente&id_suscripcion=1
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pagos": [
      {
        "id_pago": 1,
        "id_suscripcion_proyecto": 1,
        "monto": 2500.00,
        "fecha_vencimiento": "2025-02-01",
        "estado_pago": "pendiente",
        "numero_cuota": 2,
        "dias_mora": 0,
        "proyecto": {
          "nombre": "Olivares Mediterráneos"
        }
      }
    ],
    "resumen": {
      "pendientes": 9,
      "pagados": 3,
      "vencidos": 0,
      "total_pendiente": 22500.00
    }
  }
}
```

---

#### **GET** `/api/pagos/:id`
Obtener cuota específica.

---

#### **POST** `/api/pagos/:id/pagar`
Pagar cuota mensual.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
  },
  "message": "Redirigiendo a Mercado Pago."
}
```

---

#### **GET** `/api/cuotas-mensuales`
Alias para `/api/pagos` (misma funcionalidad).

---

## 📄 Contratos

#### **GET** `/api/contratos`
Listar contratos del usuario autenticado.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "contratos": [
      {
        "id_contrato_firmado": 1,
        "id_proyecto": 1,
        "proyecto": {
          "nombre": "Cultivo de Arándanos"
        },
        "tipo_contrato": "inversion",
        "fecha_firma": "2025-01-15T14:30:00Z",
        "hash_documento": "a3b2c1d4e5f6...",
        "estado": "firmado",
        "puede_descargar": true
      }
    ]
  }
}
```

---

#### **GET** `/api/contratos/:id`
Obtener detalles de contrato.

---

#### **GET** `/api/contratos/:id/descargar`
Descargar PDF del contrato.

**Response:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="contrato_123.pdf"

[Archivo PDF binario]
```

---

#### **POST** `/api/contratos/plantilla`
Crear plantilla de contrato (Solo Admin).

**Request Body:**
```json
{
  "nombre_plantilla": "Contrato de Inversión Directa v2",
  "tipo_contrato": "inversion",
  "contenido_plantilla": "CONTRATO DE INVERSIÓN\n\nEntre {{nombre_usuario}} y Nectárea...",
  "variables_disponibles": [
    "{{nombre_usuario}}",
    "{{email_usuario}}",
    "{{nombre_proyecto}}",
    "{{monto_inversion}}",
    "{{tokens_adquiridos}}",
    "{{fecha_firma}}"
  ]
}
```

---

#### **GET** `/api/contratos/plantilla`
Listar plantillas de contratos (Solo Admin).

---

#### **POST** `/api/contratos/generar`
Generar contrato desde plantilla (Sistema).

**Request Body:**
```json
{
  "id_plantilla": 1,
  "id_usuario": 5,
  "id_proyecto": 1,
  "id_inversion": 10,
  "variables": {
    "nombre_usuario": "Juan Pérez",
    "email_usuario": "juan@example.com",
    "nombre_proyecto": "Cultivo de Arándanos",
    "monto_inversion": "5000.00",
    "tokens_adquiridos": "100",
    "fecha_firma": "15/01/2025"
  }
}
```

---

## 💬 Mensajes

#### **GET** `/api/mensajes`
Listar mensajes del usuario.

**Query Params:**
```
?tipo=recibidos&leido=false&page=1&limit=20
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "mensajes": [
      {
        "id_mensaje": 1,
        "remitente": {
          "id_usuario": 2,
          "nombre": "Soporte Nectárea"
        },
        "asunto": "Bienvenido a Nectárea",
        "contenido": "Gracias por registrarte...",
        "leido": false,
        "fecha_envio": "2025-01-15T10:00:00Z",
        "tipo_mensaje": "sistema"
      }
    ],
    "no_leidos": 5
  }
}
```

---

#### **GET** `/api/mensajes/:id`
Obtener mensaje específico (marca como leído).

---

#### **POST** `/api/mensajes`
Enviar mensaje.

**Request Body:**
```json
{
  "id_receptor": 2,
  "asunto": "Consulta sobre proyecto",
  "contenido": "Hola, quisiera más información sobre..."
}
```

---

#### **PUT** `/api/mensajes/:id/leer`
Marcar mensaje como leído.

---

#### **DELETE** `/api/mensajes/:id`
Archivar mensaje.

---

## ⭐ Favoritos

#### **GET** `/api/favoritos`
Listar proyectos favoritos del usuario.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "favoritos": [
      {
        "id_favorito": 1,
        "proyecto": {
          "id_proyecto": 1,
          "nombre": "Cultivo de Arándanos",
          "imagen_principal": "https://...",
          "monto_objetivo": 500000.00,
          "monto_recaudado": 250000.00,
          "estado": "activo"
        },
        "fecha_agregado": "2025-01-10",
        "notificaciones_activas": true
      }
    ]
  }
}
```

---

#### **POST** `/api/favoritos`
Agregar proyecto a favoritos.

**Request Body:**
```json
{
  "id_proyecto": 1,
  "notificaciones_activas": true
}
```

---

#### **DELETE** `/api/favoritos/:id`
Eliminar de favoritos.

---

#### **PUT** `/api/favoritos/:id/notificaciones`
Activar/desactivar notificaciones.

**Request Body:**
```json
{
  "notificaciones_activas": false
}
```

---

## 🖼️ Imágenes

#### **GET** `/api/imagenes/proyecto/:id_proyecto`
Listar imágenes de un proyecto.

---

#### **POST** `/api/imagenes/proyecto/:id_proyecto`
Subir imagen a proyecto (Solo Admin).

**Request (multipart/form-data):**
```
imagen: [archivo]
tipo_imagen: "galeria"
descripcion: "Vista del cultivo"
orden: 1
```

---

#### **DELETE** `/api/imagenes/:id`
Eliminar imagen (Solo Admin).

---

## 🔍 Verificación KYC

#### **GET** `/api/kyc`
Obtener estado de verificación del usuario.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "verificacion": {
      "id_verificacion": 1,
      "tipo_documento": "DNI",
      "estado_verificacion": "aprobado",
      "fecha_verificacion": "2025-01-20",
      "nivel_confianza": 95
    }
  }
}
```

---

#### **POST** `/api/kyc/solicitar`
Solicitar verificación de identidad.

**Request (multipart/form-data):**
```
tipo_documento: "DNI"
numero_documento: "12345678"
pais_emision: "ARG"
fecha_emision: "2020-01-15"
fecha_vencimiento: "2030-01-15"
documento_frontal: [archivo]
documento_dorso: [archivo]
selfie: [archivo]
```

---

#### **GET** `/api/kyc/pendientes`
Listar solicitudes pendientes (Solo Admin).

---

#### **PUT** `/api/kyc/:id/aprobar`
Aprobar verificación (Solo Admin).

---

#### **PUT** `/api/kyc/:id/rechazar`
Rechazar verificación (Solo Admin).

**Request Body:**
```json
{
  "motivo_rechazo": "La imagen del documento está borrosa"
}
```

---

## 💵 Transacciones

#### **GET** `/api/transacciones`
Listar transacciones del usuario.

**Query Params:**
```
?tipo_transaccion=inversion&estado_transaccion=completada&page=1&limit=20
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transacciones": [
      {
        "id_transaccion": 1,
        "monto": 5000.00,
        "tipo_transaccion": "inversion",
        "estado_transaccion": "completada",
        "metodo_pago": "mercadopago",
        "fecha_creacion": "2025-01-15T10:30:00Z",
        "descripcion": "Inversión en Cultivo de Arándanos",
        "referencia_externa": "123456789"
      }
    ],
    "resumen": {
      "total_transacciones": 50,
      "completadas": 45,
      "pendientes": 3,
      "fallidas": 2
    }
  }
}
```

---

#### **GET** `/api/transacciones/:id`
Obtener transacción específica.

---

## 📊 Resumen de Cuenta

#### **GET** `/api/resumen-cuenta`
Obtener resumen financiero del usuario.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "resumen": {
      "saldo_general": 15000.50,
      "saldo_a_favor_general": 500.00,
      "total_invertido": 75000.00,
      "total_ganado": 8250.00,
      "inversiones_activas": 5,
      "proyectos_participando": 3,
      "pujas_ganadas": 2,
      "pujas_activas": 1,
      "suscripciones_activas": 2,
      "pagos_pendientes": 3,
      "rendimiento_promedio": 11.5,
      "ultima_actualizacion": "2025-01-25T08:00:00Z"
    },
    "inversiones_por_estado": {
      "confirmadas": 5,
      "pendientes": 0,
      "canceladas": 1
    },
    "proximos_pagos": [
      {
        "descripcion": "Cuota Olivares Mediterráneos",
        "monto": 2500.00,
        "fecha_vencimiento": "2025-02-01"
      }
    ]
  }
}
```

---

## 💳 Sistema de Pagos con Mercado Pago

### Flujo Completo de Pago

```
┌─────────────────────────────────────────────────────────────┐
│  1. USUARIO CREA INVERSIÓN/PUJA/SUSCRIPCIÓN                 │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  2. BACKEND CREA TRANSACCIÓN (estado: pendiente)            │
│     • Genera id_transaccion                                  │
│     • Asocia con modelo (inversion/puja/suscripcion)        │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  3. POST /api/payment/checkout                              │
│     • Crea preferencia en Mercado Pago                      │
│     • Configura URLs de redirección                         │
│     • Genera external_reference = id_transaccion            │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  4. FRONTEND REDIRIGE A MP (init_point)                     │
│     Usuario completa el pago en Mercado Pago                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  5. MERCADO PAGO PROCESA PAGO                               │
│     • Aprobado / Rechazado / Pendiente                      │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  6. MP ENVÍA WEBHOOK                                        │
│     POST /api/payment/webhook/mercadopago                   │
│     Headers:                                                 │
│       • x-signature                                         │
│       • x-request-id                                        │
│     Body:                                                    │
│       • action: payment.updated                             │
│       • data.id: {payment_id}                               │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  7. BACKEND VALIDA FIRMA HMAC-SHA256                        │
│     • Extrae ts, signature                                  │
│     • Construye manifest                                    │
│     • Calcula HMAC con MP_WEBHOOK_SECRET                    │
│     • Compara con x-signature                               │
│     ✅ Válido: continúa                                      │
│     ❌ Inválido: responde 401                               │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  8. BACKEND CONSULTA PAGO EN MP API                         │
│     GET /v1/payments/{payment_id}                           │
│     • Obtiene status, amount, etc.                          │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  9. BACKEND PROCESA SEGÚN ESTADO                            │
│     Si status === "approved":                               │
│       • Actualiza Transaccion → completada                  │
│       • Actualiza PagoMercado                               │
│       • Confirma Inversion/Puja/Suscripcion                 │
│       • Actualiza tokens del Proyecto                       │
│       • Genera ContratoFirmado                              │
│       • Actualiza ResumenCuenta                             │
│       • Envía email de confirmación                         │
│     Si status === "rejected":                               │
│       • Actualiza Transaccion → fallida                     │
│       • Libera recursos (tokens, cupos)                     │
│       • Envía email de fallo                                │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  10. MP REDIRIGE AL USUARIO                                 │
│      • Éxito: FRONTEND_URL/pago-exitoso?id={transaccion}   │
│      • Fallo: FRONTEND_URL/pago-fallido?id={transaccion}   │
└────────────────────────┬────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  11. FRONTEND CONSULTA ESTADO                               │
│      GET /api/payment/status/{id_transaccion}               │
│      Muestra resultado al usuario                           │
└─────────────────────────────────────────────────────────────┘
```

---

### Endpoints de Pagos

#### **POST** `/api/payment/checkout`
Crear preferencia de pago en Mercado Pago.

**Request Body:**
```json
{
  "id_transaccion": 123,
  "titulo": "Inversión en Cultivo de Arándanos",
  "descripcion": "Compra de 100 tokens",
  "monto": 5000.00
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "preference_id": "123456789-abc-def-ghi",
    "init_point": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789",
    "sandbox_init_point": "https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789"
  }
}
```

---

#### **POST** `/api/payment/webhook/mercadopago`
Webhook de notificaciones de Mercado Pago (llamado por MP, no por frontend).

**Headers requeridos:**
```
x-signature: ts=1234567890,v1=abc123def456...
x-request-id: unique-request-id
```

**Request Body:**
```json
{
  "action": "payment.updated",
  "api_version": "v1",
  "data": {
    "id": "123456789"
  },
  "date_created": "2025-01-15T10:30:00Z",
  "id": 123456,
  "live_mode": false,
  "type": "payment",
  "user_id": "987654321"
}
```

**Proceso de Validación:**

```javascript
// 1. Extraer headers
const xSignature = req.headers['x-signature'];
const xRequestId = req.headers['x-request-id'];
const dataId = req.body.data.id;

// 2. Parsear x-signature
const parts = xSignature.split(',');
const ts = parts.find(p => p.startsWith('ts=')).split('=')[1];
const hash = parts.find(p => p.startsWith('v1=')).split('=')[1];

// 3. Construir manifest
const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

// 4. Calcular HMAC-SHA256
const crypto = require('crypto');
const expectedHash = crypto
  .createHmac('sha256', process.env.MP_WEBHOOK_SECRET)
  .update(manifest)
  .digest('hex');

// 5. Comparar
if (expectedHash !== hash) {
  return res.status(401).json({ error: 'Invalid signature' });
}

// 6. Si es válido, procesar pago...
```

**Response (200):**
```json
{
  "success": true,
  "message": "Webhook procesado correctamente"
}
```

---

#### **GET** `/api/payment/status/:id_transaccion`
Consultar estado de una transacción.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaccion": {
      "id_transaccion": 123,
      "estado_transaccion": "completada",
      "monto": 5000.00,
      "fecha_creacion": "2025-01-15T10:00:00Z",
      "fecha_actualizacion": "2025-01-15T10:35:00Z"
    },
    "pago_mercado": {
      "id_transaccion_pasarela": "123456789",
      "estado_pago": "approved",
      "fecha_pago": "2025-01-15T10:35:00Z"
    },
    "modelo_asociado": {
      "tipo": "inversion",
      "id": 45,
      "estado": "confirmada"
    }
  }
}
```

---

#### **POST** `/api/payment/:modelo/:modeloId`
Iniciar pago genérico para cualquier modelo.

**Parámetros:**
- `modelo`: 'inversion' | 'puja' | 'cuota' | 'recarga'
- `modeloId`: ID del registro

**Ejemplo:**
```
POST /api/payment/inversion/45
POST /api/payment/puja/12
POST /api/payment/cuota/67
```

---

### Redirecciones Post-Pago

#### **GET** `/api/redirection/success`
Maneja redirección de pago exitoso.

**Query Params:**
```
?collection_id=123456789
&collection_status=approved
&payment_id=123456789
&status=approved
&external_reference=123
&payment_type=credit_card
&merchant_order_id=987654321
&preference_id=abc-123-def
&site_id=MLA
&processing_mode=aggregator
&merchant_account_id=null
```

**Response:**
Redirige a `FRONTEND_URL/pago-exitoso?id_transaccion=123`

---

#### **GET** `/api/redirection/failure`
Maneja redirección de pago fallido.

**Response:**
Redirige a `FRONTEND_URL/pago-fallido?id_transaccion=123`

---

#### **GET** `/api/redirection/pending`
Maneja redirección de pago pendiente.

**Response:**
Redirige a `FRONTEND_URL/pago-pendiente?id_transaccion=123`

---

### Configuración de Mercado Pago

#### En el Dashboard de Mercado Pago:

1. **Obtener Credenciales:**
   - Panel de Desarrolladores → Credenciales
   - Copia `Access Token` (Producción o Test)
   - Agrega a `.env` como `MP_ACCESS_TOKEN`

2. **Configurar Webhook:**
   - Panel → Integraciones → Webhooks
   - URL: `https://tu-dominio.com/api/payment/webhook/mercadopago`
   - Eventos: ✅ **Solo "Pagos" (payments)**
   - Copia el `Secret Key`
   - Agrega a `.env` como `MP_WEBHOOK_SECRET`

3. **Configurar URLs de Redirección:**
   - Ya están configuradas en el código
   - Variables de entorno:
     ```
     MP_SUCCESS_URL=https://tu-frontend.com/pago-exitoso
     MP_FAILURE_URL=https://tu-frontend.com/pago-fallido
     MP_PENDING_URL=https://tu-frontend.com/pago-pendiente
     ```

---

### Estados de Pago en Mercado Pago

| Estado | Descripción | Acción del Backend |
|--------|-------------|-------------------|
| `pending` | Pago pendiente de procesamiento | Mantener transacción en "pendiente" |
| `approved` | Pago aprobado ✅ | Confirmar operación, generar contrato |
| `authorized` | Pago autorizado, falta captura | Esperar captura |
| `in_process` | En proceso de revisión | Mantener en "en_proceso" |
| `in_mediation` | En disputa/mediación | Mantener, notificar admin |
| `rejected` | Pago rechazado ❌ | Marcar como "fallida", liberar recursos |
| `cancelled` | Pago cancelado por usuario | Marcar como "cancelada" |
| `refunded` | Pago reembolsado | Revertir operación, actualizar saldos |
| `charged_back` | Contracargo | Revertir, notificar admin |

---

## ⏰ Tareas Programadas (Cron Jobs)

El sistema cuenta con **11 tareas automatizadas** que se ejecutan periódicamente usando `node-cron`:

### 1. Generación Mensual de Cuotas
**Archivo:** `tasks/monthlyPaymentGenerationTask.js`

**Programación:** `0 0 1 * *` (Día 1 de cada mes a las 00:00)

**Función:**
- Genera automáticamente las cuotas mensuales de todas las suscripciones activas
- Crea registros en la tabla `Pago` con estado "pendiente"
- Calcula fecha de vencimiento (generalmente 5 días después)
- Envía email recordatorio al usuario

**Código relevante:**
```javascript
cron.schedule('0 0 1 * *', async () => {
  console.log('Iniciando generación de cuotas mensuales...');
  
  const suscripcionesActivas = await SuscripcionProyecto.findAll({
    where: { estado_suscripcion: 'activa' }
  });
  
  for (const suscripcion of suscripcionesActivas) {
    await Pago.create({
      id_suscripcion_proyecto: suscripcion.id,
      monto: suscripcion.monto_mensual,
      fecha_vencimiento: new Date(Date.now() + 5*24*60*60*1000),
      estado_pago: 'pendiente',
      numero_cuota: suscripcion.pagos_realizados + 1
    });
    
    await emailService.enviarRecordatorioPago(suscripcion);
  }
});
```

---

### 2. Recordatorios de Pago
**Archivo:** `tasks/paymentReminderScheduler.js`

**Programación:** `0 9 * * *` (Diario a las 09:00)

**Función:**
- Revisa todos los pagos con vencimiento en los próximos 3 días
- Envía emails recordatorios a los usuarios
- Marca que la notificación fue enviada para evitar duplicados

**Código relevante:**
```javascript
cron.schedule('0 9 * * *', async () => {
  console.log('Enviando recordatorios de pago...');
  
  const tresDiasDesdeAhora = new Date(Date.now() + 3*24*60*60*1000);
  
  const pagosPorVencer = await Pago.findAll({
    where: {
      estado_pago: 'pendiente',
      fecha_vencimiento: { [Op.lte]: tresDiasDesdeAhora },
      notificacion_enviada: false
    },
    include: [
      { model: SuscripcionProyecto, include: [Usuario, Proyecto] }
    ]
  });
  
  for (const pago of pagosPorVencer) {
    await emailService.enviarRecordatorioPago(pago);
    await pago.update({ notificacion_enviada: true });
  }
});
```

---

### 3. Notificador de Pagos Vencidos
**Archivo:** `tasks/OverduePaymentNotifier.js`

**Programación:** `0 10 * * *` (Diario a las 10:00)

**Función:**
- Identifica pagos que ya vencieron (fecha_vencimiento < hoy)
- Actualiza estado a "vencido"
- Calcula días de mora
- Envía email de notificación de mora
- Calcula intereses por mora si aplica

**Código relevante:**
```javascript
cron.schedule('0 10 * * *', async () => {
  const hoy = new Date();
  
  const pagosVencidos = await Pago.findAll({
    where: {
      estado_pago: 'pendiente',
      fecha_vencimiento: { [Op.lt]: hoy }
    },
    include: [SuscripcionProyecto, Usuario]
  });
  
  for (const pago of pagosVencidos) {
    const diasMora = Math.floor((hoy - pago.fecha_vencimiento) / (1000*60*60*24));
    const interesMora = pago.monto * 0.02 * diasMora; // 2% por día
    
    await pago.update({
      estado_pago: 'vencido',
      dias_mora: diasMora,
      interes_mora: interesMora
    });
    
    await emailService.enviarNotificacionMora(pago);
  }
});
```

---

### 4. Gestor de Impagos Severos
**Archivo:** `tasks/OverduePaymentManager.js`

**Programación:** `0 0 * * *` (Diario a las 00:00)

**Función:**
- Detecta pagos con más de 30 días de mora
- Suspende suscripciones con impagos graves
- Notifica al administrador
- Aplica penalizaciones según política

**Código relevante:**
```javascript
cron.schedule('0 0 * * *', async () => {
  const treintaDiasAtras = new Date(Date.now() - 30*24*60*60*1000);
  
  const impagosSeveros = await Pago.findAll({
    where: {
      estado_pago: 'vencido',
      fecha_vencimiento: { [Op.lt]: treintaDiasAtras }
    },
    include: [SuscripcionProyecto]
  });
  
  for (const pago of impagosSeveros) {
    await pago.SuscripcionProyecto.update({
      estado_suscripcion: 'pausada'
    });
    
    await emailService.enviarNotificacionSuspension(pago);
    await emailService.notificarAdminImpago(pago);
  }
});
```

---

### 5. Manejo de Impagos en Pujas
**Archivo:** `tasks/ManejoImpagoPuja.js`

**Programación:** `0 */6 * * *` (Cada 6 horas)

**Función:**
- Revisa pujas ganadoras sin pagar después de 48 horas
- Cancela la puja ganadora
- Selecciona al segundo pujador más alto
- Notifica a ambas partes
- Penaliza al usuario moroso

**Código relevante:**
```javascript
cron.schedule('0 */6 * * *', async () => {
  const limite48h = new Date(Date.now() - 48*60*60*1000);
  
  const pujasImpagas = await Puja.findAll({
    where: {
      estado_puja: 'ganadora',
      fecha_vencimiento_pago: { [Op.lt]: limite48h }
    },
    include: [Proyecto, Usuario]
  });
  
  for (const puja of pujasImpagas) {
    // Cancelar puja actual
    await puja.update({ estado_puja: 'cancelada' });
    
    // Buscar segunda mejor puja
    const segundaPuja = await Puja.findOne({
      where: {
        id_proyecto: puja.id_proyecto,
        estado_puja: 'activa'
      },
      order: [['monto_ofrecido', 'DESC']]
    });
    
    if (segundaPuja) {
      await segundaPuja.update({ estado_puja: 'ganadora' });
      await emailService.notificarNuevoGanador(segundaPuja);
    }
    
    // Penalizar usuario moroso
    await Usuario.update(
      { penalizacion_activa: true },
      { where: { id_usuario: puja.id_usuario } }
    );
  }
});
```

---

### 6. Programador de Subastas
**Archivo:** `tasks/auctionSchedulerTask.js`

**Programación:** `*/15 * * * *` (Cada 15 minutos)

**Función:**
- Inicia subastas que llegaron a su fecha de inicio
- Cierra subastas que llegaron a su fecha de fin
- Determina ganador automáticamente
- Genera transacción de pago para el ganador

**Código relevante:**
```javascript
cron.schedule('*/15 * * * *', async () => {
  const ahora = new Date();
  
  // Iniciar subastas
  await Proyecto.update(
    { estado: 'activo' },
    {
      where: {
        tipo_proyecto: 'subasta',
        estado: 'pendiente',
        fecha_inicio_subasta: { [Op.lte]: ahora }
      }
    }
  );
  
  // Cerrar subastas
  const subastasAFinalizar = await Proyecto.findAll({
    where: {
      tipo_proyecto: 'subasta',
      estado: 'activo',
      fecha_fin_subasta: { [Op.lte]: ahora }
    }
  });
  
  for (const subasta of subastasAFinalizar) {
    const pujaGanadora = await Puja.findOne({
      where: { id_proyecto: subasta.id_proyecto },
      order: [['monto_ofrecido', 'DESC']],
      limit: 1
    });
    
    if (pujaGanadora) {
      await pujaGanadora.update({ estado_puja: 'ganadora' });
      
      // Crear transacción para el pago
      const transaccion = await Transaccion.create({
        id_usuario: pujaGanadora.id_usuario,
        monto: pujaGanadora.monto_ofrecido,
        tipo_transaccion: 'puja',
        estado_transaccion: 'pendiente'
      });
      
      await emailService.notificarGanadorSubasta(pujaGanadora);
    }
    
    await subasta.update({ estado: 'finalizado' });
  }
});
```

---

### 7. Programador de Proyectos
**Archivo:** `tasks/projectScheduler.js`

**Programación:** `0 1 * * *` (Diario a la 01:00)

**Función:**
- Activa proyectos que llegan a su fecha de inicio
- Finaliza proyectos que llegan a su fecha de fin
- Verifica si se cumplió el objetivo de recaudación
- Procesa distribución de tokens finales

**Código relevante:**
```javascript
cron.schedule('0 1 * * *', async () => {
  const hoy = new Date();
  
  // Activar proyectos
  await Proyecto.update(
    { estado: 'activo' },
    {
      where: {
        estado: 'pendiente',
        fecha_inicio: { [Op.lte]: hoy }
      }
    }
  );
  
  // Finalizar proyectos
  const proyectosAFinalizar = await Proyecto.findAll({
    where: {
      estado: 'activo',
      fecha_fin: { [Op.lte]: hoy }
    }
  });
  
  for (const proyecto of proyectosAFinalizar) {
    const objetivoCumplido = proyecto.monto_recaudado >= proyecto.monto_objetivo;
    
    await proyecto.update({
      estado: objetivoCumplido ? 'finalizado' : 'cancelado'
    });
    
    if (!objetivoCumplido) {
      // Reembolsar inversiones
      await procesarReembolsos(proyecto);
    }
    
    await emailService.notificarFinalizacionProyecto(proyecto);
  }
});
```

---

### 8. Verificador de Suscripciones
**Archivo:** `tasks/subscriptionCheckScheduler.js`

**Programación:** `0 2 * * *` (Diario a las 02:00)

**Función:**
- Verifica suscripciones que llegaron a su fecha de fin
- Procesa auto-renovaciones
- Finaliza suscripciones completadas
- Calcula saldo a favor final

**Código relevante:**
```javascript
cron.schedule('0 2 * * *', async () => {
  const hoy = new Date();
  
  const suscripcionesAFinalizar = await SuscripcionProyecto.findAll({
    where: {
      estado_suscripcion: 'activa',
      fecha_fin: { [Op.lte]: hoy }
    }
  });
  
  for (const suscripcion of suscripcionesAFinalizar) {
    if (suscripcion.auto_renovacion) {
      // Renovar por otro período
      await suscripcion.update({
        fecha_fin: new Date(hoy.getTime() + suscripcion.meses_a_pagar * 30*24*60*60*1000),
        pagos_realizados: 0
      });
      
      await emailService.notificarRenovacion(suscripcion);
    } else {
      // Finalizar
      await suscripcion.update({ estado_suscripcion: 'finalizada' });
      
      // Calcular saldo a favor
      if (suscripcion.saldo_a_favor > 0) {
        await Usuario.increment(
          'saldo_a_favor_general',
          {
            by: suscripcion.saldo_a_favor,
            where: { id_usuario: suscripcion.id_usuario }
          }
        );
      }
      
      await emailService.notificarFinalizacionSuscripcion(suscripcion);
    }
  }
});
```

---

### 9. Limpieza de Pagos Cancelados
**Archivo:** `tasks/cleanupCanceledPaymentsTask.js`

**Programación:** `0 3 * * 0` (Domingos a las 03:00)

**Función:**
- Elimina registros de pagos cancelados antiguos (>90 días)
- Limpia preferencias de Mercado Pago expiradas
- Archiva datos en logs para auditoría

**Código relevante:**
```javascript
cron.schedule('0 3 * * 0', async () => {
  const noventaDiasAtras = new Date(Date.now() - 90*24*60*60*1000);
  
  const pagosCancelados = await PagoMercado.findAll({
    where: {
      estado_pago: 'cancelled',
      createdAt: { [Op.lt]: noventaDiasAtras }
    }
  });
  
  for (const pago of pagosCancelados) {
    // Archivar en logs
    await logService.archivar('pagos_cancelados', pago.toJSON());
    
    // Eliminar
    await pago.destroy();
  }
  
  console.log(`Limpiados ${pagosCancelados.length} pagos cancelados antiguos`);
});
```

---

### 10. Limpieza de Usuarios No Confirmados
**Archivo:** `tasks/cleanupUnconfirmedUsersTask.js`

**Programación:** `0 4 * * *` (Diario a las 04:00)

**Función:**
- Elimina usuarios que no confirmaron su email en 7 días
- Limpia datos asociados (tokens, intentos de login)
- Notifica al administrador de usuarios eliminados

**Código relevante:**
```javascript
cron.schedule('0 4 * * *', async () => {
  const sieteDiasAtras = new Date(Date.now() - 7*24*60*60*1000);
  
  const usuariosNoConfirmados = await Usuario.findAll({
    where: {
      email_confirmado: false,
      fecha_registro: { [Op.lt]: sieteDiasAtras }
    }
  });
  
  for (const usuario of usuariosNoConfirmados) {
    await usuario.destroy();
  }
  
  console.log(`Eliminados ${usuariosNoConfirmados.length} usuarios no confirmados`);
});
```

---

### 11. Expiración de Transacciones Antiguas
**Archivo:** `tasks/expireOldTransactions.job.js`

**Programación:** `0 5 * * *` (Diario a las 05:00)

**Función:**
- Marca como expiradas las transacciones pendientes >72 horas
- Libera recursos asociados (tokens reservados, cupos)
- Notifica al usuario de la expiración

**Código relevante:**
```javascript
cron.schedule('0 5 * * *', async () => {
  const setentaYDosDiasAtras = new Date(Date.now() - 72*60*60*1000);
  
  const transaccionesPendientes = await Transaccion.findAll({
    where: {
      estado_transaccion: 'pendiente',
      fecha_creacion: { [Op.lt]: setentaYDosDiasAtras }
    },
    include: [Inversion, Puja]
  });
  
  for (const transaccion of transaccionesPendientes) {
    await transaccion.update({ estado_transaccion: 'expirada' });
    
    // Liberar tokens si es inversión
    if (transaccion.Inversion) {
      await Proyecto.increment(
        'tokens_disponibles',
        {
          by: transaccion.Inversion.tokens_adquiridos,
          where: { id_proyecto: transaccion.Inversion.id_proyecto }
        }
      );
      
      await transaccion.Inversion.update({ estado_inversion: 'cancelada' });
    }
    
    await emailService.notificarExpiracion(transaccion);
  }
});
```

---

## 🔒 Seguridad

### Middleware de Autenticación

#### `auth.middleware.js`
Verifica JWT en cada request protegido.

```javascript
const jwt = require('jsonwebtoken');

module.exports = async (req, res, next) => {
  try {
    // 1. Extraer token del header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // 2. Verificar y decodificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Buscar usuario en BD
    const usuario = await Usuario.findByPk(decoded.id_usuario);
    
    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado o inactivo'
      });
    }
    
    // 4. Adjuntar usuario al request
    req.usuario = usuario;
    next();
    
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(401).json({
      success: false,
      error: 'Token inválido'
    });
  }
};
```

---

#### `checkKYCandTwoFA.js`
Verifica que el usuario tenga KYC aprobado y 2FA activo para operaciones sensibles.

```javascript
module.exports = async (req, res, next) => {
  const usuario = req.usuario;
  
  // Verificar KYC
  if (!usuario.kyc_verificado) {
    return res.status(403).json({
      success: false,
      error: 'Debes completar la verificación de identidad (KYC) para realizar esta operación',
      code: 'KYC_REQUIRED',
      redirect: '/kyc/solicitar'
    });
  }
  
  // Verificar 2FA
  if (!usuario.two_fa_enabled) {
    return res.status(403).json({
      success: false,
      error: 'Debes activar la autenticación de dos factores (2FA) para realizar esta operación',
      code: '2FA_REQUIRED',
      redirect: '/auth/2fa/setup'
    });
  }
  
  next();
};
```

---

#### `roleValidation.js`
Valida roles de usuario.

```javascript
module.exports = (...rolesPermitidos) => {
  return (req, res, next) => {
    const usuario = req.usuario;
    
    if (!rolesPermitidos.includes(usuario.rol)) {
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para realizar esta acción',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
    
    next();
  };
};

// Uso:
// router.post('/proyectos', auth, roleValidation('admin'), crearProyecto);
```

---

#### `rateLimiter.js`
Previene ataques de fuerza bruta y abuso de API.

```javascript
const rateLimit = require('express-rate-limit');

// Rate limiter global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: {
    success: false,
    error: 'Demasiadas solicitudes, por favor intenta más tarde'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter para login (más estricto)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Solo 5 intentos de login por 15 min
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: 'Demasiados intentos de login. Intenta en 15 minutos.'
  }
});

// Rate limiter para registro
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Solo 3 registros por hora por IP
  message: {
    success: false,
    error: 'Límite de registros alcanzado. Intenta más tarde.'
  }
});

module.exports = {
  globalLimiter,
  loginLimiter,
  registerLimiter
};
```

---

#### `imageUpload.middleware.js`
Configuración segura de Multer para uploads.

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = './uploads/';
    
    if (file.fieldname === 'documento_frontal' || file.fieldname === 'documento_dorso') {
      uploadPath += 'kyc/';
    } else if (file.fieldname === 'imagen') {
      uploadPath += 'proyectos/';
    } else if (file.fieldname === 'contrato') {
      uploadPath += 'contratos/';
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'application/pdf': ['.pdf']
  };
  
  if (allowedTypes[file.mimetype]) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido'), false);
  }
};

// Configuración de Multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB máximo
  }
});

module.exports = upload;
```

---

### Validaciones con express-validator

```javascript
const { body, param, query, validationResult } = require('express-validator');

// Middleware para validar resultados
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Validaciones de registro
const registroValidation = [
  body('email')
    .isEmail().withMessage('Email inválido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('La contraseña debe contener mayúsculas, minúsculas y números'),
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Nombre inválido'),
  validate
];

// Validaciones de inversión
const inversionValidation = [
  body('id_proyecto')
    .isInt({ min: 1 }).withMessage('ID de proyecto inválido'),
  body('tokens_adquiridos')
    .isInt({ min: 1 }).withMessage('Cantidad de tokens inválida'),
  body('metodo_pago')
    .isIn(['mercadopago', 'transferencia', 'saldo']).withMessage('Método de pago inválido'),
  validate
];

module.exports = {
  registroValidation,
  inversionValidation,
  validate
};
```

---

### Protección contra SQL Injection

Sequelize utiliza queries parametrizadas automáticamente:

```javascript
// ✅ SEGURO - Sequelize escapa automáticamente
const usuario = await Usuario.findOne({
  where: { email: req.body.email }
});

// ✅ SEGURO - Parámetros con bind
const proyectos = await sequelize.query(
  'SELECT * FROM proyectos WHERE id_proyecto = :id',
  {
    replacements: { id: req.params.id },
    type: QueryTypes.SELECT
  }
);

// ❌ INSEGURO - NUNCA usar concatenación de strings
// const query = `SELECT * FROM usuarios WHERE email = '${req.body.email}'`;
```

---

### Protección XSS (Cross-Site Scripting)

```javascript
// Sanitización de inputs
const sanitizeHtml = require('sanitize-html');

const sanitizeInput = (text) => {
  return sanitizeHtml(text, {
    allowedTags: [], // No permitir HTML
    allowedAttributes: {}
  });
};

// Uso en controladores
const crearProyecto = async (req, res) => {
  const { nombre, descripcion } = req.body;
  
  const proyecto = await Proyecto.create({
    nombre: sanitizeInput(nombre),
    descripcion: sanitizeInput(descripcion)
  });
  
  res.json({ success: true, data: proyecto });
};
```

---

### Headers de Seguridad con Helmet

```javascript
// app.js
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

---

### CORS Configurado

```javascript
// app.js
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    const whitelist = [
      process.env.FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3000'
    ];
    
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

---

## 🚀 Despliegue

### Opción 1: Render

1. **Conectar Repositorio:**
   - Panel de Render → New → Web Service
   - Conecta tu repositorio de GitHub

2. **Configurar:**
   ```yaml
   Build Command: npm install
   Start Command: npm start
   Environment: Node
   ```

3. **Variables de Entorno:**
   - Agregar todas las variables del archivo `.env`

4. **Base de Datos:**
   - Render → New → PostgreSQL
   - Copiar `DATABASE_URL` y configurar en la app

---

### Opción 2: Railway

1. **Deploy:**
   ```bash
   # Instalar Railway CLI
   npm i -g @railway/cli
   
   # Login
   railway login
   
   # Inicializar proyecto
   railway init
   
   # Deploy
   railway up
   ```

2. **Configurar Variables:**
   ```bash
   railway variables set JWT_SECRET=tu_secreto
   railway variables set MP_ACCESS_TOKEN=tu_token
   ```

---

### Opción 3: VPS (Ubuntu 22.04)

```bash
# 1. Actualizar sistema
sudo apt update && sudo apt upgrade -y

# 2. Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 4. Configurar PostgreSQL
sudo -u postgres psql
CREATE DATABASE nectarea_db;
CREATE USER nectarea_user WITH PASSWORD 'password_seguro';
GRANT ALL PRIVILEGES ON DATABASE nectarea_db TO nectarea_user;
\q

# 5. Clonar repositorio
git clone https://github.com/SebastianASU2005/Nectarea_BD.git
cd Nectarea_BD

# 6. Instalar dependencias
npm install --production

# 7. Configurar .env
nano .env
# (Agregar todas las variables)

# 8. Instalar PM2
sudo npm install -g pm2

# 9. Iniciar aplicación
pm2 start app.js --name nectarea-api

# 10. Configurar autostart
pm2 startup
pm2 save

# 11. Configurar Nginx como reverse proxy
sudo apt install -y nginx

sudo nano /etc/nginx/sites-available/nectarea

# Contenido:
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

sudo ln -s /etc/nginx/sites-available/nectarea /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 12. Configurar SSL con Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
```

---

### Opción 4: Docker

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 3000

# Iniciar aplicación
CMD ["node", "app.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=nectarea_db
      - DB_USER=nectarea_user
      - DB_PASSWORD=password_seguro
    env_file:
      - .env
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=nectarea_db
      - POSTGRES_USER=nectarea_user
      - POSTGRES_PASSWORD=password_seguro
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

volumes:
  postgres_data:
```

**Comandos Docker:**
```bash
# Construir y levantar contenedores
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Detener contenedores
docker-compose down

# Reconstruir después de cambios
docker-compose up -d --build

# Ejecutar migraciones
docker-compose exec app npm run migrate
```

---

## 📦 Scripts Disponibles

En `package.json` están definidos los siguientes scripts:

```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "nodemon app.js",
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "migrate": "node scripts/migrate.js",
    "seed": "node scripts/seed.js",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"**/*.js\"",
    "db:reset": "node scripts/resetDatabase.js",
    "logs": "pm2 logs nectarea-api"
  }
}
```

### Descripción de Scripts

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia el servidor en modo producción |
| `npm run dev` | Inicia el servidor con nodemon (recarga automática) |
| `npm test` | Ejecuta tests con Jest y genera reporte de cobertura |
| `npm run test:watch` | Ejecuta tests en modo watch |
| `npm run migrate` | Ejecuta migraciones de base de datos |
| `npm run seed` | Pobla la base de datos con datos de prueba |
| `npm run lint` | Revisa código con ESLint |
| `npm run lint:fix` | Corrige problemas de ESLint automáticamente |
| `npm run format` | Formatea código con Prettier |
| `npm run db:reset` | Resetea la base de datos (⚠️ elimina todos los datos) |
| `npm run logs` | Muestra logs de PM2 |

---

## 💡 Ejemplos de Uso

### Ejemplo 1: Registro e Inversión Completa

```javascript
// 1. Registrar usuario
const registroResponse = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'inversor@example.com',
    password: 'Password123!',
    nombre: 'Juan',
    apellido: 'Pérez'
  })
});

const { data: { token } } = await registroResponse.json();

// 2. Confirmar email (link enviado por email)
await fetch('http://localhost:3000/api/auth/confirm-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'token_del_email' })
});

// 3. Completar KYC
const formData = new FormData();
formData.append('tipo_documento', 'DNI');
formData.append('numero_documento', '12345678');
formData.append('documento_frontal', archivoFrente);
formData.append('documento_dorso', archivoDorso);
formData.append('selfie', archivoSelfie);

await fetch('http://localhost:3000/api/kyc/solicitar', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` },
  body: formData
});

// 4. Configurar 2FA
const setupResponse = await fetch('http://localhost:3000/api/auth/2fa/setup', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { qrCode, secret } } = await setupResponse.json();
// Usuario escanea QR con Google Authenticator

// 5. Verificar 2FA
await fetch('http://localhost:3000/api/auth/2fa/verify', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ token: '123456' }) // Código de la app
});

// 6. Listar proyectos disponibles
const proyectosResponse = await fetch('http://localhost:3000/api/proyectos?estado=activo', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { proyectos } } = await proyectosResponse.json();

// 7. Crear inversión
const inversionResponse = await fetch('http://localhost:3000/api/inversiones', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id_proyecto: proyectos[0].id_proyecto,
    tokens_adquiridos: 100,
    metodo_pago: 'mercadopago'
  })
});

const { data: { checkout_url } } = await inversionResponse.json();

// 8. Redirigir a Mercado Pago
window.location.href = checkout_url;

// 9. Después del pago, consultar estado
const statusResponse = await fetch(`http://localhost:3000/api/payment/status/${id_transaccion}`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { transaccion } } = await statusResponse.json();
console.log(transaccion.estado_transaccion); // 'completada'
```

---

### Ejemplo 2: Crear y Participar en Subasta

```javascript
// 1. Admin crea proyecto de subasta
const proyectoResponse = await fetch('http://localhost:3000/api/proyectos', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    nombre: 'Viñedo Premium',
    descripcion: 'Subasta de viñedo exclusivo',
    tipo_proyecto: 'subasta',
    puja_minima: 50000.00,
    incremento_minimo: 5000.00,
    fecha_inicio_subasta: '2025-02-01T00:00:00Z',
    fecha_fin_subasta: '2025-02-15T23:59:59Z',
    tokens_totales: 1000,
    ubicacion: 'Mendoza, Argentina'
  })
});

// 2. Usuario realiza puja
const pujaResponse = await fetch('http://localhost:3000/api/pujas', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id_proyecto: 5,
    monto_ofrecido: 75000.00
  })
});

// 3. Consultar si es puja líder
const pujaEstadoResponse = await fetch('http://localhost:3000/api/pujas', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { pujas } } = await pujaEstadoResponse.json();
const miPuja = pujas.find(p => p.id_puja === 1);
console.log(miPuja.es_puja_lider); // true/false

// 4. Cuando la subasta cierre (automático), pagar si ganó
if (miPuja.estado_puja === 'ganadora') {
  const pagoResponse = await fetch(`http://localhost:3000/api/pujas/${miPuja.id_puja}/pagar`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data: { checkout_url } } = await pagoResponse.json();
  window.location.href = checkout_url;
}
```

---

### Ejemplo 3: Suscripción Mensual

```javascript
// 1. Crear suscripción
const suscripcionResponse = await fetch('http://localhost:3000/api/suscripcion-proyecto', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    id_proyecto: 3,
    meses_a_pagar: 12,
    monto_mensual: 2500.00,
    auto_renovacion: true
  })
});

// 2. Consultar cuotas pendientes
const cuotasResponse = await fetch('http://localhost:3000/api/pagos?estado_pago=pendiente', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { pagos } } = await cuotasResponse.json();

// 3. Pagar cuota del mes
const pagarCuotaResponse = await fetch(`http://localhost:3000/api/pagos/${pagos[0].id_pago}/pagar`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data: { checkout_url } } = await pagarCuotaResponse.json();
window.location.href = checkout_url;

// 4. Pausar suscripción temporalmente
await fetch(`http://localhost:3000/api/suscripcion-proyecto/1/pausar`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` }
});

// 5. Reanudar suscripción
await fetch(`http://localhost:3000/api/suscripcion-proyecto/1/reanudar`, {
  method: 'PUT',
  headers: { 'Authorization': `Bearer ${token}` }
});

// 6. Cancelar suscripción
await fetch(`http://localhost:3000/api/suscripcion-proyecto/1/cancelar`, {
  method: 'PUT',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    motivo: 'Ya no puedo continuar con los pagos'
  })
});
```

---

## 🔧 Troubleshooting

### Error: "Cannot connect to database"

**Problema:** La aplicación no puede conectarse a PostgreSQL.

**Solución:**
```bash
# 1. Verificar que PostgreSQL esté corriendo
sudo systemctl status postgresql

# 2. Verificar credenciales en .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nectarea_db
DB_USER=nectarea_user
DB_PASSWORD=tu_password

# 3. Probar conexión manual
psql -h localhost -U nectarea_user -d nectarea_db

# 4. Verificar permisos
sudo -u postgres psql
GRANT ALL PRIVILEGES ON DATABASE nectarea_db TO nectarea_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nectarea_user;
```

---

### Error: "Token expirado"

**Problema:** JWT ha expirado.

**Solución:**
```javascript
// Frontend debe refrescar el token
const refreshResponse = await fetch('http://localhost:3000/api/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refreshToken: storedRefreshToken })
});

const { data: { token, refreshToken } } = await refreshResponse.json();
localStorage.setItem('token', token);
localStorage.setItem('refreshToken', refreshToken);
```

---

### Error: "Invalid signature" en Webhook

**Problema:** Mercado Pago rechaza el webhook por firma inválida.

**Solución:**
```bash
# 1. Verificar que MP_WEBHOOK_SECRET esté correcto en .env
MP_WEBHOOK_SECRET=tu_secret_exacto_de_mercadopago

# 2. Verificar en logs que se está recibiendo x-signature
console.log(req.headers['x-signature']);

# 3. Probar webhook localmente con ngrok
ngrok http 3000
# Usar URL de ngrok en configuración de MP

# 4. Verificar logs de Mercado Pago
# Panel MP → Integraciones → Webhooks → Ver logs
```

---

### Error: "Rate limit exceeded"

**Problema:** Demasiadas peticiones desde una IP.

**Solución:**
```javascript
// Ajustar rate limiter en middleware/rateLimiter.js
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Aumentar límite
  message: 'Demasiadas solicitudes'
});

// O deshabilitar temporalmente en desarrollo
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => next()); // Bypass rate limiter
} else {
  app.use(globalLimiter);
}
```

---

### Error: "KYC_REQUIRED"

**Problema:** Usuario intenta operar sin verificación KYC.

**Solución:**
```javascript
// Usuario debe completar KYC primero
// 1. Solicitar verificación
POST /api/kyc/solicitar

// 2. Admin aprueba
PUT /api/kyc/{id}/aprobar

// 3. Usuario puede operar
POST /api/inversiones
```

---

### Error: Tareas CRON no se ejecutan

**Problema:** Los cron jobs no se están ejecutando.

**Solución:**
```bash
# 1. Verificar que ENABLE_CRON_JOBS=true en .env
ENABLE_CRON_JOBS=true

# 2. Verificar logs en app.js
console.log('Iniciando tareas CRON...');

# 3. Verificar zona horaria
TIMEZONE=America/Argentina/Buenos_Aires

# 4. Probar manualmente una tarea
node tasks/monthlyPaymentGenerationTask.js

# 5. Verificar que PM2 no reinicie la app constantemente
pm2 logs
pm2 monit
```

---

### Error: "File too large"

**Problema:** Archivo subido excede el límite.

**Solución:**
```javascript
// Aumentar límite en middleware/imageUpload.middleware.js
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // Aumentar a 10MB
  }
});
```

---

### Error: CORS en producción

**Problema:** Frontend no puede hacer requests por CORS.

**Solución:**
```javascript
// Agregar dominio de frontend al whitelist en app.js
const corsOptions = {
  origin: [
    'https://tu-frontend-produccion.com',
    'https://www.tu-frontend-produccion.com',
    process.env.FRONTEND_URL
  ],
  credentials: true
};

app.use(cors(corsOptions));
```

---

## 🧪 Testing

### Configuración de Jest

**jest.config.js:**
```javascript
module.exports = {
  testEnvironment: 'node',
  coveragePathIgnorePatterns: ['/node_modules/'],
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js'
  ]
};
```

### Ejemplo de Test

**tests/auth.test.js:**
```javascript
const request = require('supertest');
const app = require('../app');
const { sequelize, Usuario } = require('../models');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});

describe('Auth Endpoints', () => {
  describe('POST /api/auth/register', () => {
    it('debería crear un usuario exitosamente', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Password123!',
          nombre: 'Test User'
        });
      
      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.usuario.email).toBe('test@example.com');
    });
    
    it('debería rechazar email duplicado', async () => {
      // Primer registro
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          nombre: 'User 1'
        });
      
      // Segundo registro con mismo email
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123!',
          nombre: 'User 2'
        });
      
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
    
    it('debería rechazar password débil', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'weak@example.com',
          password: '123',
          nombre: 'Weak User'
        });
      
      expect(response.statusCode).toBe(400);
    });
  });
  
  describe('POST /api/auth/login', () => {
    let usuario;
    
    beforeEach(async () => {
      usuario = await Usuario.create({
        email: 'login@example.com',
        password: await bcrypt.hash('Password123!', 10),
        nombre: 'Login User',
        email_confirmado: true
      });
    });
    
    it('debería iniciar sesión correctamente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'Password123!'
        });
      
      expect(response.statusCode).toBe(200);
      expect(response.body.data).toHaveProperty('token');
    });
    
    it('debería rechazar credenciales incorrectas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'WrongPassword!'
        });
      
      expect(response.statusCode).toBe(401);
    });
  });
});
```

---

## 📊 Monitoreo y Logs

### Configuración de Morgan

```javascript
// app.js
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

// Crear directorio de logs
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Stream para logs de acceso
const accessLogStream = fs.createWriteStream(
  path.join(logsDir, 'access.log'),
  { flags: 'a' }
);

// Morgan en desarrollo
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Morgan en producción
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', { stream: accessLogStream }));
}
```

### Winston Logger

```javascript
// utils/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

---

## 🤝 Contribución

### Para Contribuir

1. **Fork** el repositorio
2. Crea una **rama feature**: `git checkout -b feature/nueva-funcionalidad`
3. **Commit** tus cambios: `git commit -m 'feat: agregar nueva funcionalidad'`
4. **Push** a la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un **Pull Request**

### Convenciones de Commits

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: agregar endpoint de notificaciones
fix: corregir validación de email en registro
docs: actualizar README con ejemplos
style: formatear código con prettier
refactor: reorganizar servicios de pago
perf: optimizar queries de base de datos
test: agregar tests para auth controller
chore: actualizar dependencias
```

### Estándares de Código

- **ESLint** para linting
- **Prettier** para formateo
- **Comentarios JSDoc** en funciones públicas
- **Tests** para nuevas funcionalidades
- **Nombres descriptivos** en español para variables de negocio

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT.

```
MIT License

Copyright (c) 2025 Nectárea

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 📞 Contacto y Soporte

- **Repositorio:** [GitHub - Nectarea_BD](https://github.com/SebastianASU2005/Nectarea_BD)
- **Issues:** [Reportar Bug](https://github.com/SebastianASU2005/Nectarea_BD/issues)
- **Email:** soporte@nectarea.com

---

## 🎯 Roadmap

### Próximas Funcionalidades

- [ ] **Dashboard de Analytics** para administradores
- [ ] **Notificaciones Push** con Firebase Cloud Messaging
- [ ] **Chat en tiempo real** con Socket.io
- [ ] **Reportes PDF** de inversiones y contratos
- [ ] **API GraphQL** como alternativa a REST
- [ ] **Integración con blockchain** para contratos inteligentes
- [ ] **Sistema de referidos** con recompensas
- [ ] **Calculadora de ROI** integrada
- [ ] **Marketplace** de tokens secundarios
- [ ] **App móvil nativa** (React Native)

---

## 🙏 Agradecimientos

Este proyecto fue desarrollado con ❤️ para **Nectárea**.

### Stack Tecnológico
- **Backend:** Node.js + Express.js
- **ORM:** Sequelize
- **Base de Datos:** PostgreSQL
- **Pagos:** Mercado Pago SDK
- **Emails:** Nodemailer
- **Autenticación:** JWT + 2FA (Speakeasy)
- **Tareas:** node-cron

### Recursos Útiles
- [Documentación de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs)
- [Sequelize Docs](https://sequelize.org/docs/v6/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## 📈 Estadísticas del Proyecto

- **20+ Modelos** de base de datos
- **24 Controladores** HTTP
- **24 Servicios** de lógica de negocio
- **20 Archivos de rutas** (150+ endpoints)
- **5 Middleware** personalizados
- **11 Tareas programadas** con cron
- **4 Utilidades** compartidas
- **100% TypeScript-ready** (migración futura)

---

## 🔐 Seguridad y Cumplimiento

- ✅ **OWASP Top 10** protecciones implementadas
- ✅ **PCI DSS Compliant** (integración Mercado Pago)
- ✅ **GDPR Ready** (gestión de datos personales)
- ✅ **KYC/AML** verificación de identidad
- ✅ **2FA** autenticación de dos factores
- ✅ **Encriptación** de contraseñas con bcrypt
- ✅ **Rate Limiting** contra ataques de fuerza bruta
- ✅ **SQL Injection** protección con ORM
- ✅ **XSS Protection** sanitización de inputs
- ✅ **CSRF Protection** en formularios

---

**¡Gracias por usar Nectárea Backend! 🌿**

Si encuentras útil este proyecto, considera dar una ⭐ en GitHub.

---

<p align="center">
  <strong>Desarrollado con 💚 para inversores agrícolas</strong>
</p>

<p align="center">
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-18.x-green.svg" alt="Node.js">
  </a>
  <a href="https://expressjs.com/">
    <img src="https://img.shields.io/badge/Express-4.21.1-blue.svg" alt="Express">
  </a>
  <a href="https://www.postgresql.org/">
    <img src="https://img.shields.io/badge/PostgreSQL-14+-blue.svg" alt="PostgreSQL">
  </a>
  <a href="https://github.com/SebastianASU2005/Nectarea_BD/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
  </a>
</p> true,
  "data": {
    "usuario": {
      "id_usuario": 1,
      "email": "usuario@example.com",
      "nombre": "Juan",
      "rol": "usuario",
      "two_fa_enabled": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "requires2FA": true
  }
}
```

---

#### **GET** `/api/auth/me`
Obtener usuario autenticado actual.

**Headers:**
```http
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id_usuario": 1,
    "email": "usuario@example.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "rol": "inversionista",
    "saldo_general": 15000.50,
    "saldo_a_favor_general": 500.00,
    "kyc_verificado": true,
    "two_fa_enabled": true
  }
}
```

---

#### **POST** `/api/auth/refresh`
Refrescar token JWT.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### **POST** `/api/auth/confirm-email`
Confirmar email con token.

**Request Body:**
```json
{
  "token": "abc123def456..."
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email confirmado exitosamente. Ya puedes iniciar sesión."
}
```

---

### Autenticación 2FA

#### **POST** `/api/auth/2fa/setup`
Configurar autenticación de dos factores.

**Headers:**
```http
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "manualEntryKey": "JBSWY3DPEHPK3PXP"
  },
  "message": "Escanea el código QR con tu app de autenticación (Google Authenticator, Authy, etc.)"
}
```

---

#### **POST** `/api/auth/2fa/verify`
Verificar y activar 2FA.

**Request Body:**
```json
{
  "token": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Autenticación de dos factores activada exitosamente"
}
```

---

#### **POST** `/api/auth/2fa/validate`
Validar código 2FA en el login.

**Request Body:**
```json
{
  "email": "usuario@example.com",
  "token": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "usuario": { /* datos del usuario */ }
  }
}
```

---

#### **POST** `/api/auth/2fa/disable`
Desactivar 2FA.

**Request Body:**
```json
{
  "password": "Password123!",
  "token": "123456"
}
```

---

### Gestión de Usuarios

#### **GET** `/api/usuarios`
Listar todos los usuarios (Solo Admin).

**Query Params:**
```
?page=1&limit=20&rol=inversionista&activo=true&search=juan
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "usuarios": [ /* array de usuarios */ ],
    "pagination": {
      "total": 150,
      "page": 1,
      "limit": 20,
      "totalPages": 8
    }
  }
}
```

---

#### **GET** `/api/usuarios/:id`
Obtener usuario por ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id_usuario": 1,
    "email": "usuario@example.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "rol": "inversionista",
    "saldo_general": 15000.50,
    "inversiones": [ /* array de inversiones */ ],
    "pujas_activas": 2,
    "proyectos_participando": 5
  }
}
```

---

#### **PUT** `/api/usuarios/:id`
Actualizar usuario.

**Request Body:**
```json
{
  "nombre": "Juan Carlos",
  "telefono": "+54911234567",
  "email": "nuevoemail@example.com"
}
```

---

#### **DELETE** `/api/usuarios/:id`
Eliminar usuario (Solo Admin).

---

#### **PUT** `/api/usuarios/:id/rol`
Cambiar rol de usuario (Solo Admin).

**Request Body:**
```json
{
  "rol": "inversionista"
}
```

---

#### **POST** `/api/usuarios/:id/recargar-saldo`
Recargar saldo de usuario.

**Request Body:**
```json
{
  "monto": 10000.00,
  "metodo": "mercadopago"
}
```

---

## 📊 Proyectos

#### **GET** `/api/proyectos`
Listar proyectos.

**Query Params:**
```
?estado=activo
&tipo_proyecto=inversion_directa
&destacado=true
&categoria=agricultura
&page=1
&limit=12
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "proyectos": [
      {
        "id_proyecto": 1,
        "nombre": "Cultivo de Arándanos Orgánicos",
        "descripcion": "Proyecto de cultivo sustentable...",
        "monto_objetivo": 500000.00,
        "monto_recaudado": 250000.00,
        "porcentaje_completado": 50.00,
        "tokens_totales": 10000,
        "tokens_vendidos": 5000,
        "precio_token": 50.00,
        "ubicacion": "Mendoza, Argentina",
        "latitud": -32.889459,
        "longitud": -68.845839,
        "fecha_inicio": "2025-01-01",
        "fecha_fin": "2025-12-31",
        "estado": "activo",
        "tipo_proyecto": "inversion_directa",
        "imagen_principal": "https://...jpg",
        "categoria": "agricultura",
        "destacado": true
      }
    ],
    "pagination": {
      "total": 25,
      "page": 1,
      "limit": 12,
      "totalPages": 3
    }
  }
}
```

---

#### **GET** `/api/proyectos/:id`
Obtener proyecto por ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id_proyecto": 1,
    "nombre": "Cultivo de Arándanos Orgánicos",
    "descripcion": "Descripción completa del proyecto...",
    "monto_objetivo": 500000.00,
    "monto_recaudado": 250000.00,
    "tokens_totales": 10000,
    "tokens_vendidos": 5000,
    "tokens_disponibles": 5000,
    "precio_token": 50.00,
    "retorno_esperado": 15.5,
    "imagenes": [ /* array de imágenes */ ],
    "lotes": [ /* array de lotes disponibles */ ],
    "inversiones_count": 45,
    "inversionistas_count": 38,
    "es_favorito": true
  }
}
```

---

#### **POST** `/api/proyectos`
Crear nuevo proyecto (Solo Admin).

**Request Body:**
```json
{
  "nombre": "Nuevo Proyecto Agrícola",
  "descripcion": "Descripción detallada...",
  "monto_objetivo": 300000.00,
  "tokens_totales": 6000,
  "precio_token": 50.00,
  "ubicacion": "Córdoba, Argentina",
  "latitud": -31.420083,
  "longitud": -64.188776,
  "fecha_inicio": "2025-03-01",
  "fecha_fin": "2025-12-31",
  "tipo_proyecto": "inversion_directa",
  "categoria": "agricultura",
  "retorno_esperado": 12.5
}
```

---

#### **PUT** `/api/proyectos/:id`
Actualizar proyecto (Solo Admin).

---

#### **DELETE** `/api/proyectos/:id`
Eliminar proyecto (Solo Admin).

---

#### **GET** `/api/proyectos/:id/inversiones`
Listar inversiones de un proyecto.

---

#### **GET** `/api/proyectos/:id/pujas`
Listar pujas de un proyecto.

---

## 💰 Inversiones

#### **GET** `/api/inversiones`
Listar inversiones del usuario autenticado.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "inversiones": [
      {
        "id_inversion": 1,
        "id_proyecto": 1,
        "proyecto": {
          "nombre": "Cultivo de Arándanos",
          "imagen_principal": "https://..."
        },
        "monto_invertido": 5000.00,
        "tokens_adquiridos": 100,
        "fecha_inversion": "2025-01-15",
        "estado_inversion": "confirmada",
        "retorno_esperado": 15.5,
        "ganancia_proyectada": 775.00
      }
    ],
    "resumen": {
      "total_invertido": 25000.00,
      "inversiones_activas": 5,
      "retorno_total_esperado": 3875.00
    }
  }
}
```

---

#### **GET** `/api/inversiones/:id`
Obtener inversión por ID.

---

#### **POST** `/api/inversiones`
Crear nueva inversión.

**Request Body:**
```json
{
  "id_proyecto": 1,
  "id_lote": 2,
  "tokens_adquiridos": 100,
  "metodo_pago": "mercadopago"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "inversion": {
      "id_inversion": 1,
      "monto_invertido": 5000.00,
      "tokens_adquiridos": 100,
      "estado_inversion": "pendiente"
    },
    "transaccion": {
      "id_transaccion": 1,
      "estado_transaccion": "pendiente"
    },
    "checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456"
  },
  "message": "Inversión creada. Completa el pago para confirmar."
}
```

---

#### **PUT** `/api/inversiones/:id/confirmar`
Confirmar inversión (Sistema - Webhook).

---

#### **DELETE** `/api/inversiones/:id`
Cancelar inversión (solo si está pendiente).

---

## 🎯 Pujas (Subastas)

#### **GET** `/api/pujas`
Listar pujas del usuario autenticado.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pujas": [
      {
        "id_puja": 1,
        "id_proyecto": 2,
        "proyecto": {
          "nombre": "Viñedo Premium",
          "fecha_fin_subasta": "2025-01-20T23:59:59Z",
          "puja_actual_maxima": 75000.00
        },
        "monto_ofrecido": 75000.00,
        "fecha_puja": "2025-01-15T10:30:00Z",
        "estado_puja": "activa",
        "es_puja_lider": true
      }
    ]
  }
}
```

---

#### **GET** `/api/pujas/proyecto/:id`
Listar todas las pujas de un proyecto específico.

---

#### **POST** `/api/pujas`
Crear nueva puja.

**Request Body:**
```json
{
  "id_proyecto": 2,
  "monto_ofrecido": 80000.00,
  "es_puja_automatica": false
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "puja": {
      "id_puja": 1,
      "monto_ofrecido": 80000.00,
      "estado_puja": "activa"
    },
    "es_puja_lider": true
  },
  "message": "Puja realizada exitosamente. Eres el pujador líder."
}
```

---

#### **PUT** `/api/pujas/:id/pagar`
Pagar puja ganadora.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "checkout_url": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=..."
  },
  "message": "Redirigiendo a Mercado Pago para completar el pago."
}
```

---

#### **DELETE** `/api/pujas/:id`
Cancelar puja (solo si no es ganadora).

---

## 🔄 Suscripciones

#### **GET** `/api/suscripcion-proyecto`
Listar suscripciones del usuario.

**Response (200):**
```json
{
  "success":
}

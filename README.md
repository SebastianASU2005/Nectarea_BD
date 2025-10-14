# 🌿 Nectárea Backend - API RESTful

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue.svg)](https://www.postgresql.org/)
[![Sequelize](https://img.shields.io/badge/Sequelize-6.x-52B0E7.svg)](https://sequelize.org/)

Bienvenido al repositorio del backend de **Nectárea**, una plataforma de crowdfunding y gestión de proyectos de inversión. Esta API RESTful está diseñada para gestionar las operaciones clave de la plataforma, incluyendo la creación de proyectos, la gestión de inversiones y pujas, pagos con Mercado Pago, y la administración de usuarios y contratos.

---

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura del Proyecto](#-arquitectura-del-proyecto)
- [Instalación y Configuración](#-instalación-y-configuración)
- [Variables de Entorno](#-variables-de-entorno)
- [Documentación de la API](#-documentación-de-la-api)
- [Sistema de Pagos](#-sistema-de-pagos)
- [Seguridad](#-seguridad)
- [Estructura de Base de Datos](#-estructura-de-base-de-datos)
- [Testing](#-testing)
- [Despliegue](#-despliegue)
- [Contribución](#-contribución)

---

## ✨ Características Principales

- 🔐 **Autenticación JWT**: Sistema completo de registro, login y gestión de sesiones
- 💰 **Integración con Mercado Pago**: Procesamiento de pagos con validación de firma HMAC-SHA256
- 📊 **Gestión de Proyectos**: CRUD completo de proyectos de inversión
- 🎯 **Sistema de Pujas**: Pujas en tiempo real con validación de conflictos
- 💼 **Inversiones Directas**: Compra directa de tokens de proyectos
- 📄 **Gestión de Contratos**: Upload y descarga de contratos PDF
- 📧 **Notificaciones por Email**: Sistema de emails transaccionales con Nodemailer
- 🔄 **Transacciones Seguras**: Manejo de transacciones con aislamiento y rollback automático
- 📝 **Sistema de Mensajería**: Chat entre usuarios y administradores
- 🏆 **Gamificación**: Sistema de logros y recompensas

---

## 🛠 Stack Tecnológico

### Backend Core
- **Node.js** (v18.x): Entorno de ejecución JavaScript del lado del servidor
- **Express.js** (v4.x): Framework web minimalista y flexible
- **Sequelize** (v6.x): ORM para Node.js con soporte completo de PostgreSQL

### Base de Datos
- **PostgreSQL** (v14+): Base de datos relacional robusta y escalable

### Seguridad
- **bcryptjs**: Hash seguro de contraseñas con salt rounds
- **jsonwebtoken (JWT)**: Autenticación stateless basada en tokens
- **crypto**: Validación HMAC-SHA256 para webhooks de Mercado Pago
- **express-validator**: Validación de inputs del usuario

### Integración de Pagos
- **Mercado Pago SDK**: Integración oficial con validación de webhooks

### Utilidades
- **Multer**: Middleware para upload de archivos (contratos PDF)
- **Nodemailer**: Envío de emails transaccionales
- **dotenv**: Gestión de variables de entorno
- **cors**: Configuración de CORS para frontend

---

## 📁 Arquitectura del Proyecto

El proyecto sigue una arquitectura **MVC (Model-View-Controller)** con **Service Layer**:

```
Nectarea_BD/
│
├── config/
│   └── database.js              # Configuración de Sequelize y PostgreSQL
│
├── models/                       # Modelos de Sequelize (ORM)
│   ├── usuario.js
│   ├── proyecto.js
│   ├── inversion.js
│   ├── puja.js
│   ├── transaccion.js
│   ├── pagoMercado.js
│   ├── suscripcionProyecto.js
│   ├── pago.js
│   ├── contrato.js
│   ├── mensaje.js
│   └── ... (otros modelos)
│
├── services/                     # Lógica de negocio
│   ├── usuario.service.js
│   ├── proyecto.service.js
│   ├── inversion.service.js
│   ├── puja.service.js
│   ├── transaccion.service.js
│   ├── pagoMercado.service.js
│   ├── email.service.js
│   └── ... (otros servicios)
│
├── controllers/                  # Controladores HTTP
│   ├── usuario.controller.js
│   ├── proyecto.controller.js
│   ├── inversion.controller.js
│   ├── puja.controller.js
│   ├── payment.controller.js
│   └── ... (otros controladores)
│
├── routes/                       # Definición de rutas de la API
│   ├── usuario.routes.js
│   ├── proyecto.routes.js
│   ├── inversion.routes.js
│   ├── puja.routes.js
│   ├── payment.routes.js
│   └── ... (otras rutas)
│
├── middlewares/                  # Middleware personalizado
│   ├── auth.middleware.js       # Verificación JWT
│   ├── validacion.middleware.js # Validación de inputs
│   └── upload.middleware.js     # Configuración Multer
│
├── uploads/                      # Archivos subidos (contratos)
│   └── contratos/
│
├── utils/                        # Utilidades y helpers
│   └── logger.js
│
├── app.js                        # Archivo principal de Express
├── server.js                     # Punto de entrada del servidor
├── .env.example                  # Ejemplo de variables de entorno
├── package.json
└── README.md
```

### Flujo de Datos

```
Cliente (Frontend)
      ↓
   [CORS]
      ↓
   [Routes] → Define endpoints
      ↓
[Middleware] → Autenticación, Validación
      ↓
[Controller] → Maneja request/response HTTP
      ↓
  [Service] → Lógica de negocio
      ↓
   [Model] → Interacción con base de datos
      ↓
 [PostgreSQL]
```

---

## 🚀 Instalación y Configuración

### Prerrequisitos

- **Node.js** v18.x o superior
- **PostgreSQL** v14 o superior
- **npm** o **yarn**
- **Cuenta de Mercado Pago** (para pagos)

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

Edita el archivo `.env` con tus credenciales (ver sección [Variables de Entorno](#-variables-de-entorno))

### Paso 4: Configurar Base de Datos

1. Crea una base de datos PostgreSQL:

```sql
CREATE DATABASE nectarea_db;
CREATE USER nectarea_user WITH PASSWORD 'tu_password_seguro';
GRANT ALL PRIVILEGES ON DATABASE nectarea_db TO nectarea_user;
```

2. Ejecuta las migraciones (Sequelize sincronizará automáticamente):

```bash
npm run migrate
```

### Paso 5: Iniciar el Servidor

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
# === SERVIDOR ===
NODE_ENV=development
PORT=3000
HOST_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# === BASE DE DATOS ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nectarea_db
DB_USER=nectarea_user
DB_PASSWORD=tu_password_seguro
DB_DIALECT=postgres

# === AUTENTICACIÓN JWT ===
JWT_SECRET=tu_secreto_super_seguro_cambiar_en_produccion
JWT_EXPIRES_IN=7d

# === MERCADO PAGO ===
MP_ACCESS_TOKEN=TEST-1234567890-abcdef-ghijklmnop-qrstuvwx
MP_WEBHOOK_SECRET=tu_webhook_secret_de_mercado_pago
MP_CURRENCY_ID=ARS

# === EMAIL (NODEMAILER) ===
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password_de_gmail
EMAIL_FROM=noreply@nectarea.com

# === ARCHIVOS ===
MAX_FILE_SIZE=5242880
ALLOWED_FILE_TYPES=application/pdf

# === OTROS ===
BCRYPT_SALT_ROUNDS=10
```

### ⚠️ Importante: Seguridad

- **NUNCA** subas el archivo `.env` a Git (ya está en `.gitignore`)
- Usa **secretos diferentes** en desarrollo y producción
- Rota los secretos periódicamente
- Usa **variables de entorno** del sistema en producción (no archivos `.env`)

---

## 📚 Documentación de la API

### Base URL

```
http://localhost:3000/api
```

### Autenticación

La API utiliza **JWT Bearer Tokens**. Incluye el token en el header de cada request:

```
Authorization: Bearer {tu_token_jwt}
```

### Endpoints Principales

#### 🔐 Autenticación

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Registrar nuevo usuario | No |
| POST | `/auth/login` | Iniciar sesión | No |
| GET | `/auth/me` | Obtener usuario actual | Sí |
| POST | `/auth/refresh` | Refrescar token | Sí |

#### 👤 Usuarios

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/usuarios` | Listar todos los usuarios | Admin |
| GET | `/usuarios/:id` | Obtener usuario por ID | Sí |
| PUT | `/usuarios/:id` | Actualizar usuario | Sí |
| DELETE | `/usuarios/:id` | Eliminar usuario | Admin |

#### 📊 Proyectos

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/proyectos` | Listar proyectos activos | No |
| GET | `/proyectos/:id` | Obtener proyecto por ID | No |
| POST | `/proyectos` | Crear nuevo proyecto | Admin |
| PUT | `/proyectos/:id` | Actualizar proyecto | Admin |
| DELETE | `/proyectos/:id` | Eliminar proyecto | Admin |

#### 💰 Inversiones

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/inversiones` | Mis inversiones | Sí |
| GET | `/inversiones/:id` | Obtener inversión | Sí |
| POST | `/inversiones` | Crear inversión directa | Sí |
| PUT | `/inversiones/:id/confirmar` | Confirmar inversión | Sistema |

#### 🎯 Pujas

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/pujas` | Mis pujas | Sí |
| GET | `/pujas/proyecto/:id` | Pujas de un proyecto | Sí |
| POST | `/pujas` | Crear nueva puja | Sí |
| PUT | `/pujas/:id/confirmar` | Confirmar puja ganadora | Sistema |

#### 💳 Pagos

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/payment/checkout` | Crear sesión de pago | Sí |
| POST | `/payment/webhook/mercadopago` | Webhook de MP (firma validada) | No |
| GET | `/payment/status/:id_transaccion` | Consultar estado de pago | Sí |
| POST | `/payment/:modelo/:modeloId` | Iniciar pago genérico | Sí |

#### 📄 Contratos

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/contratos` | Mis contratos | Sí |
| GET | `/contratos/:id` | Descargar contrato | Sí |
| POST | `/contratos` | Subir contrato | Admin |

#### 💬 Mensajes

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/mensajes` | Mis mensajes | Sí |
| GET | `/mensajes/:id` | Ver mensaje | Sí |
| POST | `/mensajes` | Enviar mensaje | Sí |
| PUT | `/mensajes/:id/leer` | Marcar como leído | Sí |

### Respuestas de la API

#### Éxito (2xx)

```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Ejemplo"
  },
  "message": "Operación exitosa"
}
```

#### Error (4xx, 5xx)

```json
{
  "success": false,
  "error": "Descripción del error",
  "details": {
    "campo": "Detalle específico"
  }
}
```

---

## 💳 Sistema de Pagos

### Flujo de Pago Completo

```
1. Usuario crea inversión/puja
         ↓
2. Se crea Transacción (estado: pendiente)
         ↓
3. Frontend solicita checkout → POST /payment/checkout
         ↓
4. Backend crea preferencia en Mercado Pago
         ↓
5. Usuario es redirigido a MP (init_point)
         ↓
6. Usuario paga en MP
         ↓
7. MP envía webhook → POST /payment/webhook/mercadopago
         ↓
8. Backend valida firma HMAC-SHA256
         ↓
9. Si válido: confirma transacción, actualiza inversión/puja
         ↓
10. Usuario es redirigido de vuelta al frontend
         ↓
11. Frontend consulta estado → GET /payment/status/:id
```

### Validación de Webhooks de Mercado Pago

El sistema implementa **validación de firma HMAC-SHA256** para garantizar que los webhooks provienen legítimamente de Mercado Pago:

```javascript
// Pasos de validación:
1. Extraer headers: x-signature, x-request-id
2. Extraer data.id del body
3. Construir manifest: "id:{data.id};request-id:{x-request-id};ts:{timestamp};"
4. Calcular HMAC-SHA256 con MP_WEBHOOK_SECRET
5. Comparar hash local con hash de MP
6. Si coinciden → Webhook válido ✅
7. Si no coinciden → Rechazar con 401 ❌
```

### Estados de Transacción

| Estado | Descripción |
|--------|-------------|
| `pendiente` | Transacción creada, esperando pago |
| `en_proceso` | Pago en proceso en MP |
| `pagado` | Pago confirmado, inversión/puja activada |
| `fallido` | Pago rechazado o falló |
| `reembolsado` | Pago devuelto |
| `cancelado` | Usuario canceló la transacción |

### Configuración de Webhook en Mercado Pago

1. Accede a tu panel de Mercado Pago
2. Ve a **Integraciones → Webhooks**
3. Crea un nuevo webhook:
   - URL: `https://tu-dominio.com/api/payment/webhook/mercadopago`
   - Eventos: ✅ **Pagos** (payments)
4. Copia el **Secret Key** y agrégalo a `MP_WEBHOOK_SECRET` en tu `.env`

⚠️ **Importante:** 
- Solo marca "Pagos" en la configuración
- Las notificaciones de `merchant_order` se ignoran automáticamente
- El webhook valida SOLO notificaciones de tipo `payment`

---

## 🔒 Seguridad

### Medidas Implementadas

✅ **Autenticación JWT**: Tokens con expiración configurable  
✅ **Hash de Contraseñas**: bcrypt con 10 salt rounds  
✅ **Validación de Firma**: HMAC-SHA256 en webhooks de MP  
✅ **Sanitización de Inputs**: express-validator  
✅ **CORS Configurado**: Solo orígenes permitidos  
✅ **Rate Limiting**: Protección contra fuerza bruta (opcional)  
✅ **SQL Injection Protection**: Sequelize ORM con queries parametrizadas  
✅ **XSS Protection**: Headers de seguridad con Helmet (recomendado)  

### Headers de Seguridad Recomendados

```javascript
// Instalar helmet
npm install helmet

// En app.js
const helmet = require('helmet');
app.use(helmet());
```

### Buenas Prácticas

- Nunca loguees información sensible (tokens, contraseñas, secretos)
- Usa HTTPS en producción
- Implementa rate limiting en endpoints públicos
- Audita dependencias regularmente: `npm audit`
- Mantén Node.js y dependencias actualizadas

---

## 🗄 Estructura de Base de Datos

### Modelos Principales

```
Usuario (id, email, password, nombre, rol, saldo_general)
   ↓ 1:N
Transaccion (id, id_usuario, monto, estado, tipo)
   ↓ 1:1
PagoMercado (id, id_transaccion, id_transaccion_pasarela, estado)

Proyecto (id, nombre, descripcion, monto_objetivo, tokens_totales)
   ↓ 1:N
Inversion (id, id_usuario, id_proyecto, monto, tokens, estado)
   ↓ 1:N
Puja (id, id_usuario, id_proyecto, monto_ofrecido, estado)

SuscripcionProyecto (id, id_usuario, id_proyecto, meses_a_pagar, saldo_a_favor)
   ↓ 1:N
Pago (id, id_suscripcion, monto, fecha_vencimiento, estado_pago)

Contrato (id, id_proyecto, id_usuario, ruta_archivo, tipo_contrato)
Mensaje (id, id_remitente, id_receptor, contenido, leido)
```

### Relaciones Clave

- `Usuario` → `Transaccion` (1:N)
- `Transaccion` → `PagoMercado` (1:1)
- `Usuario` → `Inversion` (1:N)
- `Proyecto` → `Inversion` (1:N)
- `Usuario` → `Puja` (1:N)
- `Proyecto` → `Puja` (1:N)
- `SuscripcionProyecto` → `Pago` (1:N)

---

## 🧪 Testing

```bash
# Instalar dependencias de testing
npm install --save-dev jest supertest

# Ejecutar tests
npm test

# Coverage
npm run test:coverage
```

Ejemplo de test:

```javascript
// tests/auth.test.js
const request = require('supertest');
const app = require('../app');

describe('Auth Endpoints', () => {
  it('POST /auth/register - debería crear un usuario', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'test@example.com',
        password: 'Password123!',
        nombre: 'Test User'
      });
    
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('token');
  });
});
```

---

## 🚀 Despliegue

### Opción 1: Render / Railway

1. Conecta tu repositorio de GitHub
2. Configura las variables de entorno
3. Deploy automático en cada push a `main`

### Opción 2: VPS (Ubuntu)

```bash
# Instalar Node.js y PostgreSQL
sudo apt update
sudo apt install nodejs npm postgresql

# Clonar repo
git clone https://github.com/SebastianASU2005/Nectarea_BD.git
cd Nectarea_BD

# Instalar PM2
npm install -g pm2

# Instalar dependencias
npm install --production

# Iniciar con PM2
pm2 start server.js --name nectarea-api
pm2 save
pm2 startup
```

### Opción 3: Docker

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

```bash
docker build -t nectarea-backend .
docker run -p 3000:3000 --env-file .env nectarea-backend
```

---

## 🤝 Contribución

### Para Desarrolladores del Backend

1. Crea una rama feature: `git checkout -b feature/nueva-funcionalidad`
2. Commits descriptivos: `git commit -m "feat: agregar endpoint de notificaciones"`
3. Push a la rama: `git push origin feature/nueva-funcionalidad`
4. Crea un Pull Request con descripción detallada

### Convenciones de Código

- **Nombres de archivos**: camelCase para servicios, PascalCase para modelos
- **Variables**: camelCase
- **Constantes**: UPPER_SNAKE_CASE
- **Indentación**: 2 espacios
- **Comillas**: Simples para strings
- **Async/Await**: Siempre con try-catch

---

## 📧 Contacto y Soporte

- **Repositorio**: [GitHub](https://github.com/SebastianASU2005/Nectarea_BD)
- **Documentación Frontend**: Ver repositorio del frontend
- **Issues**: Reporta bugs en GitHub Issues

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver archivo `LICENSE` para más detalles.

---

## 🙏 Agradecimientos

Desarrollado con ❤️ para Nectárea  
Stack: Node.js + Express + PostgreSQL + Sequelize + Mercado Pago
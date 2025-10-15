# 🎨 Guía COMPLETA de Integración Frontend - Nectárea API

## 🚀 PASO A PASO DESDE CERO - Para Desarrolladores Frontend

Esta guía asume que **NO sabes nada** sobre el backend de Nectárea. Vamos a explicar TODO desde cero.

---

## 📋 Tabla de Contenidos

- [¿Qué es esta API?](#qué-es-esta-api)
- [Antes de Empezar](#antes-de-empezar)
- [PASO 1: Configuración del Backend](#paso-1-configuración-del-backend)
- [PASO 2: Configuración del Frontend](#paso-2-configuración-del-frontend)
- [PASO 3: Entendiendo los Modelos](#paso-3-entendiendo-los-modelos)
- [PASO 4: Reglas de Negocio CRÍTICAS](#paso-4-reglas-de-negocio-críticas)
- [PASO 5: Implementación de Autenticación](#paso-5-implementación-de-autenticación)
- [PASO 6: Trabajando con Proyectos](#paso-6-trabajando-con-proyectos)
- [PASO 7: Sistema de Pagos](#paso-7-sistema-de-pagos)
- [PASO 8: Manejo de Errores](#paso-8-manejo-de-errores)
- [Troubleshooting](#troubleshooting)

---

## ❓ ¿Qué es esta API?

Nectárea es una plataforma de **crowdfunding** (como Kickstarter) donde:

- Los usuarios pueden **invertir** en proyectos
- Los usuarios pueden hacer **pujas** (como subastas)
- Los usuarios pueden **suscribirse** a proyectos mensuales
- Todo se paga con **Mercado Pago**

La API es el backend que maneja toda la lógica y la base de datos.

---

## 📚 Antes de Empezar

### ¿Qué necesitas saber?

- ✅ JavaScript básico
- ✅ Conceptos de HTTP (GET, POST, PUT, DELETE)
- ✅ JSON
- ✅ React/Vue/Angular (cualquier framework frontend)

### ¿Qué NO necesitas saber?

- ❌ Node.js o Express (el backend ya está hecho)
- ❌ PostgreSQL (la base de datos ya está configurada)
- ❌ Cómo funcionan los webhooks internamente

### Herramientas Requeridas

- **Node.js** v18+ (para correr el backend localmente)
- **PostgreSQL** v14+ (base de datos)
- **Git** (para clonar el repositorio)
- **Postman** o **Thunder Client** (para probar la API)

---

## 🔧 PASO 1: Configuración del Backend

### 1.1 Clonar el Repositorio

```bash
# Abre tu terminal y ejecuta:
git clone https://github.com/SebastianASU2005/Nectarea_BD.git
cd Nectarea_BD
```

### 1.2 Instalar Dependencias

```bash
npm install
```

⏳ Esto tomará unos minutos. Está instalando todas las librerías necesarias.

### 1.3 Instalar y Configurar PostgreSQL

#### En Windows:

1. Descarga PostgreSQL: https://www.postgresql.org/download/windows/
2. Instala con los valores por defecto
3. Durante la instalación, anota la contraseña que elijas (la necesitarás)
4. Puerto por defecto: **5432**

#### En Mac:

```bash
brew install postgresql@14
brew services start postgresql@14
```

#### En Linux (Ubuntu/Debian):

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### 1.4 Crear la Base de Datos

Abre tu terminal y ejecuta:

```bash
# Conectarse a PostgreSQL
psql -U postgres

# Dentro de psql, ejecuta:
CREATE DATABASE nectarea_dev;
CREATE USER nectarea_user WITH PASSWORD 'dev_password_123';
GRANT ALL PRIVILEGES ON DATABASE nectarea_dev TO nectarea_user;

# Salir de psql
\q
```

✅ **Importante:** Anota estos datos, los necesitarás en el siguiente paso.

### 1.5 Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```bash
# En la carpeta Nectarea_BD/, crea el archivo .env
touch .env
```

Abre `.env` con tu editor favorito y copia esto:

```env
# === ENTORNO ===
NODE_ENV=development

# === SERVIDOR ===
PORT=3000
HOST_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# === BASE DE DATOS ===
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nectarea_dev
DB_USER=nectarea_user
DB_PASSWORD=dev_password_123
DB_DIALECT=postgres

# === JWT (AUTENTICACIÓN) ===
JWT_SECRET=mi_secreto_super_seguro_de_desarrollo_cambiar_en_produccion
JWT_EXPIRES_IN=7d

# === MERCADO PAGO (MODO PRUEBA) ===
# Deja estos valores vacíos por ahora, los configuraremos después
MP_ACCESS_TOKEN=
MP_WEBHOOK_SECRET=
MP_CURRENCY_ID=ARS

# === EMAIL (OPCIONAL EN DESARROLLO) ===
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM=noreply@nectarea.com
```

⚠️ **MUY IMPORTANTE:**

- Usa los mismos valores que creaste en el paso 1.4
- Si tu contraseña de PostgreSQL es diferente, cámbiala en `DB_PASSWORD`
- Si usas otro puerto, cámbialo en `DB_PORT`

### 1.6 Inicializar la Base de Datos

```bash
npm run migrate
```

Esto creará todas las tablas automáticamente. Verás mensajes como:

```
Executing (default): CREATE TABLE IF NOT EXISTS "usuarios"...
Executing (default): CREATE TABLE IF NOT EXISTS "proyectos"...
✅ Base de datos sincronizada
```

### 1.7 Iniciar el Backend

```bash
npm run dev
```

Deberías ver:

```
✅ Conectado a la base de datos PostgreSQL
✅ Servidor corriendo en http://localhost:3000
✅ Mercado Pago SDK configurado (o ⚠️ si no configuraste MP aún)
```

### 1.8 Verificar que Funciona

Abre tu navegador y ve a:

```
http://localhost:3000/api/health
```

Deberías ver:

```json
{
  "status": "ok",
  "timestamp": "2025-10-15T10:30:00.000Z"
}
```

✅ **¡Perfecto! El backend está corriendo.**

---

## ⚙️ PASO 2: Configuración del Frontend

### 2.1 Crear Tu Proyecto Frontend

```bash
# Si usas React con Vite:
npm create vite@latest nectarea-frontend -- --template react
cd nectarea-frontend
npm install

# Si usas Vue:
npm create vite@latest nectarea-frontend -- --template vue
cd nectarea-frontend
npm install
```

### 2.2 Instalar Axios (Para Comunicarte con la API)

```bash
npm install axios
```

### 2.3 Crear el Archivo de Configuración de la API

Crea un archivo: `src/services/api.js`

```javascript
// src/services/api.js
import axios from "axios";

// URL del backend (cámbialo según tu entorno)
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

// Crear instancia de axios con configuración base
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000, // 15 segundos
  headers: {
    "Content-Type": "application/json",
  },
});

// ============================================
// INTERCEPTOR DE REQUEST (Agrega el token automáticamente)
// ============================================
apiClient.interceptors.request.use(
  (config) => {
    // Obtener el token del localStorage
    const token = localStorage.getItem("token");

    // Si existe, agregarlo al header
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    console.log(`📤 ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error("❌ Error en request:", error);
    return Promise.reject(error);
  }
);

// ============================================
// INTERCEPTOR DE RESPONSE (Maneja errores automáticamente)
// ============================================
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ Respuesta recibida de ${response.config.url}`);
    return response;
  },
  (error) => {
    if (error.response) {
      const { status } = error.response;

      // Si el token expiró o es inválido
      if (status === 401) {
        console.error("🚫 Token inválido o expirado");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }

      // Si no tiene permisos
      if (status === 403) {
        console.error("🚫 No tienes permisos para esta acción");
      }
    } else if (error.request) {
      console.error("❌ No se pudo conectar con el servidor");
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

### 2.4 Crear Variables de Entorno del Frontend

Crea un archivo `.env` en la raíz de tu proyecto frontend:

```env
VITE_API_URL=http://localhost:3000/api
```

### 2.5 Probar la Conexión

Crea un archivo: `src/services/authService.js`

```javascript
// src/services/authService.js
import apiClient from "./api";

// Función de prueba
export const testConnection = async () => {
  try {
    const response = await apiClient.get("/health");
    console.log("✅ Conexión exitosa:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error de conexión:", error);
    throw error;
  }
};
```

Ahora, en tu componente principal (App.jsx o similar):

```jsx
import { useEffect } from "react";
import { testConnection } from "./services/authService";

function App() {
  useEffect(() => {
    testConnection();
  }, []);

  return <div>Nectárea Frontend</div>;
}

export default App;
```

Inicia tu frontend:

```bash
npm run dev
```

Abre la consola del navegador (F12) y deberías ver:

```
📤 GET /health
✅ Respuesta recibida de /health
✅ Conexión exitosa: { status: 'ok', timestamp: '...' }
```

✅ **¡Perfecto! Tu frontend se comunica con el backend.**

---

## 🚀 PASO 3: Entendiendo los Modelos de Base de Datos

### ¿Qué es un Modelo?

Un **Modelo** es la representación en código de una **tabla** en la base de datos (DB), utilizando Sequelize. Define las columnas, los tipos de datos y las restricciones.

| Modelo (Sequelize)    | Tabla (DB)             | Propósito Principal                                             |
| :-------------------- | :--------------------- | :-------------------------------------------------------------- |
| `Usuario`             | `usuario`              | Gestión de cuentas de usuario.                                  |
| `Proyecto`            | `proyecto`             | Detalles y estado de los proyectos de inversión.                |
| `Transaccion`         | `transaccion`          | Registro central de flujos de dinero.                           |
| `SuscripcionProyecto` | `suscripcion_proyecto` | Vínculo y estado de la suscripción de un usuario a un proyecto. |
| `Puja`                | `puja`                 | Registro de las ofertas en las subastas de lotes.               |

---

### Modelos Principales del Sistema

#### 1. Usuario (`usuario`)

| Atributo             | Tipo de Dato  | Observaciones Clave                                          |
| :------------------- | :------------ | :----------------------------------------------------------- |
| **`id`**             | `INTEGER`     | Clave primaria.                                              |
| `nombre`, `apellido` | `STRING(100)` |                                                              |
| **`email`**          | `STRING(255)` | Único.                                                       |
| **`dni`**            | `STRING(20)`  | Único.                                                       |
| `nombre_usuario`     | `STRING(50)`  | Único.                                                       |
| `contraseña_hash`    | `STRING(255)` | Clave hasheada.                                              |
| **`rol`**            | `ENUM`        | Opciones: **`"admin"`, `"cliente"`** (Defecto: `"cliente"`). |
| **`activo`**         | `BOOLEAN`     | **Define si la cuenta está activa** (Defecto: `false`).      |
| `confirmado_email`   | `BOOLEAN`     | Indica si el email ha sido verificado.                       |
| `is_2fa_enabled`     | `BOOLEAN`     | Indica si la Autenticación de Dos Factores está activa.      |
| `twofa_secret`       | `STRING(255)` | Clave secreta para TOTP/2FA.                                 |

<br>

#### 2. Proyecto (`proyecto`)

| Atributo                       | Tipo de Dato     | Observaciones Clave                                          |
| :----------------------------- | :--------------- | :----------------------------------------------------------- |
| **`id`**                       | `INTEGER`        | Clave primaria.                                              |
| `nombre_proyecto`              | `STRING(255)`    |                                                              |
| `descripcion`                  | `TEXT`           |                                                              |
| **`tipo_inversion`**           | `ENUM`           | Opciones: **`"directo"`, `"mensual"`**.                      |
| `monto_inversion`              | `DECIMAL(18, 2)` | El monto objetivo de inversión.                              |
| **`estado_proyecto`**          | `ENUM`           | Opciones: **`"En Espera"`, `"En proceso"`, `"Finalizado"`**. |
| `suscripciones_actuales`       | `INTEGER`        | Contador de suscripciones activas.                           |
| `fecha_inicio`, `fecha_cierre` | `DATEONLY`       |                                                              |
| `pack_de_lotes`                | `BOOLEAN`        | Indica si el proyecto gestiona subastas de lotes.            |

<br>

#### 3. Transacción (`transaccion`)

| Atributo                 | Tipo de Dato     | Observaciones Clave                                                    |
| :----------------------- | :--------------- | :--------------------------------------------------------------------- |
| **`id`**                 | `INTEGER`        | Clave primaria.                                                        |
| `id_usuario`             | `INTEGER`        | Usuario que realiza la transacción.                                    |
| `monto`                  | `DECIMAL(15, 2)` | Monto de la transacción.                                               |
| `tipo_transaccion`       | `STRING(50)`     | Tipo de transacción (e.g., "Inversion", "Puja", "PagoMensual").        |
| **`estado_transaccion`** | `ENUM`           | Opciones: **`"pendiente"`, `"pagado"`, `"fallido"`, `"reembolsado"`**. |
| `id_pago_mensual`        | `INTEGER`        | **FK a la tabla `Pago`** (Pago de mensualidad).                        |
| `id_pago_pasarela`       | `INTEGER`        | **FK a la tabla `PagoMercado`** (Pago vía pasarela).                   |
| `id_inversion`           | `INTEGER`        | FK a `Inversion` (si aplica).                                          |
| `id_puja`                | `INTEGER`        | FK a `Puja` (si aplica).                                               |

<br>

#### 4. PagoMercado (`pagos_mercado`)

| Atributo                  | Tipo de Dato     | Observaciones Clave                                                                     |
| :------------------------ | :--------------- | :-------------------------------------------------------------------------------------- |
| **`id`**                  | `INTEGER`        | Clave primaria.                                                                         |
| **`id_transaccion`**      | `INTEGER`        | **FK a la tabla `Transaccion`**.                                                        |
| `id_transaccion_pasarela` | `STRING`         | ID único en la pasarela (e.g., Mercado Pago ID).                                        |
| `monto_pagado`            | `DECIMAL(10, 2)` | Monto real pagado a través de la pasarela.                                              |
| `metodo_pasarela`         | `STRING`         | e.g., `"mercadopago"`, `"stripe"`.                                                      |
| **`estado`**              | `ENUM`           | Opciones: **`"pendiente"`, `"aprobado"`, `"rechazado"`, `"devuelto"`, `"en_proceso"`**. |
| `detalles_raw`            | `JSON`           | Objeto completo del webhook/API.                                                        |

<br>

#### 5. SuscripcionProyecto (`suscripcion_proyecto`)

| Atributo             | Tipo de Dato     | Observaciones Clave                          |
| :------------------- | :--------------- | :------------------------------------------- |
| **`id`**             | `INTEGER`        | Clave primaria.                              |
| `id_usuario`         | `INTEGER`        | Usuario suscrito.                            |
| `id_proyecto`        | `INTEGER`        | Proyecto suscrito.                           |
| **`meses_a_pagar`**  | `INTEGER`        | Cantidad de meses que el usuario debe pagar. |
| `tokens_disponibles` | `INTEGER`        | Tokens acumulados para pujas (Defecto: `1`). |
| `saldo_a_favor`      | `DECIMAL(15, 2)` | Saldo proveniente de pagos excedentes.       |

<br>

#### 6. Pago (de Suscripción) (`pago`)

| Atributo             | Tipo de Dato     | Observaciones Clave                                                                         |
| :------------------- | :--------------- | :------------------------------------------------------------------------------------------ |
| **`id`**             | `INTEGER`        | Clave primaria.                                                                             |
| **`id_suscripcion`** | `INTEGER`        | Suscripción a la que pertenece el pago.                                                     |
| `id_usuario`         | `INTEGER`        | Usuario responsable del pago.                                                               |
| `id_proyecto`        | `INTEGER`        | Proyecto asociado.                                                                          |
| `monto`              | `DECIMAL(15, 2)` | Monto a pagar por la cuota.                                                                 |
| `fecha_vencimiento`  | `DATEONLY`       |                                                                                             |
| **`estado_pago`**    | `ENUM`           | Opciones: **`"pendiente"`, `"pagado"`, `"vencido"`, `"cancelado"`, `"cubierto_por_puja"`**. |
| `mes`                | `INTEGER`        | Mes de la cuota.                                                                            |

---

### Modelos de Subasta

#### 7. Lote (`lote`)

| Atributo                     | Tipo de Dato     | Observaciones Clave                                       |
| :--------------------------- | :--------------- | :-------------------------------------------------------- |
| **`id`**                     | `INTEGER`        | Clave primaria.                                           |
| `id_proyecto`                | `INTEGER`        | Proyecto al que pertenece.                                |
| `nombre_lote`                | `STRING(255)`    | Nombre del lote.                                          |
| `precio_base`                | `DECIMAL(10, 2)` | Precio mínimo para la subasta.                            |
| **`estado_subasta`**         | `ENUM`           | Opciones: **`"pendiente"`, `"activa"`, `"finalizada"`**.  |
| `id_ganador`                 | `INTEGER`        | ID del usuario ganador.                                   |
| **`intentos_fallidos_pago`** | `INTEGER`        | Contador de incumplimientos de pago del ganador (máx. 3). |
| `excedente_visualizacion`    | `DECIMAL(10, 2)` | Excedente de la puja ganadora para frontend.              |

<br>

#### 8. Puja (`puja`)

| Atributo                 | Tipo de Dato     | Observaciones Clave                                                         |
| :----------------------- | :--------------- | :-------------------------------------------------------------------------- |
| **`id`**                 | `INTEGER`        | Clave primaria.                                                             |
| `id_lote`                | `INTEGER`        | Lote subastado.                                                             |
| `id_usuario`             | `INTEGER`        | Usuario que realiza la puja.                                                |
| `monto_puja`             | `DECIMAL(15, 2)` | Monto ofertado.                                                             |
| **`estado_puja`**        | `ENUM`           | Estados detallados: `"activa"`, `"ganadora_pendiente"`, `"perdedora"`, etc. |
| `fecha_vencimiento_pago` | `DATE`           | Fecha límite para que el ganador pague.                                     |
| `id_suscripcion`         | `INTEGER`        | Suscripción asociada a la puja.                                             |

---

### Otros Modelos de Apoyo

#### 9. Inversion (`inversion`)

| Atributo                         | Tipo de Dato     | Observaciones Clave                                                |
| :------------------------------- | :--------------- | :----------------------------------------------------------------- |
| **`id`**                         | `INTEGER`        | Clave primaria.                                                    |
| `monto`                          | `DECIMAL(15, 2)` | Dinero invertido.                                                  |
| `id_usuario` / **`id_inversor`** | `INTEGER`        | Usuario que invierte (Nota: FK en asociaciones es `id_inversor`).  |
| `id_proyecto`                    | `INTEGER`        | Proyecto invertido.                                                |
| **`estado`**                     | `ENUM`           | Opciones: `"pendiente"`, `"pagado"`, `"fallido"`, `"reembolsado"`. |
| `fecha_inversion`                | `DATE`           |                                                                    |

<br>

#### 10. Contrato (`contrato`)

| Atributo                | Tipo de Dato | Observaciones Clave                             |
| :---------------------- | :----------- | :---------------------------------------------- |
| **`id`**                | `INTEGER`    | Clave primaria.                                 |
| `id_proyecto`           | `INTEGER`    | Proyecto al que pertenece.                      |
| `id_usuario_firmante`   | `INTEGER`    | Usuario que ha firmado (puede ser nulo).        |
| `nombre_archivo`        | `STRING`     | Nombre del archivo PDF.                         |
| `hash_archivo_original` | `STRING(64)` | **Hash SHA-256 para integridad** del documento. |

<br>

#### 11. CuotaMensual (`cuota_mensual`)

| Atributo                  | Tipo de Dato     | Observaciones Clave                      |
| :------------------------ | :--------------- | :--------------------------------------- |
| **`id`**                  | `INTEGER`        | Clave primaria.                          |
| `id_proyecto`             | `INTEGER`        | Proyecto de suscripción.                 |
| **`valor_mensual_final`** | `DECIMAL(18, 2)` | Monto final que paga el usuario por mes. |
| `total_cuotas_proyecto`   | `INTEGER`        | Duración total de las cuotas.            |

<br>

#### 12. ResumenCuenta (`resumenes_cuentas`)

| Atributo                            | Tipo de Dato | Observaciones Clave                        |
| :---------------------------------- | :----------- | :----------------------------------------- |
| **`id`**                            | `INTEGER`    | Clave primaria.                            |
| **`id_suscripcion`**                | `INTEGER`    | Suscripción a la que pertenece el resumen. |
| `cuotas_pagadas`, `cuotas_vencidas` | `INTEGER`    | Contadores de cuotas.                      |
| `porcentaje_pagado`                 | `FLOAT`      | Porcentaje de avance de la suscripción.    |
| `detalle_cuota`                     | `JSONB`      | Detalles completos de la cuota mensual.    |

<br>

#### 13. Mensaje (`mensaje`)

| Atributo       | Tipo de Dato | Observaciones Clave                |
| :------------- | :----------- | :--------------------------------- |
| **`id`**       | `INTEGER`    | Clave primaria.                    |
| `id_remitente` | `INTEGER`    | ID del usuario que envía.          |
| `id_receptor`  | `INTEGER`    | ID del usuario que recibe.         |
| `contenido`    | `TEXT`       | Contenido del mensaje.             |
| `leido`        | `BOOLEAN`    | Indica si el receptor lo ha leído. |

<br>

#### 14. Imagen (`imagen`)

| Atributo      | Tipo de Dato  | Observaciones Clave                 |
| :------------ | :------------ | :---------------------------------- |
| **`id`**      | `INTEGER`     | Clave primaria.                     |
| `url`         | `STRING(255)` | URL de la imagen.                   |
| `id_proyecto` | `INTEGER`     | Proyecto asociado (puede ser nulo). |
| `id_lote`     | `INTEGER`     | Lote asociado (puede ser nulo).     |

<br>

#### 15. SuscripcionCancelada (`suscripcion_cancelada`)

| Atributo                      | Tipo de Dato     | Observaciones Clave                      |
| :---------------------------- | :--------------- | :--------------------------------------- |
| **`id`**                      | `INTEGER`        | Clave primaria.                          |
| **`id_suscripcion_original`** | `INTEGER`        | FK de la suscripción que fue cancelada.  |
| `id_usuario`, `id_proyecto`   | `INTEGER`        |                                          |
| `meses_pagados`               | `INTEGER`        | Meses pagados hasta la cancelación.      |
| `monto_pagado_total`          | `DECIMAL(15, 2)` | Monto total pagado hasta la cancelación. |
| `fecha_cancelacion`           | `DATE`           |                                          |

---

## ⚠️ PASO 4: Reglas de Negocio CRÍTICAS

🔐 PASO 4: Servicios de Seguridad (Auth Utilities)
El servicio de seguridad de autenticación (authService) es fundamental, ya que maneja la gestión segura de las contraseñas antes de que sean almacenadas en la base de datos o comparadas durante el inicio de sesión.

Este servicio utiliza la librería bcryptjs, un estándar de la industria para el hashing de contraseñas. Es crucial que nunca almacenemos contraseñas en texto plano.

4.1 authService.js (Backend)
Método Propósito Regla de Negocio Asociada
hashPassword Convierte la contraseña de texto plano en un hash seguro. SEGURIDAD: La contraseña almacenada en el modelo Usuario (contraseña_hash) siempre debe ser el resultado de este proceso.
comparePassword Comprueba si una contraseña ingresada coincide con el hash almacenado. LOGIN: Utilizado durante el inicio de sesión para verificar las credenciales del usuario.

Exportar a Hojas de cálculo
Detalles de la Implementación

1. hashPassword(password)
   Este método se invoca durante el proceso de Registro de un nuevo Usuario para crear el valor que se guardará en el campo contraseña_hash.

Hashing: Se usa bcrypt.hash junto con un salt (valor aleatorio).

Seguridad: El factor de salt de 10 es un compromiso adecuado entre seguridad y tiempo de procesamiento. Esto asegura que si dos usuarios eligen la misma contraseña, sus hashes en la DB serán completamente diferentes.

JavaScript

/_ Ejemplo de Uso durante el registro _/
const nuevoUsuario = {
...
password: "miPasswordSecreta", // Contraseña en texto plano
...
};

// 1. Hashear
const hashedPassword = await authService.hashPassword(nuevoUsuario.password);
// 2. Guardar en la DB
// Usuario.create({ ..., contraseña_hash: hashedPassword }); 2. comparePassword(password, hash)
Este método se invoca durante el Login para verificar que la contraseña ingresada por el usuario sea correcta, sin necesidad de revertir el hash almacenado.

Comparación Segura: bcrypt.compare realiza una comparación criptográfica segura del texto plano (password) contra el hash (hash) almacenado.

JavaScript

/_ Ejemplo de Uso durante el login _/
const usuarioDB = await Usuario.findOne({ where: { email } });

// Verificar la contraseña
const esValido = await authService.comparePassword(
contraseñaIngresada,
usuarioDB.contraseña_hash
);

if (esValido) {
// ✅ Éxito: Generar Token JWT
} else {
// ❌ Error: Credenciales inválidas
}

Servicio de Autenticación de Dos Factores (2FA)
El servicio que has proporcionado (auth2faService) es vital, ya que implementa la Autenticación de Dos Factores (2FA) basada en TOTP (contraseña de un solo uso basada en tiempo), lo que aumenta drásticamente la seguridad de las cuentas de usuario.

Aquí tienes la documentación en formato Markdown para el servicio:

🔐 PASO 5: Servicio de Autenticación de Dos Factores (2FA)
El servicio auth2faService.js maneja la generación de claves secretas, la verificación de códigos TOTP (Time-based One-Time Password) y la activación/desactivación del 2FA en la cuenta del usuario, utilizando la librería speakeasy.

Este servicio se relaciona directamente con los campos is_2fa_enabled y twofa_secret del modelo Usuario.

5.1 auth2faService.js (Backend)
Método	Propósito	Regla de Negocio Crítica
generateSecret	Crea la clave secreta y la URL (código QR) que el usuario escanea con Google Authenticator o similar.	INTEGRACIÓN: La URL debe incluir el email del usuario para una identificación clara en la app de 2FA.
verifyToken	Verifica si el código de 6 dígitos ingresado por el usuario es válido en ese momento.	SEGURIDAD: Utiliza una ventana (window: 1) para permitir un desfase de ±30 segundos, mitigando problemas de sincronización de tiempo.
enable2FA	Marca al usuario como is_2fa_enabled: true y guarda la clave secreta (twofa_secret) en la DB.	VALIDACIÓN: Solo debe ser llamado después de que el token de prueba inicial haya sido validado con éxito.
disable2FA	Deshabilita el 2FA, verificando previamente la contraseña y el código TOTP actual.	DOBLE VERIFICACIÓN: Requiere contraseña actual y código 2FA para prevenir desactivaciones no autorizadas. El secreto debe ser eliminado (null) de la DB.

Exportar a Hojas de cálculo
Flujo Crítico de Lógica de Negocio (2FA)
La implementación de este servicio impone reglas estrictas sobre cómo el usuario interactúa con la seguridad de su cuenta:

1. Activación de 2FA
El proceso de activación debe ser de dos pasos en el frontend:

Paso	Método Utilizado	Acción
Paso A: Generación	generateSecret(email)	El sistema genera y muestra al usuario el código QR (URL) y guarda el secreto temporalmente.
Paso B: Confirmación	verifyToken(secret, token)	El usuario ingresa un código de prueba. Si es válido, el backend llama a enable2FA para hacerlo permanente.

Exportar a Hojas de cálculo
2. Desactivación de 2FA (disable2FA)
Este método combina verificaciones de otros servicios para garantizar la máxima seguridad:

Verificación de Contraseña: Utiliza authService.comparePassword para confirmar la identidad. Si la contraseña es incorrecta, la operación falla.

Verificación de Código 2FA: Utiliza verifyToken para asegurar que el usuario tenga acceso al dispositivo 2FA.

Actualización Segura: Si ambas verificaciones pasan, el método actualiza el Usuario a is_2fa_enabled: false y, de forma CRÍTICA, establece twofa_secret: null para eliminar cualquier rastro de la clave secreta.

JavaScript

/* Lógica clave en disable2FA */
// 1. Verificar Contraseña (Usa authService)
const passwordMatch = await authService.comparePassword(currentPassword, user.contraseña_hash);

// 2. Verificar Código TOTP (Usa verifyToken del propio servicio)
const isTotpValid = auth2faService.verifyToken(user.twofa_secret, totpCode);

// 3. Desactivar si ambos son correctos
if (passwordMatch && isTotpValid) {
    await user.update({ 
        is_2fa_enabled: false, 
        twofa_secret: null 
    });
}

Servicio de Gestión e Integridad de Contratos
El servicio contratoService.js administra los registros del modelo Contrato. Su función más crítica no es solo almacenar contratos, sino garantizar criptográficamente que los documentos legales no han sido manipulados después de su carga o firma.

Este servicio depende de la utilidad generateFileHash para leer el archivo físico y compararlo con el hash almacenado en el campo hash_archivo_original del modelo Contrato.

6.1 contratoService.js (Backend)
Método	Propósito Principal	Lógica de Negocio/Regla Crítica
create(data)	Registra un nuevo contrato (base o firmado) en la DB.	Requiere que hash_archivo_original esté incluido en data al momento de la creación.
findAndVerifyById(id)	Método central. Obtiene el contrato por ID y verifica su integridad.	INTEGRIDAD CRÍTICA: Compara el hash_archivo_original (DB) con el hash actual del archivo físico (generateFileHash). Si no coinciden, se marca como integrity_compromised: true.
findById(id)	Es un wrapper (envoltorio) directo de findAndVerifyById.	Asegura que, al buscar un contrato individual, la verificación de integridad se ejecute siempre por defecto.
createSignedContract	Registra el contrato generado y firmado individualmente.	Espera la URL, el Hash y el id_usuario_firmante únicos.
registerSignature	Actualiza un registro de contrato base con los datos de una firma electrónica.	Vincula la id_inversion_asociada y el hash de la firma al contrato base para finalizar el proceso legal.
softDelete(id)	Desactiva un contrato (borrado suave).	Utiliza el campo activo: false en lugar de borrar el registro para mantener el historial legal.

Exportar a Hojas de cálculo
6.2 Regla de Integridad Criptográfica (Hash Check)
La lógica más importante de este servicio reside en el método findAndVerifyById.

🔑 Concepto de Integridad
El campo Contrato.hash_archivo_original almacena el valor de hash del archivo PDF cuando fue cargado por primera vez. Si el archivo físico cambia de alguna manera, generateFileHash devolverá un valor diferente.

🚨 Mecanismo de Verificación
Se obtiene el registro del contrato de la DB, que incluye el hash_archivo_original.

Se llama a la utilidad generateFileHash(url_archivo) para calcular el hash actual del archivo físico.

Comparación:

Si hashActual es igual a contrato.hash_archivo_original: la integridad está confirmada (integrity_compromised: false).

Si son diferentes: la integridad está comprometida (integrity_compromised: true). Se emite un console.warn de seguridad.

Esta comprobación se añade como una nueva propiedad (integrity_compromised) en el objeto del contrato devuelto, permitiendo al controlador (y a los administradores) tomar medidas si se detecta manipulación.

JavaScript

// Lógica clave dentro de findAndVerifyById
const hashActual = await generateFileHash(contrato.url_archivo); 
if (hashActual !== contrato.hash_archivo_original) {
    // ⚠️ ¡El archivo físico no coincide con el registro original!
    contrato.dataValues.integrity_compromised = true;
} else {
    contrato.dataValues.integrity_compromised = false;
}
return contrato;
6.3 Flujo de Firma de Contratos (registerSignature)
Este método es clave para finalizar una inversión:

El usuario realiza una inversión.

Se genera un documento PDF único para la inversión (fuera de este servicio).

El método registerSignature se encarga de vincular este documento firmado y su hash de integridad con el registro del contrato base del proyecto, marcando la inversión como legalmente respaldada.

JavaScript

/* Ejemplo de Uso de registerSignature */
// Datos que incluyen la URL y el Hash del documento firmado
const firmaExitosa = {
  url_documento_firmado: '...',
  hash_documento_firmado: '...',
  id_inversion_asociada: 45,
  fecha_firma: new Date(),
};

await contratoService.registerSignature(idContratoBase, firmaExitosa);

Servicio de Cálculo de Cuotas Mensuales

El servicio cuotaMensualService.js administra el modelo CuotaMensual. Su propósito principal es calcular el monto exacto que los usuarios deben pagar mensualmente por una suscripción, basándose en variables económicas (valor del cemento, porcentajes de plan, administración e IVA).

Este servicio aplica directamente la Regla de Negocio CRÍTICA que establece que los proyectos de tipo mensual deben tener una configuración de cuota.

7.1 cuotaMensualService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
_calculateValues	FUNCIÓN CENTRAL. Realiza todos los cálculos financieros de la cuota.	Define el monto final a pagar (valor_mensual_final) sumando el costo del plan, la carga administrativa y el IVA. Redondea a 2 decimales.
createAndSetProjectAmount	Crea la cuota y la vincula al proyecto.	TRANSACCIÓN CRÍTICA: Usa una transacción de Sequelize para asegurar que la Cuota Mensual se cree Y el campo monto_inversion del Proyecto se actualice atómicamente.
update	Recalcula y actualiza una cuota existente.	Mantiene la coherencia financiera al recalcular y actualizar los montos del Proyecto asociado si cambian las variables de la cuota.
findByProjectId	Obtiene el historial de cuotas de un proyecto.	Útil para el seguimiento administrativo.

Exportar a Hojas de cálculo
7.2 Lógica de Cálculo Financiero (_calculateValues)
Esta función privada encapsula la fórmula que determina el costo mensual.

🧮 Fórmula de Cálculo:
Costo Base (valor_movil):

valor_movil=valor_cemento_unidades×valor_cemento
Total del Plan:

total_del_plan=valor_movil× 
100
porcentaje_plan
​
 
Valor Mensual (Sin Cargos):

valor_mensual= 
total_cuotas_proyecto
total_del_plan
​
 
Carga Administrativa:

carga_administrativa=valor_movil× 
100
porcentaje_administrativo
​
 
IVA sobre Administración:

iva_carga_administrativa=carga_administrativa× 
100
porcentaje_iva
​
 
Valor Mensual FINAL:

valor_mensual_final=valor_mensual+carga_administrativa+iva_carga_administrativa
Nota Crítica: Todos los valores se redondean a 2 decimales (toFixed(2)) inmediatamente antes de ser devueltos, lo que garantiza la precisión financiera.

7.3 Transacciones Atómicas (Métodos createAndSetProjectAmount y update)
El uso de transacciones de base de datos (sequelize.transaction()) es fundamental para mantener la consistencia entre los modelos CuotaMensual y Proyecto.

Objeto	Propósito de la Transacción	Impacto si Falla
CuotaMensual	Creación/Actualización del registro de cuota.	Si la creación falla (ej. error de DB), el proyecto nunca se actualiza.
Proyecto	Actualización de monto_inversion con el valor_mensual_final.	Si la actualización del proyecto falla, la creación de la cuota se revierte (rollback).

Exportar a Hojas de cálculo
El flujo asegura que ambas operaciones se completen con éxito, o ninguna lo haga. Esto previene que un proyecto de suscripción tenga una cuota en la DB, pero muestre un monto de inversión incorrecto al usuario.

Servicio de Correo Electrónico (Notificaciones)

El servicio emailService.js gestiona el envío de correos electrónicos transaccionales a los usuarios utilizando nodemailer. Este servicio es vital para los flujos de seguridad (confirmación de cuenta) y la lógica de negocio asociada a las Pujas.

8.1 Configuración Base
Componente	Configuración	Consideraciones de Seguridad
Transportador	nodemailer.createTransport	Utiliza variables de entorno (EMAIL_USER, EMAIL_PASS) para las credenciales.
Proveedor	service: "gmail"	Se recomienda migrar a servicios profesionales como SendGrid, Mailgun o AWS SES en producción para evitar límites y problemas de spam.
Función Base	sendEmail(to, subject, text, html)	Es la única que interactúa con el transportador. El resto de los métodos se basan en ella.

Exportar a Hojas de cálculo
8.2 Lógica de Negocio y Flujos Críticos
Este servicio implementa tres flujos de comunicación clave que deben ser activados por los controladores o servicios de negocio relevantes:

1. Confirmación de Cuenta (sendConfirmationEmail) 🔒
Propósito: Activar la cuenta del Usuario recién registrado, asegurando la validez del correo.

Activación: Debe ser llamado inmediatamente después de que el servicio de autenticación cree un nuevo usuario y le asigne un token de confirmación (generalmente guardado en la DB o generado como JWT temporal).

Regla CRÍTICA: La URL de confirmación en el correo debe apuntar a un endpoint del backend que valide el token y cambie el estado del usuario (ej., is_active: true) antes de redirigirlo al frontend.

JavaScript

/* Endpoint de ejemplo que lo activaría */
// Después de crear el nuevo usuario:
// const token = generateConfirmationToken(newUser.id);
// await emailService.sendConfirmationEmail(newUser, token); 
2. Notificación de Ganador de Lote (notificarGanadorPuja) 🏆
Propósito: Informar al usuario que ha ganado una puja y establecer la fecha límite de pago.

Flujo de Negocio: Se activa por el servicio de pujas/lotes cuando finaliza una subasta o cuando se reasigna un lote por impago.

Regla CRÍTICA: Se maneja la lógica de Reasignación (esReasignacion), mostrando un mensaje de advertencia si el lote fue reasignado debido al impago de un postor anterior.

Condición de Pago: Se establece el plazo fijo de 90 días para completar el pago.

JavaScript

// El servicio de Lotes determina la fecha límite (Ej: 90 días después de hoy)
const limite = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString();

await emailService.notificarGanadorPuja(
    ganador, 
    lote.id, 
    limite, 
    true // esReasignacion
);
3. Notificación de Impago (notificarImpago) 🛑
Propósito: Informar al usuario que ha perdido un lote por no cumplir con el plazo de 90 días.

Flujo de Negocio: Activado por un job programado (cron job) o un webhook que monitorea los plazos de pago.

Regla CRÍTICA: El correo debe confirmar explícitamente que el token de subasta ha sido devuelto a la cuenta del usuario, garantizando que el token no quede retenido tras el incumplimiento.

Servicio de Gestión de Imágenes
El servicio imagenService.js administra el modelo Imagen y está diseñado para controlar el contenido visual asociado a los Proyectos y Lotes. Su lógica de negocio se centra en el concepto de borrado suave (soft delete) para mantener un historial de activos visuales sin eliminarlos permanentemente.

9.1 imagenService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
create(data)	Registra la URL y metadatos de una nueva imagen.	Asume que el archivo físico ya fue subido a un servicio de almacenamiento (S3, GCS, etc.).
softDelete(id)	Borrado Lógico. Desactiva la imagen estableciendo el campo activo a false.	Previene la eliminación física del archivo, manteniendo un registro de la URL para auditoría o restauración.
findByProjectIdActivo	Obtiene la galería visual de un proyecto.	CRÍTICO: Utiliza el filtro activo: true para mostrar solo las imágenes disponibles al usuario final.
findByLoteIdActivo	Obtiene las imágenes específicas de un lote.	Filtra por activo: true y ordena para asegurar una presentación consistente en la galería.
findAllActivo	Consulta general para obtener todas las imágenes visibles.	El estándar de la plataforma para mostrar listas al público.

Exportar a Hojas de cálculo
9.2 Lógica de Borrado Suave (Soft Delete)
La implementación del borrado suave es la regla de negocio más importante en este servicio:

Seguridad y Auditoría: En lugar de llamar a Imagen.destroy(), el método softDelete simplemente establece imagen.activo = false. Esto permite mantener un registro de todas las URLs de contenido subido, lo que es útil para la auditoría y para evitar que una URL eliminada accidentalmente reaparezca.

Visibilidad en el Frontend: Todos los métodos de consulta destinados a la visualización pública (findByProjectIdActivo, findByLoteIdActivo, findAllActivo) deben incluir la cláusula where: { activo: true }.

Los métodos que consultan sin este filtro (findAll, findById) están reservados típicamente para el uso de Administradores que necesitan ver el historial completo, incluyendo los activos deshabilitados.

JavaScript

// Borrado suave
async softDelete(id) {
    const imagen = await Imagen.findByPk(id);
    if (!imagen) return null;
    imagen.activo = false; // Solo cambia el estado
    return await imagen.save();
}

// Consulta activa
async findByProjectIdActivo(id_proyecto) {
    return await Imagen.findAll({
        where: {
            id_proyecto: id_proyecto,
            activo: true, // FILTRO CRÍTICO DE NEGOCIO
        },
    });
}
Esta separación entre datos visibles y datos inactivos es crucial para la gestión eficiente del contenido en el sistema.

Servicio de Gestión de Inversiones
El servicio inversionService.js maneja la creación y la confirmación de las inversiones de los usuarios en los proyectos. La clave de este servicio es la transaccionalidad y la aplicación de reglas para garantizar que los proyectos no acepten inversiones cuando no deben.

10.1 inversionService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
crearInversion	Registra la intención de inversión del usuario.	Validación Previa: Chequea que el proyecto no esté Finalizado o Cancelado, que sea de tipo directo (para inversiones directas) y que tenga un monto_inversion definido.
confirmarInversion	Procesa el pago exitoso de una inversión.	TRANSACCIÓN CRÍTICA: Actualiza el estado de la Inversion a pagado, incrementa suscripciones_actuales del Proyecto, y finaliza el Proyecto si es de tipo directo.
findByUserId	Obtiene el historial de inversiones de un usuario.	Esencial para la sección de "Mis Inversiones" en el frontend.
softDelete	Desactiva una inversión (borrado suave).	Mantiene el historial de transacciones, aunque se anule la inversión.

Exportar a Hojas de cálculo
10.2 Flujo de Creación de Inversión (crearInversion)
Este método solo registra una intención y está diseñado para ser el Paso 1 en un flujo de pago:

Validación de Estado: Impide que el usuario invierta en proyectos que están fuera de mercado (Finalizado o Cancelado).

Validación de Tipo: Asegura que solo los proyectos de tipo_inversion: 'directo' (inversión única) puedan usar este endpoint. Otros tipos (como pujas o suscripciones) tendrán sus propios servicios.

Transacción (Atomización): La inversión se crea dentro de una transacción de DB. Aunque solo se crea un registro, esto asegura que, si el proyecto se invalida entre la verificación y la creación, la operación fallará limpiamente.

Estado Inicial: La inversión siempre se crea con el estado: "pendiente", esperando la confirmación del proveedor de pagos (Mercado Pago, Stripe, etc.).

JavaScript

// La inversión se registra para ser pagada
const nuevaInversion = await Inversion.create({
    monto: proyecto.monto_inversion,
    estado: "pendiente", // CRÍTICO: Esperando el webhook de pago
    // ...
});
10.3 Lógica de Confirmación de Pago (confirmarInversion)
Este es el Paso 2 (generalmente llamado desde un webhook del proveedor de pagos) y es el más crítico, ya que implica mover fondos e impactar el estado del proyecto.

El método exige una transacción de Sequelize (t) ya iniciada (típicamente por el controlador o el servicio de pagos) para garantizar la coherencia atómica:

Bloqueo de Registros: Se buscan la Inversion y el Proyecto dentro de la transacción, asegurando que no puedan ser modificados por otros procesos simultáneamente.

Incremento de Fondeo: El proyecto.suscripciones_actuales (monto total recaudado) se incrementa con el inversion.monto.

Actualización de Estados:

Inversion.estado cambia a "pagado".

Si el proyecto.tipo_inversion es "directo", su estado_proyecto cambia a "Finalizado", cerrando el proyecto automáticamente para futuras inversiones de este tipo.

Si alguna de estas operaciones falla (ej. error de base de datos), la transacción debe ser revertida (rollback), manteniendo la coherencia de los datos del proyecto y el estado de la inversión.

Servicio de JSON Web Token (JWT)
El servicio jwtService.js se encarga de la creación, firma y verificación de los JSON Web Tokens que utiliza la aplicación para manejar las sesiones de usuario y los flujos de seguridad críticos (como la Autenticación de Dos Factores - 2FA).

Se basa en la librería jsonwebtoken y utiliza la clave secreta process.env.JWT_SECRET para firmar y verificar todos los tokens.

11.1 jwtService.js (Backend)
Método	Propósito	Duración (expiresIn)	Lógica de Negocio Clave
generateToken	Crea el token de sesión principal (en login exitoso).	1 hora (1h)	Contiene el id, nombre_usuario y rol. Se usa para la autorización en cada solicitud.
verifyToken	Verifica y decodifica el token de sesión.	-	Utilizado por el middleware de autenticación para proteger las rutas.
generate2FAToken	Crea un token temporal para el proceso de verificación 2FA.	5 minutos (5m)	Solo contiene el id. Su corta duración mitiga el riesgo de que un token robado pueda ser usado más tarde para el segundo factor de autenticación.
verify2FAToken	Verifica el token de 2FA.	-	Usado para finalizar la etapa de login después de que el usuario proporciona el código TOTP (2FA).

Exportar a Hojas de cálculo
11.2 Reglas de Seguridad Clave
1. Separación de Propósito y Duración (TTL)
Es una excelente práctica de seguridad utilizar diferentes tiempos de expiración (Time To Live o TTL) para tokens con distintos propósitos:

Tokens de Sesión (generateToken): Tienen un TTL más largo (ej., 1 hora). Estos se utilizan para la actividad diaria del usuario (consultar proyectos, hacer inversiones, etc.).

Tokens de Proceso (generate2FAToken): Tienen un TTL muy corto (ej., 5 minutos). Se utilizan para validar pasos sensibles (como el 2FA o la recuperación de contraseña) y no deben ser reusables. Un token de 2FA expirado fuerza al usuario a comenzar el login de nuevo.

2. Información del Payload
Sesión Normal: Incluye el rol y el nombre_usuario. Esto permite al frontend y a los middlewares tomar decisiones de autorización y personalización sin tener que consultar la base de datos en cada solicitud.

2FA: Solo incluye el id. El objetivo es ser lo más ligero posible, ya que su única función es identificar al usuario para el siguiente paso del proceso de login.

JavaScript

/* Ejemplo de payload del token de sesión */
const payload = {
    id: 42,
    nombre_usuario: "admin_pablo",
    rol: "administrador", 
    iat: 1634283600, // Emitido en...
    exp: 1634287200, // Expira en...
};
Consideración CRÍTICA: La variable de entorno JWT_SECRET debe ser una cadena larga, compleja y única para el entorno de producción. Si esta clave se ve comprometida, todos los tokens de la aplicación quedan vulnerables.

 Servicio de Lotes y Subastas

 El servicio loteService.js administra el modelo Lote, que representa los activos que se subastan. Contiene la lógica de negocio más crítica y compleja de la plataforma, que se centra en el flujo de vida de la subasta, desde su activación hasta la gestión de impagos y reasignaciones.

12.1 loteService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
update	Actualiza un lote.	Notificación de Subasta: Si el estado cambia de inactivo a activa, envía mensajes internos a todos los usuarios activos para impulsar la participación.
endAuction	Finaliza una subasta activa.	TRANSACCIÓN CRÍTICA: Asigna el ganador potencial (id_ganador), marca la puja ganadora con el estado ganadora_pendiente y establece el plazo de 90 días. Gestiona tokens (libera a la mayoría).
asignarSiguientePuja	Reasigna el lote al siguiente postor válido.	Notificación de Reasignación: Usa emailService con el flag esReasignacion: true. Actualiza id_ganador del lote y el estado de la puja a ganadora_pendiente.
procesarImpagoLote	Maneja el vencimiento del plazo de pago.	CRON JOB: Debe ser llamado por un programador de tareas. Marca la puja como ganadora_incumplimiento, devuelve el token al incumplidor, lo notifica, e inicia el proceso de reasignación o limpieza (si se agotan 3 intentos).
prepararLoteParaReingreso	Limpia un lote para ser reutilizado.	Se llama después de 3 intentos fallidos de pago o si no hay más postores válidos. Libera el último token bloqueado, elimina todas las pujas asociadas, y reinicia el estado del lote a pendiente.

Exportar a Hojas de cálculo
12.2 Flujo de Subasta, Pago y Reasignación
Este servicio orquesta una secuencia de estados y acciones bien definidas, las cuales son siempre transaccionales (usando sequelize.transaction) para mantener la coherencia de la DB.

1. Finalización de Subasta (endAuction)
DB Transaction: Se inicia una transacción para asegurar la asignación del ganador.

Identificación: Se encuentra la pujaGanadora (la más alta).

Actualización de Estados:

Lote.estado_subasta → "finalizada".

Lote.id_ganador → pujaGanadora.id_usuario.

Lote.intentos_fallidos_pago → 1 (Primer intento).

Puja.estado_puja → "ganadora_pendiente".

Puja.fecha_vencimiento_pago → Hoy + 90 días.

Commit: Se guardan los estados en DB.

Post-Commit (Notificación/Tokens): Se notifica al ganador por email/mensaje interno y se liberan los tokens de subasta de los perdedores (excepto el Top 3, que se mantienen bloqueados para reasignación).

2. Gestión de Impago (Cron Job → procesarImpagoLote)
Esta es la lógica de negocio más delicada y se espera que se ejecute automáticamente:

Identificación de Incumplidor: Se encuentra la pujaIncumplidora (estado: ganadora_pendiente) cuyo plazo (fecha_vencimiento_pago) ha expirado.

Acciones sobre Incumplidor:

Puja.estado_puja → "ganadora_incumplimiento".

CRÍTICO: Se llama a PujaService.devolverTokenPorImpago y se notifica al usuario incumplidor.

Contador de Intentos: Se incrementa Lote.intentos_fallidos_pago.

Si ≤3 intentos: Se llama a asignarSiguientePuja para dar al siguiente postor 90 días para pagar.

Si >3 intentos o no hay más pujas válidas: Se llama a prepararLoteParaReingreso, limpiando el lote para el próximo ciclo de subasta.

Importante: La gestión de tokens de subasta es central. El token se bloquea al pujar, se devuelve al perdedor al finalizar la subasta, se devuelve al incumplidor al procesar el impago, y se elimina al limpiar el lote.

Servicio de Mensajería Interna

El servicio mensajeService.js gestiona el modelo Mensaje, que representa las comunicaciones entre usuarios y, más importantemente, las notificaciones del sistema. Sirve como el buzón de entrada interno de la aplicación.

13.1 mensajeService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
enviarMensajeSistema	FUNCIÓN CLAVE. Crea un mensaje automático con el remitente fijo SYSTEM_USER_ID (ID 1).	NOTIFICACIONES: Usado por otros servicios (como loteService) para enviar avisos críticos (ganadores de pujas, impagos, activaciones, etc.).
obtenerPorUsuario	Obtiene la bandeja de entrada y salida completa de un usuario.	Utiliza el operador [Op.or] para buscar mensajes donde el usuario sea remitente O receptor, permitiendo la vista unificada del buzón.
obtenerConversacion	Filtra mensajes entre dos usuarios específicos.	Útil para la funcionalidad de chat o soporte directo entre usuarios.
contarNoLeidos	Devuelve el número de mensajes pendientes de lectura.	Esencial para la funcionalidad del indicador de notificaciones en la interfaz de usuario.
marcarComoLeido	Actualiza el estado del mensaje.	SEGURIDAD: Solo permite que el usuario que es el receptor del mensaje cambie su estado a leido: true.

Exportar a Hojas de cálculo
13.2 Regla de Negocio Crítica: Usuario del Sistema
La variable SYSTEM_USER_ID = 1 establece una regla de negocio estricta para la mensajería:

Identidad: El usuario con el ID 1 se reserva exclusivamente para la Administración y Notificaciones Automáticas del Sistema.

Propósito de enviarMensajeSistema: Esta función garantiza que las notificaciones transaccionales o críticas enviadas por la aplicación (como la activación de una subasta o la pérdida de un lote) tengan una fuente clara y consistente.

JavaScript

/* Uso en otro servicio, por ejemplo, al notificar al ganador de una puja */
await mensajeService.enviarMensajeSistema(
    ganador.id, 
    "¡Felicidades! Has ganado el Lote #10."
);
// En la DB, el id_remitente será '1' (Sistema).
13.3 Consistencia de la Bandeja de Entrada
El método obtenerPorUsuario es la puerta de entrada a la mensajería, asegurando que el usuario vea todos los mensajes relevantes:

Al usar [Op.or] en la consulta, se combinan todos los mensajes donde:

El id_remitente es el usuario actual (mensajes enviados).

El id_receptor es el usuario actual (mensajes recibidos).

Las cláusulas include: [ {model: Usuario, as: "remitente"}, ... ] son necesarias para mostrar en el frontend el nombre de la persona que envía o recibe el mensaje, en lugar de solo su ID.

Servicio de Gestión de Pagos

El servicio pagoService.js administra el modelo Pago y es el responsable de la lógica de facturación mensual para los proyectos de tipo suscripción. Combina el cobro recurrente con la compleja aplicación de saldos a favor generados en el sistema de Pujas.

14.1 pagoService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
generarPagoMensualConDescuento	Crea la cuota del mes, aplicando saldo a favor del usuario.	Transacción para decrementar el saldo a favor en la Suscripcion y crear el Pago. Si el saldo cubre la cuota, el estado_pago se marca como cubierto_por_puja.
markAsPaid	Finaliza el proceso de pago exitoso.	Transacción para marcar el pago como pagado, establecer fecha_pago y enviar notificaciones (email y mensaje interno).
handlePaymentFailure	Maneja una transacción de pago fallida (ej. webhook de pasarela).	CRÍTICO: Si es el Pago del Mes 1, lo marca como cancelado para prevenir la generación de cuotas futuras. Si es un mes posterior, mantiene el estado pendiente/vencido.
getValidPaymentDetails	Recupera y valida un pago para ser procesado por el controlador de pago.	Verifica que el usuario autenticado sea el propietario del pago a través de la Suscripcion asociada y que el estado sea pendiente o vencido.
findPaymentsDueSoon / findOverduePayments	Consulta pagos próximos a vencer o vencidos.	Destinados a ser utilizados por un Scheduler (Cron Job) para enviar recordatorios y notificaciones de morosidad.

Exportar a Hojas de cálculo
14.2 Flujo de Generación de Pagos y Descuentos (generarPagoMensualConDescuento)
Esta función es clave para la automatización de cobros mensuales y la integración del sistema de recompensas (saldos a favor):

Transacción y Obtención de Datos: Se abre una transacción para buscar la SuscripcionProyecto y el Proyecto asociado.

Determinación del Próximo Mes: Se busca el último pago para determinar el proximoMes (Mes 1, 2, 3, etc.).

Lógica de Descuento (Saldo a Favor):

Se obtiene el saldoAFavor actual de la suscripción.

Si saldoAFavor > 0, se calcula el montoAPagar = Math.max(0, cuotaMensual - saldoAFavor).

Se actualiza el campo suscripcion.saldo_a_favor con el remanente.

Estado del Pago:

Si montoAPagar > 0: estado_pago es "pendiente".

Si montoAPagar === 0: estado_pago es "cubierto_por_puja". Esto cierra el pago inmediatamente sin requerir una transacción de pasarela.

Creación y Decremento: Se crea el nuevo registro de Pago con el monto final y se decrementa suscripcion.meses_a_pagar.

Plazo de Vencimiento Fijo
La fecha de vencimiento (fecha_vencimiento) se establece de forma fija al día 10 del mes en curso, facilitando la gestión de la morosidad.

14.3 Gestión de la Morosidad (Cron Jobs)
Los métodos findPaymentsDueSoon y findOverduePayments son la base para un sistema de recordatorios automatizados:

Método	Filtro Lógico	Propósito
findPaymentsDueSoon	Pagos pendiente con fecha_vencimiento entre Hoy y Hoy + 3 días.	Enviar Alertas de recordatorio (ej., "Tu pago vence en 3 días").
findOverduePayments	Pagos pendiente con fecha_vencimiento anterior a Hoy ([Op.lt]).	Enviar Avisos de morosidad y eventualmente aplicar la lógica de suspensión de la suscripción.

Exportar a Hojas de cálculo
El método updateLastNotificationDate es necesario para evitar enviar múltiples recordatorios en un corto período de tiempo a un mismo usuario para el mismo pago pendiente.

Servicio de Pagos (Mercado Pago Integration)

El servicio paymentService.js es la capa de abstracción entre la lógica de negocio de la plataforma y el SDK de Mercado Pago. Su principal responsabilidad es la gestión transaccional de los pagos, asegurando que el estado de la Transaccion interna y los pagos externos sean consistentes.

15.1 paymentService.js (Backend)
Método	Propósito Principal	Integración Externa	Lógica de Negocio Clave
createPaymentSession	Genera la URL de pago de Mercado Pago.	Preference	Envía la transaccionId local como external_reference y configura la notification_url (webhook) para la comunicación asíncrona.
verifyAndFetchPayment	Extrae y verifica los detalles de un pago desde un webhook.	Payment	Filtra por el topic payment y utiliza el paymentId para consultar los detalles a Mercado Pago.
procesarPagosDeMerchantOrder	Maneja los pagos agrupados por una Orden de Comercio (MO).	MerchantOrder	CRÍTICO/TRANSACCIONAL: Procesa cada pago dentro de la MO. Llama a transaccionService.confirmarTransaccion o procesarFalloTransaccion dentro de una transacción de DB para garantizar la atomicidad.
refreshPaymentStatus	Consulta el estado de una transacción de forma síncrona (ej., desde un redirect de usuario).	Payment	Actualiza la tabla PagoMercado y confirma la Transaccion si el estado es pagado.

Exportar a Hojas de cálculo
15.2 Flujo Crítico: Webhooks y Transacciones
La función más importante es procesarPagosDeMerchantOrder, que maneja el webhook de merchant_order. Esta garantiza que las actualizaciones de estado de pago afecten correctamente a la lógica de negocio local:

1. Transaccionalidad (Atomicidad)
El método inicia una transacción de base de datos (t = await sequelize.transaction()) antes de cualquier procesamiento. Esto es fundamental porque un solo evento de Mercado Pago puede desencadenar múltiples cambios en la base de datos (actualizar Transaccion, crear PagoMercado, actualizar Inversion, etc.).

JavaScript

const t = await sequelize.transaction({ ... });

try {
    // ... Lógica de consulta a MP y procesamiento
    await transaccionService.confirmarTransaccion(transaccionId, { transaction: t });
    // ...
    await t.commit(); 
} catch (error) {
    await t.rollback(); // Si algo falla, se revierte todo
    // ...
}
2. Mapeo de Estados
El objeto MP_STATUS_MAP es crucial para traducir los estados de la pasarela de pago (ej., approved, rejected) a estados de la plataforma local (pagado, rechazado), manteniendo una nomenclatura interna consistente.

3. Proceso de Pago
Estado pagado (Aprobado): Si el estado final es pagado, se llama a transaccionService.confirmarTransaccion(..., { transaction: t }). Este servicio es el responsable de ejecutar la lógica de negocio real (ej., crear la inversión o marcar la suscripción como activa).

Estado rechazado/devuelto: Se llama a transaccionService.procesarFalloTransaccion(..., { transaction: t }) para revertir la transacción interna (si es necesario) y notificar al usuario.

Este diseño separa la responsabilidad: el paymentService maneja la comunicación con Mercado Pago, mientras que el transaccionService maneja las reglas de negocio posteriores a la confirmación/falla del pago.

Servicio de Proyectos

¡Perfecto! El proyectoService es crucial para definir la estructura de la inversión, estableciendo las reglas sobre cómo se creará y fondeará cada oportunidad.

Aquí tienes la documentación en formato Markdown para el servicio proyectoService.js:

🏗️ PASO 16: Servicio de Proyectos
El servicio proyectoService.js gestiona el modelo Proyecto, que es el contenedor principal de una oportunidad de inversión. Su función más importante es la validación de las reglas de negocio al momento de la creación, asegurando la consistencia entre el tipo de inversión y sus parámetros asociados (montos, monedas, y lotes).

16.1 proyectoService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
crearProyecto	Crea un proyecto y valida la unicidad de los lotes.	Validación Dual: 1. Reglas estrictas por tipo_inversion (directo vs. mensual). 2. CRÍTICO: Evita que los lotes sean reutilizados, buscando conflictos de idProyecto en la base de datos.
findByUserId	Obtiene los proyectos en los que un usuario ha invertido.	Relación de Inversión: Utiliza include para filtrar proyectos que tienen al menos una Inversion con el id_usuario y estado: "pagado".
update	Actualiza un proyecto existente.	Flexibilidad: Permite la actualización dentro de una transacción (transaction), lo cual es esencial si la actualización forma parte de un flujo mayor (ej., un proceso de cambio de estado).
findAllActivo / findByIdActivo	Consulta proyectos visibles para el usuario.	Filtra por activo: true y siempre incluye los modelos Lote e Imagen para presentar la información completa.

Exportar a Hojas de cálculo
16.2 Reglas de Negocio en la Creación (crearProyecto)
La lógica de creación aplica validaciones estrictas basadas en el campo tipo_inversion, definiendo si el proyecto será una inversión única o un fondo de suscripción mensual:

A. Tipo directo (Inversión Única)
Moneda: Fija a "USD".

Objetivo de Suscripciones: Fijo a 0 (irrelevante para este tipo).

Pack de Lotes: Fijo a true (Entrega anticipada activa).

Requisito: monto_inversion debe ser definido (será el monto que cada inversor debe pagar).

B. Tipo mensual (Suscripción)
Moneda: Fija a "ARS".

Pack de Lotes: Fijo a false (Entrega anticipada inactiva).

Requisito: obj_suscripciones debe ser mayor a cero (define la meta de fondeo).

Requisito: monto_inversion debe ser definido (será la cuota base mensual a pagar).

C. Validación de Unicidad de Lotes
Es una regla de negocio crítica que un lote solo puede estar asociado a UN proyecto a la vez.

El servicio busca lotes que el usuario quiere asignar (lotesIds).

Utiliza Lote.findAll con where: { idProyecto: { [Op.ne]: null } } para encontrar cualquier lote de la lista que ya tenga un idProyecto asignado.

Si se encuentran lotes asignados, se lanza un error que impide la creación del proyecto, protegiendo la integridad de la inversión.

JavaScript

// La validación clave de unicidad de lotes
const lotesAsignados = await Lote.findAll({
    where: {
        id: lotesIds,
        idProyecto: { [require("sequelize").Op.ne]: null },
    },
});
16.3 Relación Inversor-Proyecto (findByUserId)
Este método es esencial para la interfaz del usuario ("Mis Proyectos"). En lugar de tener una relación directa, la propiedad se determina a través de la tabla Inversion:

Filtra los Proyectos.

Incluye la tabla Inversion con un filtro anidado (where) que exige que el id_usuario sea el consultado Y que el estado de la inversión sea "pagado" (required: true garantiza que solo se traigan los proyectos con esa inversión confirmada).

Esto asegura que solo se muestren los proyectos en los que el usuario es un inversor activo y con pago completado.

Servicio de Pujas y Subastas
El servicio pujaService.js administra el modelo Puja y el sistema de subastas por lote. Es responsable de las reglas de oferta, la gestión del token de subasta (tokens_disponibles en SuscripcionProyecto) y el crucial proceso de aplicación de excedente (saldo_a_favor).

17.1 pujaService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
create	Crea o actualiza una puja en un lote activo.	Token Consumo: Si es la primera puja del usuario en el lote, consume 1 token_disponible de la SuscripcionProyecto. Si es una actualización, no consume más tokens. Validación: Asegura que el monto sea mayor que la puja anterior y mayor que la puja más alta.
procesarPujaGanadora	CRÍTICO. Aplica el excedente de la puja ganadora después del pago.	Transacción que: 1. Cubre Pagos Pendientes (estado_pago: 'pendiente'). 2. Pre-paga Meses Futuros (decrement 'meses_a_pagar'). 3. Asigna el resto a saldo_a_favor. 4. Libera el token de los perdedores (P3, etc.).
requestCheckoutForPuja	Inicia el flujo de pago de la puja ganadora.	Llama a getValidPaymentDetails para validar la propiedad y el estado, y luego utiliza el transaccionService para generar el checkout de la pasarela.
getValidPaymentDetails	Valida que una puja esté lista para pagarse.	Asegura que el estado sea ganadora_pendiente y que el userId autenticado sea el propietario.
gestionarTokensAlFinalizar	Prepara el lote para la liquidación.	Libera los tokens de todos los participantes EXCEPTO el Top 3 (P1, P2, P3), quienes quedan bloqueados hasta que se defina el ganador.
findExpiredGanadoraPendiente	Busca pujas que han incumplido su plazo de pago.	Utilizado por un Scheduler (Cron Job) para iniciar el proceso de morosidad/impago y reasignación al siguiente postor.
devolverTokenPorImpago	Revierte el bloqueo del token tras un impago (más de 90 días).	Seguridad: Incrementa solo si el tokens_disponibles es < 1, asegurando que el usuario no obtenga tokens duplicados.

Exportar a Hojas de cálculo
17.2 La Lógica del Excedente (procesarPujaGanadora)
Cuando un usuario paga exitosamente el monto de su puja ganadora, el excedente (monto_puja - precio_base) se distribuye en una estricta jerarquía de prioridades:

Prioridad 1: Cubrir Pagos Pendientes: El excedente se utiliza para cambiar el estado de cualquier Pago mensual pendiente del usuario en ese proyecto a cubierto_por_puja.

Prioridad 2: Pre-pagar Meses Futuros: Si queda excedente, se utiliza para reducir la cuenta de suscripcion.meses_a_pagar al monto de la cuota mensual (monto_inversion).

Prioridad 3: Saldo a Favor: Cualquier remanente después de cubrir los meses futuros se agrega a suscripcion.saldo_a_favor. Este saldo se aplicará automáticamente a la próxima cuota pendiente (ver pagoService).

Prioridad 4: Excedente de Visualización: Si la suscripción ya está totalmente cubierta (meses_a_pagar <= 0), el resto se almacena en lote.excedente_visualizacion.

17.3 Gestión del Token de Subasta (Tokens)
El servicio impone una regla estricta de "Un Token por Proyecto Activo" para la participación:

Bloqueo al Pujar (create): Al hacer la primera puja en cualquier lote de un proyecto, el tokens_disponibles de la SuscripcionProyecto pasa de 1 a 0. Esto impide que el usuario puje en otros lotes del mismo proyecto.

Liberación de Perdedores Masivos (gestionarTokensAlFinalizar): Al final de la subasta, se devuelven los tokens a todos, excepto al Top 3 de postores.

Liberación Final del Perdedor (procesarPujaGanadora): Cuando el ganador (P1 o P2) paga, se libera inmediatamente el token del postor que queda bloqueado (P2 o P3), dejándolo disponible para otro proyecto.

Liberación por Impago (devolverTokenPorImpago): Si un ganador incumple el pago (ej. 90 días), se le devuelve el token para que pueda participar en el futuro, pero la puja se marca como ganadora_incumplimiento.

Servicio de Resumen de Cuenta
El servicio resumenCuentaService.js gestiona el modelo ResumenCuenta, el cual actúa como un snapshot y un indicador de progreso para las inversiones tipo suscripción mensual. Combina los datos de la SuscripcionProyecto y los Pagos realizados para mostrar al usuario su estatus actual.

18.1 resumen_cuenta.service.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
createAccountSummary	Inicializa el resumen al crear una suscripción.	Atomicidad: Utiliza options (transacción) para asegurar que el resumen se cree junto con la suscripción. Snapshot: Captura el detalle de la CuotaMensual y el total_cuotas_proyecto en el momento de la suscripción para evitar inconsistencias futuras.
updateAccountSummaryOnPayment	CRÍTICO. Actualiza el progreso después de un pago exitoso.	Cálculo de Progreso: Cuenta los pagos con estado pagado o cubierto_por_puja. Cálculo de Morosidad: Estima las cuotas_vencidas restando las cuotas_pagadas de los mesesTranscurridos desde la creación de la suscripción (moment().diff(...)).
getAccountSummariesByUserId	Obtiene todos los resúmenes del usuario.	Consulta las SuscripcionProyecto del usuario y realiza un join con ResumenCuenta y Proyecto para retornar la información clave.
findResumenByIdAndUserId	Seguridad para consultas individuales.	Usa un where en la inclusión de SuscripcionProyecto (where: { id_usuario: userId }) para prevenir el acceso a resúmenes de otros usuarios.
actualizarSaldoGeneral	(Simulación) Placeholder para saldos de inversiones directas/pujas.	Función de apoyo que indica dónde se integraría la lógica de saldo general del usuario si la plataforma lo requiriera (ej., para reinversión).

Exportar a Hojas de cálculo
18.2 Lógica de Actualización y Progreso (updateAccountSummaryOnPayment)
Esta función es vital para reflejar el estado financiero del inversor.

1. Conteo de Pagos Pagados
La métrica de cuotas_pagadas es la suma de todos los registros en la tabla Pago asociados a la suscripción que tienen un estado final y exitoso:

Pagos Completados=Pagos(estado=’pagado’)∪Pagos(estado=’cubierto_por_puja’)
El filtro se realiza directamente al incluir el modelo Pago en la consulta a SuscripcionProyecto.

2. Cálculo de Porcentaje
El porcentaje_pagado se calcula utilizando la cantidad de pagos completados sobre el total de cuotas del proyecto (meses_proyecto):

Porcentaje Pagado= 
Total Cuotas Proyecto
Cuotas Pagadas
​
 ×100
3. Cálculo de Cuotas Vencidas (Morosidad)
El cálculo de cuotas_vencidas es una estimación basada en el tiempo transcurrido desde que se creó la suscripción (fecha de inicio):

Meses Transcurridos: Se calcula la diferencia en meses entre la fecha actual y la fecha de creación de la suscripción (suscripcion.createdAt) usando moment().

Cuotas Vencidas: La morosidad se define como el número de meses que deberían haber sido pagados menos el número de cuotas que fueron pagadas:

Cuotas Vencidas=max(0,Meses Transcurridos−Cuotas Pagadas)
Este cálculo es crucial para generar reportes y automatizar procesos de cobranza o notificación de mora.

Servicio de Suscripción a Proyectos
El servicio suscripcionProyectoService.js administra el modelo SuscripcionProyecto, la entidad que formaliza la relación entre un Usuario y un Proyecto de inversión de tipo mensual. Su responsabilidad principal es gestionar el estado inicial, la vinculación a proyectos y la activación de la lógica de negocio tras el fondeo del proyecto.

19.1 suscripcionProyectoService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
_createSubscriptionRecord	Crea el registro de suscripción y actualiza el proyecto.	Transaccionalidad: Es llamado por TransaccionService y opera dentro de su transacción (t). Fondeo/Notificación: Incrementa suscripciones_actuales del proyecto. Si se alcanza el obj_suscripciones, notifica a todos los usuarios y cambia el estado_proyecto a "En proceso". Inicialización: Fija meses_a_pagar al plazo_inversion total del proyecto.
findByUserId	Consulta todas las suscripciones activas de un usuario.	Garantiza que solo se muestren las suscripciones a proyectos que también están activo: true (se asume que existe la corrección del alias proyectoAsociado).
findUsersByProjectId	Obtiene la lista de usuarios (inversores) de un proyecto.	Utiliza include para obtener las instancias de Usuario asociadas a las suscripciones activas.
findSubscriptionsReadyForPayments	(CRON Job / Scheduler) Busca suscripciones para generar pagos.	Filtra por pago_generado: false y proyectos con objetivo_cumplido: true, indicando que el proceso de generación de cuotas debe iniciar.

Exportar a Hojas de cálculo
19.2 Flujo Crítico: Creación y Fondeo (_createSubscriptionRecord)
Esta función se ejecuta después de que el usuario ha completado el pago inicial (la primera cuota o el monto base) a través del TransaccionService.

1. Verificación del Proyecto
Asegura que el proyecto esté activo y no esté en estado "Finalizado" o "Cancelado".

2. Configuración Inicial del Inversor
El campo meses_a_pagar de la suscripción se inicializa con el plazo_inversion total definido en el proyecto. Este valor se irá decrementando a medida que se realicen pagos o se aplique excedente de pujas.

3. Proceso de Fondeo (Lógica de "Crowdfunding")
Incremento: El contador proyecto.suscripciones_actuales se incrementa en 1.

Verificación de Objetivo: Comprueba si suscripciones_actuales ha alcanzado o superado el obj_suscripciones.

Activación del Proyecto:

Si se cumple el objetivo y aún no se ha notificado (objetivo_notificado: false), el proyecto se marca como fondeado.

Se actualiza el estado del proyecto a "En proceso".

Notificación Masiva: Se utiliza el MensajeService para enviar una notificación a todos los usuarios activos de la plataforma, informando que el proyecto ha sido fondeado exitosamente y ha comenzado su fase de ejecución.

Atomicidad: Al ejecutarse dentro de la misma transacción (t) que el pago de la Transaccion, se garantiza que el usuario solo obtiene su suscripción si el proyecto se actualiza correctamente y viceversa.

19.3 Inclusión del resumenCuentaService
Aunque el método _createSubscriptionRecord no llama directamente a resumenCuentaService.createAccountSummary, la importación (// >>> CAMBIO CLAVE 1 <<<) indica que este es el punto lógico en el flujo completo donde se debe inicializar el ResumenCuenta después de la creación de la suscripción, garantizando que el usuario tenga un dashboard financiero desde el inicio.

Servicio de Bajas (Cancelación de Suscripción)

El servicio suscripcionService.js se centra en la gestión del ciclo de vida de la SuscripcionProyecto, siendo su método principal el softDelete, que implementa la lógica de negocio para la cancelación de una suscripción por parte del usuario.

20.1 suscripcionService.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
softDelete	CRÍTICO. Cancela una suscripción y prepara el reembolso.	Transacción: Opera atómicamente. 1. Soft Delete: Marca activo: false en SuscripcionProyecto. 2. Contadores: Decrementa el contador suscriptores_actuales del proyecto. 3. Registro de Cancelación: Crea un registro detallado en SuscripcionCancelada para registrar el historial de pagos y el monto total pagado, lo cual se usará posteriormente para el proceso de reembolso.
findById	Búsqueda simple por ID.	Permite obtener la instancia de la suscripción.
findByUserIdAndProjectId	Búsqueda por par de claves (Usuario-Proyecto).	Útil para verificar si un usuario tiene una suscripción activa a un proyecto específico.

Exportar a Hojas de cálculo
20.2 Flujo Crítico: Cancelación de Suscripción (softDelete)
El método softDelete no realiza una eliminación física, sino que orquesta un proceso transaccional para registrar la cancelación y sus implicaciones financieras.

Inicio Transacción: Se inicia una transacción de Sequelize (t) para asegurar la atomicidad de las operaciones.

Validación: Verifica que la suscripción exista y que aún esté activa.

Soft Delete: La suscripción se actualiza, estableciendo activo en false.

Actualización del Proyecto: El campo suscriptores_actuales en el modelo Proyecto se decrementa en 1, reflejando la pérdida del inversor.

Registro para Reembolso (Modelo SuscripcionCancelada):

Identificación de Pagos: Se consultan todos los registros en la tabla Pago asociados a la suscripción con el estado 'pagado'.

Cálculo: Se suman los montos de todos los pagos exitosos para obtener el montoTotalPagado.

Creación del Registro: Se crea una nueva entrada en el modelo SuscripcionCancelada, capturando:

id_suscripcion_original

monto_pagado_total

meses_pagados

fecha_cancelacion

Propósito: El registro de SuscripcionCancelada es la única fuente de verdad para que el equipo administrativo o un sistema de terceros pueda procesar el reembolso final al inversor de acuerdo con los términos y condiciones de la plataforma.

Cierre de Transacción: Si todas las operaciones son exitosas, se realiza el commit (await t.commit()). En caso de cualquier error, se realiza el rollback (await t.rollback()), dejando la base de datos en su estado original.

Servicio de Transacciones (Motor de Pagos)

El servicio transaccionService.js es la capa de integración de la pasarela de pagos. Su responsabilidad principal es orquestar la creación de la transacción, la generación del checkout y, lo más importante, la ejecución de la lógica de negocio atómica al recibir una confirmación de pago (Webhook).

21.1 transaccion.service.js (Backend)
Método	Propósito Principal	Lógica de Negocio Clave
iniciarTransaccionYCheckout	Punto de Entrada. Crea o reutiliza una Transaccion pendiente y genera la URL de pago.	Reintento/Idempotencia: Busca transacciones pendiente o fallido para el mismo ítem (Inversión/Pago) y regenera el checkout (generarCheckoutParaTransaccionExistente). Puja Excepción: Para las Pujas, anula transacciones antiguas y crea una nueva para asegurar el monto actualizado.
generarCheckoutParaTransaccionExistente	Flujo de Bajo Nivel. Genera la preferencia de pago en la pasarela.	Garantiza que la Transaccion tenga un registro asociado en PagoMercado (findOrCreate), asegurando que el ID de la pasarela (preferenceId) esté vinculado y que la Transaccion esté marcada como pendiente. Requiere una transacción de BD activa.
confirmarTransaccion	CRÍTICO (Webhook/Éxito). Procesa el éxito del pago.	Idempotencia: Usa Lock de Actualización (t.LOCK.UPDATE) para prevenir doble procesamiento. Switch de Negocio: Ejecuta el flujo específico (manejarPagoSuscripcionInicial, manejarPagoMensual, inversionService.confirmarInversion, pujaService.procesarPujaGanadora) según el tipo_transaccion. Cierre: Marca la Transaccion como pagado y actualiza el saldo general del usuario (resta el monto).
revertirTransaccion	CRÍTICO (Reembolso/Error). Procesa la reversión de un pago exitoso.	Idempotencia: Solo revierte si el estado es pagado. Switch Inverso: Ejecuta la lógica de negocio opuesta a la confirmación (ej., pagoService.markAsReverted, inversionService.revertirInversion). Cierre: Marca la Transaccion como revertido y devuelve el monto al saldo general del usuario (suma el monto).
fallarTransaccion	Maneja fallos notificados por la pasarela (Webhook).	Si es un Pago Mensual o Inicial, invoca pagoService.handlePaymentFailure (lo que puede desencadenar la cancelación de la suscripción si es el Mes 1). Marca la Transaccion como fallido.

Exportar a Hojas de cálculo
21.2 Lógica de Suscripciones (Flujos de Confirmación)
El transaccionService contiene la lógica específica para el manejo de los pagos mensuales, que son los flujos más complejos.

A. Flujo pago_suscripcion_inicial (Pago 1)
Cuando se confirma el pago inicial, ocurre una cascada de operaciones críticas:

Se invoca suscripcionService._createSubscriptionRecord: Se crea la entidad SuscripcionProyecto, se incrementa el contador del Proyecto y se notifica el fondeo si aplica.

Se vincula la nueva Suscripcion al Pago y a la Transaccion.

Se realiza un decrement atómico en SuscripcionProyecto.meses_a_pagar (se paga el primer mes).

Se invoca pagoService.markAsPaid en el modelo Pago.

Se invoca resumenCuentaService.createAccountSummary: Se inicializa el dashboard financiero del usuario.

Se invoca resumenCuentaService.updateAccountSummaryOnPayment: Se actualiza el resumen (1 cuota pagada, 0% vencido).

B. Flujo mensual (Pagos 2+)
Cuando se confirma un pago mensual recurrente:

Se invoca pagoService.markAsPaid en el modelo Pago.

Se realiza un decrement atómico en SuscripcionProyecto.meses_a_pagar.

Se invoca resumenCuentaService.updateAccountSummaryOnPayment: Se recalcula el progreso (cuotas pagadas y morosidad).

21.3 Manejo de Saldo General (Billetera)
El servicio actúa como el controlador del saldo general del usuario (simulado por resumenCuentaService.actualizarSaldoGeneral):

Operación	Tipo de Transacción	Impacto en Saldo General
Confirmación (Éxito de Pago)	pago_suscripcion_inicial, mensual, directo, Puja	Resta el monto (-montoTransaccion). El dinero se va de la cuenta del usuario.
Reversión (Reembolso)	Todas (si estaban pagado)	Suma el monto (montoTransaccion). El dinero regresa a la cuenta del usuario.

Exportar a Hojas de cálculo
Esto garantiza la doble entrada: al pagar sale dinero, al reembolsar entra dinero.

Servicio de Usuarios
El servicio usuarioService.js es el punto de control para la administración del modelo Usuario. Maneja las funciones de creación de cuentas, verificación de identidad por email, restablecimiento de contraseñas y tareas de mantenimiento del sistema (limpieza de cuentas no utilizadas).

22.1 usuario.service.js (Backend)
Método	Propósito Principal	Lógica de Negocio/Seguridad Clave
create	Registra un nuevo usuario en el sistema.	Verificación: Genera un confirmacion_token único y con fecha de expiracion (24 horas). Marca el usuario como confirmado_email: false. Notificación: Envía el email de confirmación inmediatamente a través de emailService.
confirmEmail	Activa la cuenta de un usuario.	Validación: Busca el token y verifica que confirmacion_token_expiracion no haya pasado ([Op.gt]: new Date()). Activación: Si es válido, actualiza confirmado_email: true y activo: true (se asume que activo es el estado principal de la cuenta).
resendConfirmationEmail	Permite reenviar el correo de activación.	Genera un nuevo token de confirmación y expira el anterior, actualizando la fecha de caducidad.
generatePasswordResetToken	Inicia el flujo de recuperación de contraseña.	Genera un reset_password_token seguro y con una expiración corta (1 hora).
findByResetToken	Valida el token de recuperación.	Busca el token y verifica que no haya expirado, garantizando que el proceso de cambio de contraseña sea sensible al tiempo.
cleanUnconfirmedAccounts	Mantenimiento. Elimina cuentas que nunca se activaron.	Realiza un Hard Delete (eliminación física de la BD) de los usuarios que no han confirmado su email (confirmado_email: false) y que fueron creados hace más de X días (por defecto 7 días), liberando espacio y garantizando la higiene de la base de datos.
softDelete	Desactiva temporalmente un usuario.	Establece activo: false para inhabilitar el acceso sin borrar el registro.
findAllActivos	Obtiene solo usuarios con cuentas activas.	Útil para tareas masivas como notificaciones (visto en suscripcion_proyecto.service).

Exportar a Hojas de cálculo
22.2 Flujos de Seguridad y Tokens
El servicio utiliza crypto.randomBytes(20).toString("hex") para generar tokens criptográficamente seguros para dos propósitos principales:

Propósito	Token Almacenado	Vigencia	Efecto al Fallar la Validación
Confirmación de Email (create, resendConfirmationEmail)	confirmacion_token	24 horas	El usuario no puede iniciar sesión. Si el token expira, debe solicitar un reenvío.
Restablecimiento de Contraseña (generatePasswordResetToken)	reset_password_token	1 hora	El usuario no puede cambiar su contraseña y debe iniciar el proceso de recuperación nuevamente.

Exportar a Hojas de cálculo
Nota de Implementación: El uso de [Op.gt]: new Date() es crucial para asegurar que el token sea verificado como "aún no expirado" directamente en la consulta a la base de datos.

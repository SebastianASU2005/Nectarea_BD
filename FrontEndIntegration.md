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

### 🚨 REGLA #1: Todo Proyecto DEBE Tener un Contrato Base

**¿Por qué?**  
Cuando un usuario invierte o se suscribe, necesita descargar un contrato. Si no existe, la aplicación tirará error.

**¿Cómo lo manejo en el frontend?**

```javascript
// ❌ MAL - No verificar si existe contrato
const invertir = async () => {
  await crearInversion({ id_proyecto: 1, tokens: 100 });
};

// ✅ BIEN - Verificar antes de permitir inversión
const invertir = async (proyecto) => {
  // Verificar que el proyecto tenga contratos
  if (!proyecto.contratos || proyecto.contratos.length === 0) {
    alert(
      "Este proyecto no tiene contrato disponible. Contacta al administrador."
    );
    return;
  }

  await crearInversion({ id_proyecto: proyecto.id, tokens: 100 });
};
```

**¿Cómo lo manejo en el backend?**  
El backend YA valida esto, pero tú debes manejar el error:

```javascript
try {
  await crearInversion(data);
} catch (error) {
  if (error.response?.status === 400) {
    if (error.response.data.error.includes("contrato")) {
      showError("Este proyecto no tiene contrato. No se puede invertir.");
    }
  }
}
```

---

### 🚨 REGLA #2: Proyectos Mensuales DEBEN Tener CuotaMensual

**¿Qué es un proyecto mensual?**  
Un proyecto donde el usuario paga cuotas mensuales (como una suscripción).

**Ejemplo:** Pagar $1500/mes durante 12 meses para acumular tokens.

**¿Cómo identificar un proyecto mensual?**

```javascript
const proyecto = await getProyectoById(1);

if (proyecto.es_mensual === true) {
  console.log("Este es un proyecto de suscripción mensual");
}
```

**¿Por qué debe tener CuotaMensual?**  
Porque si alguien se suscribe, el sistema necesita saber:

- ¿Cuánto paga por mes?
- ¿Cuántos meses dura el proyecto?

**¿Qué pasa si no existe?**  
El backend tirará error 400:

```json
{
  "error": "Este proyecto no tiene configuración de cuota mensual"
}
```

**¿Cómo lo manejo en el frontend?**

```javascript
// Antes de mostrar el botón de "Suscribirse"
const mostrarBotonSuscripcion = (proyecto) => {
  if (!proyecto.es_mensual) {
    return false; // No mostrar botón
  }

  // Verificar que tenga cuota mensual configurada
  if (!proyecto.cuota_mensual) {
    console.error("Proyecto mensual sin cuota configurada");
    return false;
  }

  return true;
};
```

---

### 🚨 REGLA #3: No Puedes Invertir en un Proyecto Sin Tokens Disponibles

```javascript
const proyecto = await getProyectoById(1);

if (proyecto.tokens_disponibles === 0) {
  alert("Este proyecto ya no tiene tokens disponibles");
  return;
}

if (tokensAComprar > proyecto.tokens_disponibles) {
  alert(`Solo hay ${proyecto.tokens_disponibles} tokens disponibles`);
  return;
}
```

---

### 🚨 REGLA #4: No Puedes Hacer Pujas en Proyectos que No Lo Permiten

```javascript
const proyecto = await getProyectoById(1);

if (proyecto.permite_pujas === false) {
  alert("Este proyecto no acepta pujas");
  return;
}
```

---

### 🚨 REGLA #5: El Usuario Debe Tener Saldo Suficiente (En Algunos Casos)

```javascript
const usuario = await getCurrentUser();
const proyecto = await getProyectoById(1);
const monto = tokens * proyecto.precio_token;

if (usuario.saldo_general < monto) {
  alert("No tienes saldo suficiente. Debes recargar tu cuenta.");
  return;
}
```

⚠️ **Nota:** Esto depende de la lógica de negocio. En algunos casos, el usuario paga directamente con MP y no necesita saldo previo.

---

### 🚨 REGLA #6: Transacciones Pendientes No Se Pueden Duplicar

```javascript
// Antes de crear una nueva inversión, verifica si ya tiene una pendiente
const misPendientes = await getMisInversiones();
const tienePendiente = misPendientes.some(
  (inv) => inv.id_proyecto === proyectoId && inv.estado === "pendiente"
);

if (tienePendiente) {
  alert(
    "Ya tienes una inversión pendiente en este proyecto. Completa el pago primero."
  );
  return;
}
```

---

## 🔐 PASO 5: Implementación de Autenticación

### 5.1 Crear el Servicio de Autenticación

Crea `src/services/authService.js`:

```javascript
import apiClient from "./api";

// ============================================
// REGISTRO
// ============================================
export const register = async (userData) => {
  try {
    const response = await apiClient.post("/auth/register", {
      email: userData.email,
      password: userData.password,
      nombre: userData.nombre,
      apellido: userData.apellido,
      telefono: userData.telefono || "",
      direccion: userData.direccion || "",
    });

    const { token, user } = response.data.data;

    // Guardar en localStorage
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    return { token, user };
  } catch (error) {
    console.error("Error en registro:", error);
    throw error;
  }
};

// ============================================
// LOGIN
// ============================================
export const login = async (credentials) => {
  try {
    const response = await apiClient.post("/auth/login", {
      email: credentials.email,
      password: credentials.password,
    });

    const { token, user } = response.data.data;

    // Guardar en localStorage
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    return { token, user };
  } catch (error) {
    console.error("Error en login:", error);
    throw error;
  }
};

// ============================================
// OBTENER USUARIO ACTUAL
// ============================================
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get("/auth/me");
    return response.data.data;
  } catch (error) {
    console.error("Error al obtener usuario:", error);
    throw error;
  }
};

// ============================================
// LOGOUT
// ============================================
export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
};

// ============================================
// VERIFICAR SI ESTÁ AUTENTICADO
// ============================================
export const isAuthenticated = () => {
  return !!localStorage.getItem("token");
};

// ============================================
// OBTENER USUARIO DEL LOCALSTORAGE
// ============================================
export const getStoredUser = () => {
  const user = localStorage.getItem("user");
  return user ? JSON.parse(user) : null;
};
```

### 5.2 Crear un Componente de Login

```jsx
// src/components/Login.jsx
import { useState } from "react";
import { login } from "../services/authService";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { user } = await login({ email, password });
      console.log("✅ Login exitoso:", user);
      navigate("/dashboard");
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Email o contraseña incorrectos");
      } else {
        setError("Error al iniciar sesión. Intenta nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Iniciar Sesión</h2>
      {error && <div style={{ color: "red" }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Iniciando..." : "Iniciar Sesión"}
        </button>
      </form>
    </div>
  );
}
```

### 5.3 Crear un Componente de Registro

```jsx
// src/components/Register.jsx
import { useState } from "react";
import { register } from "../services/authService";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    nombre: "",
    apellido: "",
    telefono: "",
    direccion: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validar que las contraseñas coincidan
    if (formData.password !== formData.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    // Validar longitud de contraseña
    if (formData.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setLoading(true);

    try {
      const { user } = await register(formData);
      console.log("✅ Registro exitoso:", user);
      navigate("/dashboard");
    } catch (err) {
      if (err.response?.status === 400) {
        setError(err.response.data.error || "Datos inválidos");
      } else if (err.response?.status === 409) {
        setError("Este email ya está registrado");
      } else {
        setError("Error al registrarse. Intenta nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Crear Cuenta</h2>
      {error && <div style={{ color: "red" }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          name="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
        />

        <input
          type="text"
          name="nombre"
          placeholder="Nombre"
          value={formData.nombre}
          onChange={handleChange}
          required
        />

        <input
          type="text"
          name="apellido"
          placeholder="Apellido"
          value={formData.apellido}
          onChange={handleChange}
          required
        />

        <input
          type="tel"
          name="telefono"
          placeholder="Teléfono (opcional)"
          value={formData.telefono}
          onChange={handleChange}
        />

        <input
          type="text"
          name="direccion"
          placeholder="Dirección (opcional)"
          value={formData.direccion}
          onChange={handleChange}
        />

        <input
          type="password"
          name="password"
          placeholder="Contraseña (mín. 8 caracteres)"
          value={formData.password}
          onChange={handleChange}
          required
        />

        <input
          type="password"
          name="confirmPassword"
          placeholder="Confirmar contraseña"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "Creando cuenta..." : "Registrarse"}
        </button>
      </form>
    </div>
  );
}
```

---

## 📊 PASO 6: Trabajando con Proyectos

### 6.1 Crear el Servicio de Proyectos

```javascript
// src/services/proyectoService.js
import apiClient from "./api";

// ============================================
// LISTAR PROYECTOS
// ============================================
```

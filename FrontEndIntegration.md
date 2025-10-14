# 🎨 Guía de Integración Frontend - Nectárea API

Esta guía está diseñada para el equipo de frontend que consumirá la API de Nectárea.

---

## 📋 Tabla de Contenidos

- [Información General](#información-general)
- [Configuración Inicial](#configuración-inicial)
- [Autenticación](#autenticación)
- [Endpoints por Funcionalidad](#endpoints-por-funcionalidad)
- [Flujos Completos](#flujos-completos)
- [Manejo de Errores](#manejo-de-errores)
- [Ejemplos de Código](#ejemplos-de-código)
- [Testing de la API](#testing-de-la-api)

---

## 🌐 Información General

### Base URL

```
Desarrollo: http://localhost:3000/api
Producción: https://api.nectarea.com/api
```

### Formato de Datos

- **Request**: JSON
- **Response**: JSON
- **Encoding**: UTF-8

### Headers Requeridos

```javascript
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer {token}' // Solo en rutas protegidas
}
```

---

## ⚙️ Configuración Inicial

### Instalación de Axios (Recomendado)

```bash
npm install axios
```

### Configuración Base

```javascript
// src/services/api.js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar token automáticamente
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor para manejar errores de autenticación
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado o inválido
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

---

## 🔐 Autenticación

### 1. Registro de Usuario

**Endpoint:** `POST /auth/register`

```javascript
// src/services/authService.js
import apiClient from './api';

export const register = async (userData) => {
  const response = await apiClient.post('/auth/register', {
    email: userData.email,
    password: userData.password,
    nombre: userData.nombre,
    apellido: userData.apellido,
    telefono: userData.telefono,
    direccion: userData.direccion,
  });
  
  return response.data;
};
```

**Request Body:**
```json
{
  "email": "usuario@example.com",
  "password": "Password123!",
  "nombre": "Juan",
  "apellido": "Pérez",
  "telefono": "5491123456789",
  "direccion": "Calle Falsa 123"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "data": {
    "user": {
      "id": 1,
      "email": "usuario@example.com",
      "nombre": "Juan",
      "rol": "usuario"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Guardar Token:**
```javascript
// Al recibir la respuesta
const { token, user } = response.data.data;
localStorage.setItem('token', token);
localStorage.setItem('user', JSON.stringify(user));
```

---

### 2. Inicio de Sesión

**Endpoint:** `POST /auth/login`

```javascript
export const login = async (credentials) => {
  const response = await apiClient.post('/auth/login', {
    email: credentials.email,
    password: credentials.password,
  });
  
  const { token, user } = response.data.data;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  
  return response.data;
};
```

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
    "user": {
      "id": 1,
      "email": "usuario@example.com",
      "nombre": "Juan",
      "rol": "usuario",
      "saldo_general": 0
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 3. Obtener Usuario Actual

**Endpoint:** `GET /auth/me`

```javascript
export const getCurrentUser = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "usuario@example.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "rol": "usuario",
    "saldo_general": 5000,
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### 4. Cerrar Sesión

```javascript
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};
```

---

## 📊 Endpoints por Funcionalidad

### 🏗 Proyectos

#### Listar Proyectos Activos

**Endpoint:** `GET /proyectos`

```javascript
// src/services/proyectoService.js
import apiClient from './api';

export const getProyectos = async (params = {}) => {
  const response = await apiClient.get('/proyectos', { params });
  return response.data.data;
};
```

**Query Parameters (Opcionales):**
```
?estado=activo          // Filtrar por estado
?page=1                 // Paginación
&limit=10               // Resultados por página
&sortBy=createdAt       // Ordenar por campo
&order=DESC             // ASC o DESC
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "proyectos": [
      {
        "id": 1,
        "nombre": "Proyecto Solar",
        "descripcion": "Instalación de paneles solares",
        "monto_objetivo": 100000,
        "tokens_totales": 10000,
        "tokens_disponibles": 7500,
        "precio_token": 10,
        "estado": "activo",
        "fecha_inicio": "2025-01-01",
        "fecha_fin": "2025-12-31",
        "imagen_url": "https://...",
        "tipo_inversion": "directo"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

---

#### Obtener Proyecto por ID

**Endpoint:** `GET /proyectos/:id`

```javascript
export const getProyectoById = async (id) => {
  const response = await apiClient.get(`/proyectos/${id}`);
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "nombre": "Proyecto Solar",
    "descripcion": "Descripción detallada...",
    "monto_objetivo": 100000,
    "tokens_totales": 10000,
    "tokens_disponibles": 7500,
    "tokens_vendidos": 2500,
    "precio_token": 10,
    "estado": "activo",
    "tipo_inversion": "directo",
    "permite_pujas": true,
    "inversiones": [
      {
        "id": 1,
        "id_usuario": 5,
        "tokens": 100,
        "monto": 1000,
        "fecha": "2025-01-10"
      }
    ],
    "contratos": [
      {
        "id": 1,
        "nombre_archivo": "contrato_proyecto_1.pdf",
        "tipo_contrato": "inversion"
      }
    ]
  }
}
```

---

### 💰 Inversiones

#### Listar Mis Inversiones

**Endpoint:** `GET /inversiones` 🔒 (Requiere autenticación)

```javascript
// src/services/inversionService.js
import apiClient from './api';

export const getMisInversiones = async () => {
  const response = await apiClient.get('/inversiones');
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_usuario": 1,
      "id_proyecto": 1,
      "tokens": 100,
      "monto": 1000,
      "estado": "confirmado",
      "fecha_inversion": "2025-01-10T14:30:00.000Z",
      "proyecto": {
        "id": 1,
        "nombre": "Proyecto Solar",
        "estado": "activo"
      },
      "transaccion": {
        "id": 5,
        "estado_transaccion": "pagado"
      }
    }
  ]
}
```

---

#### Crear Nueva Inversión

**Endpoint:** `POST /inversiones` 🔒

```javascript
export const crearInversion = async (inversionData) => {
  const response = await apiClient.post('/inversiones', {
    id_proyecto: inversionData.id_proyecto,
    tokens: inversionData.tokens,
    monto: inversionData.monto,
  });
  
  return response.data.data;
};
```

**Request Body:**
```json
{
  "id_proyecto": 1,
  "tokens": 100,
  "monto": 1000
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Inversión creada. Procede al pago.",
  "data": {
    "inversion": {
      "id": 5,
      "id_usuario": 1,
      "id_proyecto": 1,
      "tokens": 100,
      "monto": 1000,
      "estado": "pendiente"
    },
    "transaccion": {
      "id": 10,
      "estado_transaccion": "pendiente"
    }
  }
}
```

**⚠️ Importante:** Después de crear la inversión, debes iniciar el proceso de pago (ver sección [Flujo de Pago](#-flujo-de-pago-completo))

---

### 🎯 Pujas

#### Listar Mis Pujas

**Endpoint:** `GET /pujas` 🔒

```javascript
// src/services/pujaService.js
import apiClient from './api';

export const getMisPujas = async () => {
  const response = await apiClient.get('/pujas');
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_usuario": 1,
      "id_proyecto": 2,
      "monto_ofrecido": 5000,
      "tokens_solicitados": 500,
      "estado": "activa",
      "fecha_puja": "2025-01-12T10:00:00.000Z",
      "proyecto": {
        "id": 2,
        "nombre": "Proyecto Eólico",
        "estado": "activo"
      }
    }
  ]
}
```

---

#### Crear Nueva Puja

**Endpoint:** `POST /pujas` 🔒

```javascript
export const crearPuja = async (pujaData) => {
  const response = await apiClient.post('/pujas', {
    id_proyecto: pujaData.id_proyecto,
    monto_ofrecido: pujaData.monto_ofrecido,
    tokens_solicitados: pujaData.tokens_solicitados,
  });
  
  return response.data.data;
};
```

**Request Body:**
```json
{
  "id_proyecto": 2,
  "monto_ofrecido": 5000,
  "tokens_solicitados": 500
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Puja creada exitosamente",
  "data": {
    "puja": {
      "id": 3,
      "id_usuario": 1,
      "id_proyecto": 2,
      "monto_ofrecido": 5000,
      "tokens_solicitados": 500,
      "estado": "pendiente"
    },
    "transaccion": {
      "id": 15,
      "estado_transaccion": "pendiente"
    }
  }
}
```

---

#### Obtener Pujas de un Proyecto

**Endpoint:** `GET /pujas/proyecto/:id` 🔒

```javascript
export const getPujasProyecto = async (idProyecto) => {
  const response = await apiClient.get(`/pujas/proyecto/${idProyecto}`);
  return response.data.data;
};
```

---

### 💳 Pagos (Mercado Pago)

#### Crear Sesión de Pago

**Endpoint:** `POST /payment/checkout` 🔒

```javascript
// src/services/paymentService.js
import apiClient from './api';

export const createCheckout = async (paymentData) => {
  const response = await apiClient.post('/payment/checkout', {
    id_transaccion: paymentData.id_transaccion, // Opcional si es nueva
    tipo_transaccion: paymentData.tipo_transaccion, // 'directo', 'puja', 'suscripcion'
    monto: paymentData.monto,
    id_proyecto: paymentData.id_proyecto,
    id_inversion: paymentData.id_inversion, // Si aplica
    id_puja: paymentData.id_puja, // Si aplica
    id_suscripcion: paymentData.id_suscripcion, // Si aplica
    metodo: 'mercadopago',
  });
  
  return response.data;
};
```

**Request Body (Ejemplo: Pagar una inversión):**
```json
{
  "tipo_transaccion": "directo",
  "monto": 1000,
  "id_proyecto": 1,
  "id_inversion": 5,
  "metodo": "mercadopago"
}
```

**Response (200):**
```json
{
  "success": true,
  "transaccionId": 10,
  "pagoMercadoId": 3,
  "tipo": "directo",
  "monto": 1000,
  "redirectUrl": "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=123456789-abc123"
}
```

**Acción del Frontend:**
```javascript
const handlePago = async () => {
  try {
    const result = await createCheckout({
      tipo_transaccion: 'directo',
      monto: 1000,
      id_proyecto: 1,
      id_inversion: 5,
    });
    
    // Redirigir al usuario a Mercado Pago
    window.location.href = result.redirectUrl;
  } catch (error) {
    console.error('Error al crear checkout:', error);
  }
};
```

---

#### Consultar Estado de Pago

**Endpoint:** `GET /payment/status/:id_transaccion` 🔒

```javascript
export const getPaymentStatus = async (transaccionId, refresh = false) => {
  const response = await apiClient.get(`/payment/status/${transaccionId}`, {
    params: { refresh: refresh ? 'true' : 'false' }
  });
  
  return response.data;
};
```

**Query Parameters:**
- `refresh=true`: Fuerza actualización desde Mercado Pago

**Response (200):**
```json
{
  "success": true,
  "transaccion": {
    "id": 10,
    "tipo": "directo",
    "monto": 1000,
    "estado": "pagado",
    "fecha": "2025-01-15T12:00:00.000Z",
    "id_inversion": 5,
    "id_proyecto": 1
  },
  "pagoPasarela": {
    "id": 3,
    "transaccionIdPasarela": "12345678",
    "monto": 1000,
    "estado": "aprobado",
    "metodo": "credit_card",
    "fecha": "2025-01-15T12:05:00.000Z"
  }
}
```

---

### 📄 Contratos

#### Listar Mis Contratos

**Endpoint:** `GET /contratos` 🔒

```javascript
// src/services/contratoService.js
import apiClient from './api';

export const getMisContratos = async () => {
  const response = await apiClient.get('/contratos');
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "id_proyecto": 1,
      "nombre_archivo": "contrato_inversion_proyecto_1.pdf",
      "tipo_contrato": "inversion",
      "fecha_subida": "2025-01-10T09:00:00.000Z",
      "proyecto": {
        "id": 1,
        "nombre": "Proyecto Solar"
      }
    }
  ]
}
```

---

#### Descargar Contrato

**Endpoint:** `GET /contratos/:id/download` 🔒

```javascript
export const descargarContrato = async (contratoId) => {
  const response = await apiClient.get(`/contratos/${contratoId}/download`, {
    responseType: 'blob', // Importante para archivos
  });
  
  // Crear un link de descarga
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `contrato_${contratoId}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
};
```

---

### 💬 Mensajes

#### Listar Mis Mensajes

**Endpoint:** `GET /mensajes` 🔒

```javascript
// src/services/mensajeService.js
import apiClient from './api';

export const getMisMensajes = async () => {
  const response = await apiClient.get('/mensajes');
  return response.data.data;
};
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "recibidos": [
      {
        "id": 1,
        "id_remitente": 2,
        "contenido": "Tu inversión fue confirmada",
        "fecha_envio": "2025-01-15T10:00:00.000Z",
        "leido": false,
        "remitente": {
          "id": 2,
          "nombre": "Administrador",
          "rol": "admin"
        }
      }
    ],
    "enviados": [
      {
        "id": 2,
        "id_receptor": 2,
        "contenido": "Tengo una consulta sobre el proyecto",
        "fecha_envio": "2025-01-14T15:30:00.000Z",
        "leido": true
      }
    ]
  }
}
```

---

#### Enviar Mensaje

**Endpoint:** `POST /mensajes` 🔒

```javascript
export const enviarMensaje = async (mensajeData) => {
  const response = await apiClient.post('/mensajes', {
    id_receptor: mensajeData.id_receptor,
    contenido: mensajeData.contenido,
  });
  
  return response.data.data;
};
```

**Request Body:**
```json
{
  "id_receptor": 2,
  "contenido": "Hola, tengo una consulta sobre mi inversión"
}
```

---

#### Marcar Mensaje como Leído

**Endpoint:** `PUT /mensajes/:id/leer` 🔒

```javascript
export const marcarComoLeido = async (mensajeId) => {
  const response = await apiClient.put(`/mensajes/${mensajeId}/leer`);
  return response.data;
};
```

---

## 🔄 Flujos Completos

### 💰 Flujo de Pago Completo (Inversión)

```javascript
// 1. Usuario selecciona proyecto y cantidad de tokens
const proyecto = await getProyectoById(1);
const tokens = 100;
const monto = tokens * proyecto.precio_token; // 1000

// 2. Crear la inversión
const { inversion, transaccion } = await crearInversion({
  id_proyecto: 1,
  tokens: 100,
  monto: 1000,
});

// 3. Iniciar el proceso de pago
const checkout = await createCheckout({
  tipo_transaccion: 'directo',
  monto: 1000,
  id_proyecto: 1,
  id_inversion: inversion.id,
});

// 4. Redirigir al usuario a Mercado Pago
window.location.href = checkout.redirectUrl;

// 5. Usuario paga en MP y es redirigido de vuelta a tu frontend
// URL de retorno: https://tu-frontend.com/pago-estado?transaccion=10

// 6. En la página de retorno, consultar el estado
const urlParams = new URLSearchParams(window.location.search);
const transaccionId = urlParams.get('transaccion');

const estadoPago = await getPaymentStatus(transaccionId, true);

if (estadoPago.transaccion.estado === 'pagado') {
  // ✅ Pago exitoso
  showSuccessMessage('¡Inversión confirmada!');
  redirectTo('/mis-inversiones');
} else if (estadoPago.transaccion.estado === 'pendiente') {
  // ⏳ Pago pendiente
  showInfoMessage('Tu pago está en proceso...');
} else {
  // ❌ Pago fallido
  showErrorMessage('El pago falló. Intenta nuevamente.');
}
```

---

### 🎯 Flujo de Puja

```javascript
// 1. Usuario crea una puja
const { puja, transaccion } = await crearPuja({
  id_proyecto: 2,
  monto_ofrecido: 5000,
  tokens_solicitados: 500,
});

// 2. Iniciar pago (mismo flujo que inversión)
const checkout = await createCheckout({
  tipo_transaccion: 'puja',
  monto: 5000,
  id_proyecto: 2,
  id_puja: puja.id,
});

// 3. Redirigir a MP
window.location.href = checkout.redirectUrl;

// 4. Consultar estado al retornar
// (mismo proceso que inversión)
```

---

### 🔄 Polling de Estado de Pago

Si el usuario cierra la ventana de MP y no es redirigido, puedes hacer polling:

```javascript
const pollPaymentStatus = async (transaccionId, maxAttempts = 20) => {
  let attempts = 0;
  
  const poll = setInterval(async () => {
    attempts++;
    
    try {
      const status = await getPaymentStatus(transaccionId, true);
      
      if (status.transaccion.estado === 'pagado') {
        clearInterval(poll);
        showSuccessMessage('¡Pago confirmado!');
        redirectTo('/mis-inversiones');
      } else if (status.transaccion.estado === 'fallido') {
        clearInterval(poll);
        showErrorMessage('El pago falló');
      } else if (attempts >= maxAttempts) {
        clearInterval(poll);
        showWarningMessage('No pudimos confirmar el pago. Revisa tu email.');
      }
    } catch (error) {
      console.error('Error al consultar estado:', error);
    }
  }, 3000); // Cada 3 segundos
};
```

---

## ⚠️ Manejo de Errores

### Estructura de Errores de la API

```json
{
  "success": false,
  "error": "Mensaje de error legible",
  "details": {
    "campo": "Detalle específico del error"
  }
}
```

### Códigos de Estado HTTP

| Código | Significado | Acción del Frontend |
|--------|-------------|---------------------|
| 200 | Éxito | Mostrar datos |
| 201 | Creado | Redirigir o actualizar vista |
| 400 | Solicitud incorrecta | Mostrar errores de validación |
| 401 | No autorizado | Redirigir a login |
| 403 | Prohibido | Mostrar mensaje de permisos |
| 404 | No encontrado | Mostrar "No encontrado" |
| 409 | Conflicto | Mostrar error específico |
| 500 | Error del servidor | Mostrar error genérico |

### Ejemplo de Manejo de Errores

```javascript
// src/utils/errorHandler.js
export const handleApiError = (error) => {
  if (error.response) {
    // El servidor respondió con un código de error
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return {
          title: 'Datos inválidos',
          message: data.error || 'Por favor revisa los datos ingresados',
          details: data.details,
        };
      
      case 401:
        localStorage.removeItem('token');
        window.location.href = '/login';
        return {
          title: 'Sesión expirada',
          message: 'Por favor inicia sesión nuevamente',
        };
      
      case 403:
        return {
          title: 'Acceso denegado',
          message: 'No tienes permisos para realizar esta acción',
        };
      
      case 404:
        return {
          title: 'No encontrado',
          message: data.error || 'El recurso solicitado no existe',
        };
      
      case 409:
        return {
          title: 'Conflicto',
          message: data.error || 'Ya existe un registro similar',
        };
      
      case 500:
        return {
          title: 'Error del servidor',
          message: 'Ocurrió un error. Por favor intenta más tarde',
        };
      
      default:
        return {
          title: 'Error',
          message: data.error || 'Ocurrió un error inesperado',
        };
    }
  } else if (error.request) {
    // La solicitud se hizo pero no hubo respuesta
    return {
      title: 'Sin conexión',
      message: 'No se pudo conectar con el servidor. Verifica tu conexión.',
    };
  } else {
    // Error al configurar la solicitud
    return {
      title: 'Error',
      message: error.message || 'Ocurrió un error inesperado',
    };
  }
};
```

**Uso:**
```javascript
try {
  await crearInversion(data);
} catch (error) {
  const errorInfo = handleApiError(error);
  showToast(errorInfo.title, errorInfo.message, 'error');
}
```

---

## 💻 Ejemplos de Código

### Ejemplo Completo: Componente de Inversión (React)

```jsx
// src/components/InversionForm.jsx
import { useState } from 'react';
import { crearInversion, createCheckout } from '../services';
import { handleApiError } from '../utils/errorHandler';

export default function InversionForm({ proyecto }) {
  const [tokens, setTokens] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const monto = tokens * proyecto.precio_token;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 1. Crear inversión
      const { inversion } = await crearInversion({
        id_proyecto: proyecto.id,
        tokens,
        monto,
      });
      
      // 2. Crear checkout
      const checkout = await createCheckout({
        tipo_transaccion: 'directo',
        monto,
        id_proyecto: proyecto.id,
        id_inversion: inversion.id,
      });
      
      // 3. Redirigir a MP
      window.location.href = checkout.redirectUrl;
      
    } catch (error) {
      const errorInfo = handleApiError(error);
      alert(`${errorInfo.title}: ${errorInfo.message}`);
      setLoading(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h3>{proyecto.nombre}</h3>
      <p>Precio por token: ${proyecto.precio_token}</p>
      
      <label>
        Cantidad de tokens:
        <input
          type="number"
          min="1"
          max={proyecto.tokens_disponibles}
          value={tokens}
          onChange={(e) => setTokens(parseInt(e.target.value))}
        />
      </label>
      
      <p>Total a pagar: ${monto}</p>
      
      <button type="submit" disabled={loading}>
        {loading ? 'Procesando...' : 'Invertir Ahora'}
      </button>
    </form>
  );
}
```

---

### Ejemplo: Página de Estado de Pago

```jsx
// src/pages/PaymentStatus.jsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getPaymentStatus } from '../services/paymentService';

export default function PaymentStatus() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const transaccionId = searchParams.get('transaccion');
  
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await getPaymentStatus(transaccionId, true);
        setStatus(result.transaccion.estado);
        setLoading(false);
        
        // Redirigir después de 3 segundos si está pagado
        if (result.transaccion.estado === 'pagado') {
          setTimeout(() => navigate('/mis-inversiones'), 3000);
        }
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };
    
    if (transaccionId) {
      checkStatus();
    }
  }, [transaccionId, navigate]);
  
  if (loading) {
    return <div>Verificando pago...</div>;
  }
  
  if (status === 'pagado') {
    return (
      <div className="success">
        <h2>✅ ¡Pago Exitoso!</h2>
        <p>Tu inversión ha sido confirmada</p>
        <p>Serás redirigido en unos segundos...</p>
      </div>
    );
  }
  
  if (status === 'fallido') {
    return (
      <div className="error">
        <h2>❌ Pago Fallido</h2>
        <p>No se pudo procesar tu pago</p>
        <button onClick={() => navigate('/proyectos')}>
          Volver a intentar
        </button>
      </div>
    );
  }
  
  return (
    <div className="pending">
      <h2>⏳ Pago Pendiente</h2>
      <p>Tu pago está siendo procesado</p>
      <p>Recibirás un email cuando se confirme</p>
    </div>
  );
}
```

---

## 🧪 Testing de la API

### Usando Postman

1. Importa la colección desde: [Enlace a colección]
2. Configura la variable `{{baseURL}}` a `http://localhost:3000/api`
3. Para endpoints protegidos:
   - Primero haz login
   - Copia el token de la respuesta
   - En Headers, agrega: `Authorization: Bearer {token}`

### Ejemplo de Test con cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123!"}'

# Usar el token obtenido
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Listar proyectos
curl -X GET http://localhost:3000/api/proyectos \
  -H "Authorization: Bearer $TOKEN"

# Crear inversión
curl -X POST http://localhost:3000/api/inversiones \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id_proyecto":1,"tokens":100,"monto":1000}'
```

---

## 🔗 Enlaces Útiles

- **Repositorio Backend**: https://github.com/SebastianASU2005/Nectarea_BD
- **Documentación Mercado Pago**: https://www.mercadopago.com.ar/developers
- **Postman Collection**: [Próximamente]

---

## 📞 Soporte

Si encuentras algún problema o tienes dudas sobre la API:

1. Revisa esta documentación
2. Consulta el README.md del repositorio
3. Abre un Issue en GitHub
4. Contacta al equipo de backend

---

**Última actualización:** Octubre 2025  
**Versión de la API:** 1.0.0
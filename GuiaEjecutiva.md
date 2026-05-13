# 📘 Guía Ejecutiva - Plataforma Nectárea

**Documentación para Stakeholders No Técnicos**

_Versión 1.0 | Octubre 2025_

---

## 📋 Índice

1. [¿Qué es Nectárea?](#qué-es-nectárea)
2. [¿Cómo Funciona la Plataforma?](#cómo-funciona-la-plataforma)
3. [Tipos de Usuarios](#tipos-de-usuarios)
4. [Flujos de Negocio Principales](#flujos-de-negocio-principales)
5. [Sistema de Seguridad](#sistema-de-seguridad)
6. [Gestión de Pagos](#gestión-de-pagos)
7. [Reportes y Métricas](#reportes-y-métricas)
8. [Preguntas Frecuentes](#preguntas-frecuentes)

---

## 🎯 ¿Qué es Nectárea?

Nectárea es una **plataforma digital de crowdfunding** (financiamiento colectivo) que conecta inversores con proyectos de construcción. Piensa en ella como un "Kickstarter" pero especializado en el sector de la construcción.

### ¿Qué hace la plataforma?

✅ Permite a las personas **invertir dinero** en proyectos de construcción  
✅ Ofrece **dos formas de inversión**: directa (un solo pago osea inversores) o mensual (cuotas osea ahorristas)  
✅ Incluye un **sistema de subastas** para lotes
✅ Procesa **pagos seguros** mediante Mercado Pago  
✅ Envía **notificaciones automáticas** por email  
✅ Genera **contratos digitales** para cada inversión

---

## 🏗️ ¿Cómo Funciona la Plataforma?

### Arquitectura Simplificada

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  👤 USUARIOS (Clientes e Inversores)                │
│  Acceden desde navegador web                        │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   │ Internet
                   ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  🖥️ SERVIDOR BACKEND (Cerebro de la plataforma)    │
│  • Valida datos                                     │
│  • Procesa pagos                                    │
│  • Gestiona inversiones                             │
│  • Envía notificaciones                             │
│                                                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│                                                     │
│  💾 BASE DE DATOS (Almacén de información)          │
│  • Usuarios registrados                             │
│  • Proyectos activos                                │
│  • Transacciones e inversiones                      │
│  • Contratos firmados                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 👥 Tipos de Usuarios

### 1. **Cliente/Inversor** (Usuario Regular)

**Puede:**

- ✅ Registrarse y crear una cuenta
- ✅ Invertir en proyectos (directa o mensualmente)
- ✅ Participar en subastas de lotes
- ✅ Ver sus inversiones, pagos y suscripciones
- ✅ Descargar contratos firmados
- ✅ Recibir mensajes del sistema

**No puede:**

- ❌ Crear proyectos nuevos
- ❌ Modificar datos de otros usuarios
- ❌ Ver información de otras inversiones

### 2. **Administrador** (Admin)

**Puede hacer TODO lo del cliente, más:**

- ✅ Crear y modificar proyectos
- ✅ Gestionar lotes y subastas
- ✅ Ver todas las inversiones y transacciones
- ✅ Subir contratos plantilla
- ✅ Generar reportes financieros
- ✅ Gestionar usuarios (activar/desactivar)

---

## 💼 Flujos de Negocio Principales

### 1️⃣ Inversión Directa (Un Solo Pago)

**Ejemplo:** María quiere invertir $50,000 en un proyecto de viviendas.

```
┌────────────────────────────────────────────────────┐
│  Paso 1: María ve el proyecto en la plataforma    │
│  • Descripción del proyecto                        │
│  • Monto objetivo: $500,000                        │
│  • Estado: "En Espera" (buscando inversores)       │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 2: María hace clic en "Invertir"            │
│  • Ingresa monto: $50,000                          │
│  • Sistema verifica que el monto sea válido        │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 3: Sistema solicita código 2FA (si activado)│
│  • María ingresa código de su app (Google Auth)   │
│  • Sistema valida el código                        │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 4: Redirección a Mercado Pago               │
│  • María completa el pago                          │
│  • Mercado Pago notifica al sistema (webhook)      │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 5: Sistema confirma la inversión            │
│  • Proyecto cambia a "Finalizado" si se completó   │
│  • María recibe contrato digital por email         │
│  • Se registra todo en la base de datos            │
└────────────────────────────────────────────────────┘
```

**Resultado:** María es oficialmente inversora del proyecto.

---

### 2️⃣ Suscripción Mensual (Pagos Recurrentes)

**Ejemplo:** Juan quiere invertir pagando $5,000 por mes durante 12 meses.

```
┌────────────────────────────────────────────────────┐
│  Paso 1: Juan se suscribe al proyecto             │
│  • Elige plan de 12 meses                          │
│  • Cuota mensual: $5,000                           │
│  • Total a invertir: $60,000                       │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 2: Juan paga la primera cuota                │
│  • Sistema genera el pago del mes 1                │
│  • Juan completa el pago en Mercado Pago           │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 3: Sistema crea la suscripción              │
│  • Se registra: 11 meses restantes                 │
│  • Se crea un "Resumen de Cuenta" para Juan        │
│  • Juan recibe contrato digital                    │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Cada mes (automático):                            │
│  • Día 1: Sistema genera la cuota del mes          │
│  • Día 1-10: Juan tiene plazo para pagar           │
│  • Si no paga: se marca como "moroso"              │
│  • Si paga tarde: se acumulan intereses            │
└────────────────────────────────────────────────────┘
```

**Ventaja:** Juan puede cancelar su suscripción en cualquier momento y solicitar reembolso de lo pagado (manejar esas solicitudes de manera manual).

---

### 3️⃣ Subasta de Lotes

**Ejemplo:** Ana quiere comprar un lote de un proyecto que empezo la subasta valorado en $10,000 la puja inicial.

```
┌────────────────────────────────────────────────────┐
│  Paso 1: Administrador inicia la subasta          │
│  • Precio base del lote: $10,000                   │
│  • Duración: 7 días                                │
│  • Todos los suscriptores reciben notificación     │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 2: Ana hace una puja                         │
│  • Ana ofrece: $12,000                             │
│  • Sistema consume su "token de puja"              │
│  • Ana NO puede pujar en otro lote del proyecto    │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 3: Otros usuarios también pujan             │
│  • Carlos ofrece: $11,500                          │
│  • Laura ofrece: $13,000 ← PUJA MÁS ALTA           │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 4: Administrador cierra la subasta          │
│  • Laura gana automáticamente                      │
│  • Laura tiene 90 días para pagar                  │
│  • Ana y Carlos recuperan sus tokens               │
└────────────────────────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Paso 5: Laura paga                                │
│  • Laura paga $13,000                              │
│  • Excedente: $3,000 ($13,000 - $10,000)           │
│  • Sistema usa el excedente para:                  │
│    1. Pagar cuotas pendientes                      │
│    2. Pre-pagar meses futuros                      │
│    3. Guardar como "saldo a favor"                 │
└────────────────────────────────────────────────────┘
```

**¿Qué pasa si Laura no paga?**

- Después de 90 días, el lote se reasigna a Carlos (segundo mejor postor)
- Si Carlos tampoco paga, se ofrece a Ana (tercer mejor postor)
- Si nadie paga después de 3 intentos, el lote vuelve a subasta

---
## 🤝 Adhesión a Proyectos (Nuevo flujo desde 2025)

### ¿Qué es la adhesión?

Es una forma **económica y sin compromiso de inversión total** de apoyar un proyecto. El usuario paga solo el **4% del valor móvil** (un indicador que sube y baja según el costo del cemento) en cuotas fijas.

**Ejemplo**: Si el valor móvil es $100.000, la adhesión cuesta $4.000. El usuario puede pagarlo de contado, en 3 cuotas de $1.334 o en 6 cuotas de $667.

### ¿Para qué sirve?

- **Reserva tu cupo** en el proyecto (aunque no hayas pagado la inversión completa).
- **Al completar el pago**, obtienes **1 token de puja** y pasas a ser suscriptor completo (puedes pujar en lotes, recibir resumen de cuenta, etc.).
- **No requiere verificación de identidad (KYC)** ni 2FA para crear la adhesión (sí para pagar o cancelar si activaste 2FA).

### Flujo para el usuario

1. **Entra al proyecto** y elige “Adherirme”.
2. **Selecciona el plan** de pago (contado, 3 o 6 cuotas).
3. **El sistema**:
   - Reserva un cupo en el proyecto.
   - Le muestra las cuotas con fechas de vencimiento (día 10 del mes siguiente, y subsiguientes).
4. **Para pagar una cuota**:
   - Si tiene 2FA activado, se le pedirá el código de Google Authenticator.
   - Si no, irá directamente a Mercado Pago.
5. **Cuando paga la última cuota**, recibe un email de confirmación y ¡ya puede participar en subastas como cualquier suscriptor!

### ¿Puedo cancelar la adhesión antes de completarla?

**Sí**, pero con condiciones:

- **Debes tener 2FA activado** (si no, no podrás cancelar; es una medida de seguridad).
- Solo se cancelan las cuotas **pendientes**. Las ya pagadas **no se reembolsan** (porque ya reservaron tu cupo y el proyecto ha gastado recursos).
- Al cancelar, se libera tu cupo y la suscripción se desactiva. Ya no podrás pujar ni recibir beneficios.

### ¿Qué pasa si no pago una cuota?

- El sistema la marca como **vencida** después del día 10.
- Puedes pagarla después (con el mismo flujo), pero si acumulas muchas cuotas vencidas, el administrador puede cancelar tu adhesión.
- **No se generan intereses** (a diferencia de las suscripciones normales).

### ¿Los administradores pueden forzar el pago de una cuota?

Sí, desde el panel de administración pueden marcar una cuota como **pagada forzadamente** (por ejemplo, si el usuario pagó por transferencia bancaria y necesita acreditarlo manualmente). Queda registro en la bitácora de auditoría.

---
## 🔐 Sistema de Seguridad

### 1. Autenticación de Dos Factores (2FA)

**¿Qué es?** Un código de 6 dígitos que cambia cada 30 segundos.

**¿Cuándo se usa?**
(Solo funciona y se aplica si el usuario activo la seguridad 2FA)

- ✅ Al iniciar sesión (opcional)
- ✅ Antes de realizar un pago grande
- ✅ Al modificar datos sensibles

**¿Por qué es importante?**  
Aunque alguien robe tu contraseña, NO puede acceder sin el código temporal de tu celular.

```
┌─────────────────────────────────────────┐
│  Usuario intenta hacer un pago          │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ ¿Tiene 2FA     │
         │ activado?      │
         └───┬────────┬───┘
             │        │
         NO  │        │  SÍ
             │        │
             ▼        ▼
      ┌──────────┐  ┌──────────────────────┐
      │ Procesar │  │ Solicitar código 2FA │
      │ pago     │  │ (Google Authenticator)│
      └──────────┘  └──────────┬───────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │ ¿Código      │
                        │ válido?      │
                        └──┬───────┬───┘
                           │       │
                       SÍ  │       │  NO
                           │       │
                           ▼       ▼
                    ┌──────────┐ ┌──────────┐
                    │ Procesar │ │ Rechazar │
                    │ pago     │ │ operación│
                    └──────────┘ └──────────┘
```

### 2. Contratos Digitales con Firma Criptográfica

**¿Qué es un "hash"?** Una huella digital única de un archivo.

**¿Cómo funciona?**

1. **Al subir el contrato:**
   - Sistema calcula el "hash" del archivo
   - Ejemplo: `a3f5b8c9d2e1...` (código único de 64 caracteres)
   - Se guarda en la base de datos

2. **Al verificar el contrato:**
   - Sistema recalcula el hash del archivo actual
   - Si coincide con el guardado: ✅ **Archivo original**
   - Si NO coincide: ⚠️ **Archivo modificado** (alerta de integridad)

**Beneficio:** Nadie puede modificar un contrato sin que el sistema lo detecte.

### 3. Control de Tráfico (Rate Limiting)

**¿Qué es?** Un sistema que limita cuántas veces por minuto alguien puede enviar solicitudes al servidor, como un portero que controla el acceso.

**¿Por qué existe?**  
Sin este control, una persona malintencionada podría enviar miles de solicitudes por segundo y colapsar el servidor, dejando a todos los usuarios sin acceso. También previene ataques de fuerza bruta (intentar adivinar contraseñas probando miles de combinaciones).

**¿Cómo funciona en Nectárea?**

El sistema tiene **tres capas de protección**, cada una con su propio límite:

```
┌─────────────────────────────────────────────────────────┐
│  CAPA 1 — Control Global por Dirección IP               │
│                                                         │
│  • Aplica a TODOS los visitantes sin excepción          │
│  • Límite: 100 solicitudes por minuto por IP            │
│  • Un usuario normal genera entre 15 y 40 por minuto    │
│  • Bloquea IPs sospechosas antes de llegar a cualquier  │
│    funcionalidad de la plataforma                       │
└─────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 2 — Control por Cuenta de Usuario                 │
│                                                         │
│  • Aplica solo a usuarios que iniciaron sesión          │
│  • Límite: 300 solicitudes por minuto por cuenta        │
│  • Se activa principalmente en operaciones de pago      │
│    (iniciar inversión, pagar cuota, pujar en subasta)   │
│  • Administradores: sin límite por cuenta               │
└─────────────────────────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│  CAPA 3 — Control de Intentos de Acceso                 │
│                                                         │
│  • Login y registro: 5 intentos cada 5 minutos por IP  │
│  • Código 2FA y reset de contraseña: 3 intentos por    │
│    minuto por IP                                        │
│  • Previene que alguien intente adivinar contraseñas    │
│    o códigos de seguridad de forma automatizada         │
└─────────────────────────────────────────────────────────┘
```

**¿Qué pasa si alguien supera el límite?**  
El sistema responde con un error `429 - Demasiadas Peticiones` e informa cuántos segundos debe esperar antes de volver a intentarlo. Un usuario legítimo que usa la plataforma normalmente **nunca** alcanzará estos límites.

**¿Y las notificaciones de Mercado Pago?**  
Las notificaciones automáticas que envía Mercado Pago cuando un pago se completa (webhook) están **excluidas** de este control. Esto garantiza que ninguna confirmación de pago sea bloqueada por error, sin importar el volumen de notificaciones que lleguen.

**Resumen de límites:**

| Situación                       | Límite              | ¿Afecta al usuario normal?  |
| ------------------------------- | ------------------- | --------------------------- |
| Navegación general (sin sesión) | 100 req/min por IP  | No (usa ~15–40)             |
| Uso de la plataforma con sesión | 300 req/min         | No (usa ~15–40)             |
| Intentos de login o registro    | 5 cada 5 min por IP | No (no hay motivo para más) |
| Código 2FA o reset contraseña   | 3 por min por IP    | No (son flujos de un paso)  |
| Notificaciones de Mercado Pago  | Sin límite          | No aplica (es automático)   |

### Cancelación de adhesión con 2FA obligatorio

Para proteger al usuario, **cancelar una adhesión requiere tener 2FA activado**. El flujo es:
1. El usuario solicita cancelar → el sistema responde `requires2FA: true`.
2. El usuario ingresa el código de su app (Google Authenticator).
3. Si el código es correcto, se cancela la adhesión y se notifica por email.

Esta medida evita que alguien con la contraseña robada cancele una adhesión ajena.
---


## 💳 Gestión de Pagos

### Integración con Mercado Pago

**¿Por qué Mercado Pago?**

- ✅ Pasarela de pago segura y confiable
- ✅ Acepta tarjetas de crédito/débito
- ✅ Protege datos sensibles (nunca vemos números de tarjeta)
- ✅ Notifica automáticamente cuando un pago se completa

### Flujo de Pago Seguro

```
┌──────────────────────────────────────────────────┐
│  Usuario hace clic en "Pagar"                    │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  Sistema crea una "transacción pendiente"       │
│  • Se guarda en la base de datos                 │
│  • Estado: "pendiente"                           │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  Sistema genera URL de Mercado Pago             │
│  • URL única y temporal                          │
│  • Incluye datos del pago                        │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  Usuario es redirigido a Mercado Pago           │
│  • Sale de nuestra plataforma                    │
│  • Ingresa datos de tarjeta en MP                │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  Mercado Pago procesa el pago                    │
│  • Valida la tarjeta                             │
│  • Cobra el monto                                │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  MP envía notificación a nuestro sistema         │
│  • "Webhook": llamada HTTP automática            │
│  • Incluye resultado del pago                    │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│  Sistema actualiza la transacción               │
│  • Estado: "pagado" ✅                           │
│  • Se confirma la inversión                      │
│  • Se envía email al usuario                     │
└──────────────────────────────────────────────────┘
```

### Estados de una Transacción

| Estado             | Significado                       | Qué sigue                    |
| ------------------ | --------------------------------- | ---------------------------- |
| **Pendiente** 🟡   | Esperando que el usuario pague    | Usuario tiene 24h para pagar |
| **Pagado** ✅      | Pago exitoso                      | Se confirma la inversión     |
| **Fallido** ❌     | Pago rechazado (tarjeta inválida) | Usuario puede reintentar     |
| **Reembolsado** 🔵 | Dinero devuelto al usuario        | Operación cancelada          |

---

## 📊 Reportes y Métricas

### Panel de Control del Administrador

El sistema genera automáticamente:

#### 1. **Resumen Financiero**

```
1. Estado de Proyectos

Proyectos "En Espera" (buscando inversores)
Proyectos "En Proceso" (ya fondeados, en construcción)
Proyectos "Finalizados"

2. Morosidad

Usuarios con pagos vencidos
Monto total en morosidad
Cuotas pendientes por cobrar

3. Subastas

Lotes activos
Pujas ganadas pero no pagadas
Histórico de subastas cerradas


❓ Preguntas Frecuentes
¿Qué pasa si un usuario no paga una cuota mensual?
Respuesta:
El sistema marca al usuario como "moroso" pero NO cancela su suscripción automáticamente. El usuario puede:

Pagar la cuota atrasada (con posibles intereses)
Cancelar la suscripción y solicitar reembolso proporcional
Usar su "saldo a favor" (si ganó una subasta) para cubrir cuotas


¿Cómo se aplica el excedente de una puja?
Ejemplo práctico:

Laura gana lote con puja de $15,000
Precio base del lote: $10,000
Excedente: $5,000

El sistema usa el excedente en este orden:

Paga cuotas vencidas
Si Laura debe 2 meses ($2,000 c/u): se pagan automáticamente
Excedente restante: $1,000
Pre-paga meses futuros
Si la cuota es $500/mes: pre-paga 2 meses
Excedente restante: $0
Guarda como "saldo a favor"
Si aún queda dinero, se guarda para cuotas futuras
Próxima cuota: $500 - $500 saldo = $0 a pagar
En caso de no haber mas meses a pagar y aun asi el usuario tiene un saldo a favor
el sistema usa ese valor excedente que no se usa en nada para aumentar el valor
inicial del lote ya que la demanda del lote fue inesperada por ende el precio sube


¿Puedo revertir un pago?
Depende del estado:
Estado¿Se puede revertir?¿Cómo?Pendiente✅ SíCancelar la transacción manualmentePagado⚠️ Sí, pero...Solo el Admin puede marcar como "reembolsado"Reembolsado❌ NoLa operación ya fue revertidaFallido❌ NoNo hubo cobro, no hay nada que revertir
Para los casos de reembolso los usuarios deben hablar con administracion para analizar el caso

¿Qué es el "token de puja"?
Explicación simple:
Es un "permiso" para participar en UNA subasta dentro de un proyecto.
Reglas:

Cada usuario suscrito tiene 1 token por proyecto
Al pujar en un lote, el token se "consume"
Si pierde la subasta: recupera su token
Si gana la subasta: el token se usa permanentemente

¿Por qué existe?
Para evitar que un usuario puje en todos los lotes de un proyecto y monopolice las subastas.

¿Cómo funciona el sistema de mensajería?
Tipos de mensajes:

Automáticos del Sistema (remitente: "Sistema")

"¡Has ganado la subasta del Lote #5!"
"Tu proyecto ha sido fondeado"
"Tienes una cuota vencida"


Entre Usuarios (si se implementa en el futuro)

Actualmente NO está habilitado
Solo mensajes del sistema → usuario




¿Qué pasa si Mercado Pago tiene problemas?
Escenario: Mercado Pago está caído o no responde.
El sistema:

✅ NO pierde datos (la transacción queda en "pendiente")
✅ El usuario puede reintentar el pago más tarde
✅ Si el webhook llega tarde, el sistema se actualiza automáticamente

Recomendación: Esperar 24 horas antes de cancelar manualmente una transacción.


🎯 Conclusión
La plataforma Nectárea es un sistema robusto que:
✅ Automatiza el proceso de inversión en proyectos
✅ Protege a usuarios y administradores con seguridad 2FA
✅ Garantiza la integridad de contratos con tecnología criptográfica
✅ Facilita pagos seguros mediante Mercado Pago
✅ Notifica a usuarios de eventos importantes
✅ Escala para manejar múltiples proyectos simultáneamente
```

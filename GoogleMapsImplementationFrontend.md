🗺️ Documentación de Integración Google Maps

1. 📦 Objetivo
   El objetivo de este documento es detallar el uso de los nuevos campos de ubicación (latitud y longitud) provenientes del backend para visualizar la posición geográfica de un Proyecto o Lote mediante un mapa interactivo de Google Maps en el front-end.

2. 🔑 Requisitos Previos
   Antes de proceder con la implementación, asegúrense de cumplir con los siguientes puntos:

API Key de Google Maps: Debe obtenerse una clave de API válida desde la [Google Cloud Console] y debe estar habilitado el servicio Maps JavaScript API.

Modelo de Datos: Asegurarse de que el endpoint que consume el front-end retorne los campos latitud y longitud para el objeto Proyecto o Lote.

Formato esperado: Valores numéricos, por ejemplo:
{
"id": 1,
"nombre_proyecto": "Urbanización El Sol",
"latitud": -32.937812,
"longitud": -68.847175
}
¡Excelente! Ya con la latitud y longitud en la base de datos, el siguiente paso es la integración en el front-end.

Aquí tienes una documentación clara y concisa sobre cómo utilizar las coordenadas para visualizar los proyectos y lotes en Google Maps, específicamente pensada para tu equipo de desarrollo front-end.

🗺️ Documentación de Integración Google Maps

1. 📦 Objetivo
   El objetivo de este documento es detallar el uso de los nuevos campos de ubicación (latitud y longitud) provenientes del backend para visualizar la posición geográfica de un Proyecto o Lote mediante un mapa interactivo de Google Maps en el front-end.

2. 🔑 Requisitos Previos
   Antes de proceder con la implementación, asegúrense de cumplir con los siguientes puntos:

API Key de Google Maps: Debe obtenerse una clave de API válida desde la [Google Cloud Console] y debe estar habilitado el servicio Maps JavaScript API.

Modelo de Datos: Asegurarse de que el endpoint que consume el front-end retorne los campos latitud y longitud para el objeto Proyecto o Lote.

Formato esperado: Valores numéricos, por ejemplo:

JSON

{
"id": 1,
"nombre_proyecto": "Urbanización El Sol",
"latitud": -32.937812,
"longitud": -68.847175
}

3. 🖥️ Instalación y Carga del Script (React, Vue, Angular)
   La forma más estándar y recomendada de integrar Google Maps es a través de la librería oficial o un wrapper para el framework que estén utilizando (ejemplo: @react-google-maps/api para React).

A. Carga Directa (Vainilla JS / HTML)
Si el proyecto lo permite, pueden cargar el script de Google Maps API en el <head> del HTML:

<script
  src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY_AQUI&callback=initMap"
  async
></script>

¡Excelente! Ya con la latitud y longitud en la base de datos, el siguiente paso es la integración en el front-end.

Aquí tienes una documentación clara y concisa sobre cómo utilizar las coordenadas para visualizar los proyectos y lotes en Google Maps, específicamente pensada para tu equipo de desarrollo front-end.

🗺️ Documentación de Integración Google Maps

1. 📦 Objetivo
   El objetivo de este documento es detallar el uso de los nuevos campos de ubicación (latitud y longitud) provenientes del backend para visualizar la posición geográfica de un Proyecto o Lote mediante un mapa interactivo de Google Maps en el front-end.

2. 🔑 Requisitos Previos
   Antes de proceder con la implementación, asegúrense de cumplir con los siguientes puntos:

API Key de Google Maps: Debe obtenerse una clave de API válida desde la [Google Cloud Console] y debe estar habilitado el servicio Maps JavaScript API.

Modelo de Datos: Asegurarse de que el endpoint que consume el front-end retorne los campos latitud y longitud para el objeto Proyecto o Lote.

Formato esperado: Valores numéricos, por ejemplo:

JSON

{
"id": 1,
"nombre_proyecto": "Urbanización El Sol",
"latitud": -32.937812,
"longitud": -68.847175
} 3. 🖥️ Instalación y Carga del Script (React, Vue, Angular)
La forma más estándar y recomendada de integrar Google Maps es a través de la librería oficial o un wrapper para el framework que estén utilizando (ejemplo: @react-google-maps/api para React).

A. Carga Directa (Vainilla JS / HTML)
Si el proyecto lo permite, pueden cargar el script de Google Maps API en el <head> del HTML:

HTML

<script
  src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY_AQUI&callback=initMap"
  async
></script>

B. Uso de Librerías (Recomendado para SPA)
Instalar la librería wrapper correspondiente y utilizar sus componentes/hooks para manejar la carga del mapa.

4. 🧩 Implementación del Mapa (Mostrar un Marcador)
   El proceso principal consta de tres pasos clave:

Paso 1: Obtener las Coordenadas
Desde el estado del componente, recuperar los valores de latitud y longitud del objeto Proyecto (o Lote):
// Ejemplo de datos recuperados del backend
const proyecto = {
latitud: -32.937812,
longitud: -68.847175,
// ... otros datos
};

// Crear el objeto de coordenadas
const posicion = {
lat: parseFloat(proyecto.latitud), // Convertir a número flotante
lng: parseFloat(proyecto.longitud) // Convertir a número flotante
};

⚠️ Importante: Asegúrense de convertir los valores (que a menudo vienen como strings desde el JSON) a un tipo numérico (parseFloat()) para que la API de Google Maps los acepte correctamente.

Paso 2: Inicializar y Centrar el Mapa
Utilizar la posición obtenida para inicializar y centrar el mapa:
// Suponiendo que tienen un elemento div con id="mapa"
const mapa = new google.maps.Map(
document.getElementById("mapa"),
{
zoom: 15, // Nivel de zoom apropiado (15 es buen nivel para un terreno)
center: posicion, // Se centra el mapa en las coordenadas del proyecto
}
);

Paso 3: Colocar el Marcador (Pin)
Una vez que el mapa está cargado, se añade un marcador en la misma posición para indicar el lugar exacto:

const marcador = new google.maps.Marker({
position: posicion, // Usa la posición del proyecto
map: mapa, // Asocia el marcador al mapa creado
title: proyecto.nombre_proyecto,
});
¡Excelente! Ya con la latitud y longitud en la base de datos, el siguiente paso es la integración en el front-end.

Aquí tienes una documentación clara y concisa sobre cómo utilizar las coordenadas para visualizar los proyectos y lotes en Google Maps, específicamente pensada para tu equipo de desarrollo front-end.

🗺️ Documentación de Integración Google Maps

1. 📦 Objetivo
   El objetivo de este documento es detallar el uso de los nuevos campos de ubicación (latitud y longitud) provenientes del backend para visualizar la posición geográfica de un Proyecto o Lote mediante un mapa interactivo de Google Maps en el front-end.

2. 🔑 Requisitos Previos
   Antes de proceder con la implementación, asegúrense de cumplir con los siguientes puntos:

API Key de Google Maps: Debe obtenerse una clave de API válida desde la [Google Cloud Console] y debe estar habilitado el servicio Maps JavaScript API.

Modelo de Datos: Asegurarse de que el endpoint que consume el front-end retorne los campos latitud y longitud para el objeto Proyecto o Lote.

Formato esperado: Valores numéricos, por ejemplo:

JSON

{
"id": 1,
"nombre_proyecto": "Urbanización El Sol",
"latitud": -32.937812,
"longitud": -68.847175
} 3. 🖥️ Instalación y Carga del Script (React, Vue, Angular)
La forma más estándar y recomendada de integrar Google Maps es a través de la librería oficial o un wrapper para el framework que estén utilizando (ejemplo: @react-google-maps/api para React).

A. Carga Directa (Vainilla JS / HTML)
Si el proyecto lo permite, pueden cargar el script de Google Maps API en el <head> del HTML:

HTML

<script
  src="https://maps.googleapis.com/maps/api/js?key=TU_API_KEY_AQUI&callback=initMap"
  async
></script>

B. Uso de Librerías (Recomendado para SPA)
Instalar la librería wrapper correspondiente y utilizar sus componentes/hooks para manejar la carga del mapa.

4. 🧩 Implementación del Mapa (Mostrar un Marcador)
   El proceso principal consta de tres pasos clave:

Paso 1: Obtener las Coordenadas
Desde el estado del componente, recuperar los valores de latitud y longitud del objeto Proyecto (o Lote):

JavaScript

// Ejemplo de datos recuperados del backend
const proyecto = {
latitud: -32.937812,
longitud: -68.847175,
// ... otros datos
};

// Crear el objeto de coordenadas
const posicion = {
lat: parseFloat(proyecto.latitud), // Convertir a número flotante
lng: parseFloat(proyecto.longitud) // Convertir a número flotante
};
⚠️ Importante: Asegúrense de convertir los valores (que a menudo vienen como strings desde el JSON) a un tipo numérico (parseFloat()) para que la API de Google Maps los acepte correctamente.

Paso 2: Inicializar y Centrar el Mapa
Utilizar la posición obtenida para inicializar y centrar el mapa:

JavaScript

// Suponiendo que tienen un elemento div con id="mapa"
const mapa = new google.maps.Map(
document.getElementById("mapa"),
{
zoom: 15, // Nivel de zoom apropiado (15 es buen nivel para un terreno)
center: posicion, // Se centra el mapa en las coordenadas del proyecto
}
);
Paso 3: Colocar el Marcador (Pin)
Una vez que el mapa está cargado, se añade un marcador en la misma posición para indicar el lugar exacto:

JavaScript

const marcador = new google.maps.Marker({
position: posicion, // Usa la posición del proyecto
map: mapa, // Asocia el marcador al mapa creado
title: proyecto.nombre_proyecto,
});

5. 🛠️ Casos Especiales y Consideraciones
   | Situación | Comportamiento en el Front-end | Razón |
   | :--- | :--- | :--- |
   | **`latitud` o `longitud` es `null`** | **Ocultar** el componente del mapa o mostrar un mensaje de "Ubicación no disponible". | Si no hay coordenadas válidas, la API fallará al intentar centrar el mapa. |
   | **Proyecto en construcción** | Mostrar el mapa sin problemas, centrado en las coordenadas. | Google Maps usa coordenadas, no direcciones postales registradas. El mapa mostrará la imagen satelital del **terreno vacío o en obras**. |
   | **Visualización de `Lote`** | Para un `Lote`, se deben usar las coordenadas del **`Proyecto` padre**. | Los lotes individuales probablemente no tienen coordenadas únicas. Si lo tuvieran, se usarían esas, de lo contrario, se usa la coordenada central del proyecto. |

✅ Resumen para el Developer
| Tarea | Dato a Usar | Acción Clave |
| :--- | :--- | :--- |
| **Dato Requerido** | `latitud`, `longitud` | Convertir siempre a **`float`** antes de pasar a la API. |
| **Inicialización** | `center: { lat: X, lng: Y }` | Usa las coordenadas para centrar la vista. |
| **Pin / Marcador** | `position: { lat: X, lng: Y }` | Coloca el marcador en el punto exacto. |

# Nectárea API: Backend para Plataforma de Crowdfunding

Bienvenido al repositorio del backend de Nectárea, una plataforma de crowdfunding. Esta API RESTful está diseñada para gestionar las operaciones clave de la plataforma, incluyendo la creación de proyectos, la gestión de inversiones y pujas, y la administración de usuarios y contratos.

## Tecnologías Utilizadas

Este proyecto está construido con un stack moderno de Node.js, aprovechando las siguientes tecnologías:

- **Node.js**: Entorno de ejecución del lado del servidor.
- **Express.js**: Framework web para la creación de la API.
- **Sequelize**: ORM (Object-Relational Mapper) para la interacción con la base de datos.
- **PostgreSQL**: Base de datos relacional robusta.
- **bcryptjs**: Para el hash seguro de contraseñas de usuarios.
- **JSON Web Tokens (jsonwebtoken)**: Para la autenticación y autorización de usuarios.
- **Multer**: Middleware para el manejo de la carga de archivos, utilizado para los contratos.

## Estructura del Proyecto

El proyecto sigue una arquitectura modular y escalable:

- `config/`: Configuración de la base de datos y otros servicios.
- `models/`: Definición de los modelos de Sequelize y sus asociaciones.
- `services/`: Lógica de negocio y abstracción de la base de datos.
- `controllers/`: Manejo de las peticiones HTTP y respuestas.
- `routes/`: Definición de las rutas de la API.
- `middlewares/`: Middleware de autenticación y validación.
- `uploads/`: Directorio para los archivos subidos (contratos).
- `app.js`: Archivo principal de la aplicación.

## Instalación y Configuración

Sigue estos pasos para poner en marcha el proyecto en tu entorno local:

### 1. Clona el Repositorio

```bash
git clone [https://github.com/SebastianASU2005/Nectarea_BD.git](https://github.com/SebastianASU2005/Nectarea_BD.git)
cd Nectarea_BD
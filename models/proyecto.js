// Archivo: models/Proyecto.js
const { sequelize, DataTypes } = require("../config/database");
const baseAttributes = require("./base");

const Proyecto = sequelize.define(
  "Proyecto",
  {
    ...baseAttributes, // Incluye los campos 'id' y 'activo'
    nombre_proyecto: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
    }, // Usamos ENUM para los tipos de inversión
    tipo_inversion: {
      type: DataTypes.ENUM("directo", "mensual"),
      allowNull: false,
    },
    plazo_inversion: {
      type: DataTypes.INTEGER,
    },
    forma_juridica: {
      type: DataTypes.STRING(100),
    },
    monto_inversion: {
      type: DataTypes.DECIMAL(15, 2),
    },
    entrega_anticipada: {
      type: DataTypes.BOOLEAN,
    }, // **NUEVO CAMPO:** Contador para las suscripciones actuales
    suscripciones_actuales: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    obj_suscripciones: {
      type: DataTypes.INTEGER,
    }, // **NUEVO CAMPO:** Un booleano para evitar notificaciones duplicadas
    objetivo_notificado: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    // **NUEVO ESTADO:** Estados mejor definidos para el proyecto
    estado_proyecto: {
      type: DataTypes.ENUM("En Espera", "En proceso", "Finalizado"),
      allowNull: false,
      defaultValue: "En Espera", // El estado inicial
    },
    fecha_inicio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    fecha_cierre: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    pack_de_lotes: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "proyecto", // Nombre de la tabla en la base de datos
  }
);

module.exports = Proyecto;
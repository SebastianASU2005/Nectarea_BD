// Importa todos tus modelos
const Usuario = require('./usuario');
const Inversion = require('./inversion');
const Lote = require('./lote');
const Proyecto = require('./proyecto');
const Puja = require('./puja');
const Transaccion = require('./transaccion');
const Imagen = require('./imagen');
const Contrato = require('./contrato');
const SuscripcionProyecto = require('./suscripcion_proyecto');

// Envuelve la lógica de las relaciones en una función y expórtala
const configureAssociations = () => {
    // --- Relaciones de Usuario ---
    Usuario.hasMany(Inversion, {
        foreignKey: 'id_inversor',
        as: 'inversiones',
    });
    Usuario.hasMany(Proyecto, {
        foreignKey: 'id_creador_proyecto',
        as: 'proyectos_creados',
    });
    Usuario.hasMany(Lote, {
        foreignKey: 'id_ganador',
        as: 'lotes_ganados',
    });
    Usuario.hasMany(Puja, {
        foreignKey: 'id_usuario',
        as: 'pujas',
    });
    Usuario.hasMany(Transaccion, {
        foreignKey: 'id_usuario',
        as: 'transacciones',
    });
    Usuario.hasMany(Contrato, {
        foreignKey: 'id_usuario_firmante',
        as: 'contratos_firmados',
    });
    // Relación de un usuario con las suscripciones a proyectos
    Usuario.hasMany(SuscripcionProyecto, {
      foreignKey: 'id_usuario',
      as: 'suscripciones',
    });

    // --- Relaciones de Inversion ---
    Inversion.belongsTo(Usuario, {
        foreignKey: 'id_inversor',
        as: 'inversor',
    });
    Inversion.belongsTo(Proyecto, {
        foreignKey: 'id_proyecto',
        as: 'proyecto',
    });

    // --- Relaciones de Proyecto ---
    Proyecto.hasMany(Transaccion, {
        foreignKey: 'id_proyecto',
        as: 'transacciones',
    });
    Proyecto.hasMany(Imagen, {
        foreignKey: 'id_proyecto',
        as: 'imagenes',
    });
    Proyecto.hasMany(Lote, {
        foreignKey: 'id_proyecto',
        as: 'lotes',
    });
    Proyecto.hasOne(Contrato, {
      foreignKey: 'id_proyecto',
      as: 'contrato',
    });
    // Un proyecto puede tener muchas suscripciones de usuarios
    // Se corrige el 'as' para evitar colisión de nombres
    Proyecto.hasMany(SuscripcionProyecto, {
      foreignKey: 'id_proyecto',
      as: 'suscripciones_proyecto',
    });

    // --- Relaciones de Lote ---
    Lote.belongsTo(Usuario, {
        foreignKey: 'id_ganador',
        as: 'ganador',
    });
    Lote.hasMany(Puja, {
        foreignKey: 'id_lote',
        as: 'pujas',
    });
    Lote.belongsTo(Proyecto, {
        foreignKey: 'id_proyecto',
        as: 'proyecto',
    });
    Lote.hasMany(Imagen, {
        foreignKey: 'id_lote',
        as: 'imagenes',
    });

    // --- Relaciones de Puja ---
    Puja.belongsTo(Usuario, {
        foreignKey: 'id_usuario',
        as: 'usuario',
    });
    Puja.belongsTo(Lote, {
        foreignKey: 'id_lote',
        as: 'lote',
    });

    // --- Relaciones de Transaccion ---
    Transaccion.belongsTo(Usuario, {
        foreignKey: 'id_usuario',
        as: 'usuario',
    });
    Transaccion.belongsTo(Proyecto, {
        foreignKey: 'id_proyecto',
        as: 'proyecto',
    });

    // --- Relaciones de Imagen ---
    Imagen.belongsTo(Proyecto, {
        foreignKey: 'id_proyecto',
        as: 'proyecto',
    });
    Imagen.belongsTo(Lote, {
        foreignKey: 'id_lote',
        as: 'lote',
    });

    // --- Relaciones de Contrato ---
    Contrato.belongsTo(Proyecto, {
      foreignKey: 'id_proyecto',
      as: 'proyecto',
    });
    Contrato.belongsTo(Usuario, {
        foreignKey: 'id_usuario_firmante',
        as: 'usuario_firmante',
    });

    // --- Relaciones de SuscripcionProyecto ---
    SuscripcionProyecto.belongsTo(Usuario, {
      foreignKey: 'id_usuario',
      as: 'usuario',
    });
    SuscripcionProyecto.belongsTo(Proyecto, {
      foreignKey: 'id_proyecto',
      as: 'proyecto',
    });
};

module.exports = configureAssociations;
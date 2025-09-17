const Usuario = require('./usuario');
const Inversion = require('./inversion');
const Lote = require('./lote');
const Proyecto = require('./proyecto');
const Puja = require('./puja');
const Transaccion = require('./transaccion');
const Imagen = require('./imagen');
const Contrato = require('./contrato');
const SuscripcionProyecto = require('./suscripcion_proyecto');
const Pago = require('./pago');
const Mensaje = require('./mensaje'); // **NUEVO: Importa el modelo Mensaje**

const configureAssociations = () => {
    // --- Relaciones de Usuario ---
    Usuario.hasMany(Inversion, {
        foreignKey: 'id_inversor',
        as: 'inversiones',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(Proyecto, {
        foreignKey: 'id_creador_proyecto',
        as: 'proyectos_creados',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(Lote, {
        foreignKey: 'id_ganador',
        as: 'lotes_ganados',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(Puja, {
        foreignKey: 'id_usuario',
        as: 'pujas',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(Transaccion, {
        foreignKey: 'id_usuario',
        as: 'transacciones',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(Contrato, {
        foreignKey: 'id_usuario_firmante',
        as: 'contratos_firmados',
        onDelete: 'RESTRICT',
    });
    Usuario.hasMany(SuscripcionProyecto, {
      foreignKey: 'id_usuario',
      as: 'suscripciones',
      onDelete: 'RESTRICT',
    });
    // **NUEVO: Un usuario puede enviar y recibir muchos mensajes**
    Usuario.hasMany(Mensaje, { foreignKey: 'id_remitente', as: 'mensajesEnviados' });
    Usuario.hasMany(Mensaje, { foreignKey: 'id_receptor', as: 'mensajesRecibidos' });

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
        onDelete: 'RESTRICT',
    });
    Proyecto.hasMany(Imagen, {
        foreignKey: 'id_proyecto',
        as: 'imagenes',
        onDelete: 'RESTRICT',
    });
    Proyecto.hasMany(Lote, {
        foreignKey: 'id_proyecto',
        as: 'lotes',
        onDelete: 'RESTRICT',
    });
    Proyecto.hasOne(Contrato, {
      foreignKey: 'id_proyecto',
      as: 'contrato',
      onDelete: 'RESTRICT',
    });
    Proyecto.hasMany(SuscripcionProyecto, {
      foreignKey: 'id_proyecto',
      as: 'suscripciones_proyecto',
      onDelete: 'RESTRICT',
    });

    // --- Relaciones de Lote ---
    Lote.belongsTo(Usuario, {
        foreignKey: 'id_ganador',
        as: 'ganador',
    });
    Lote.hasMany(Puja, {
        foreignKey: 'id_lote',
        as: 'pujas',
        onDelete: 'RESTRICT',
    });
    Lote.belongsTo(Proyecto, {
        foreignKey: 'id_proyecto',
        as: 'proyecto',
    });
    Lote.hasMany(Imagen, {
        foreignKey: 'id_lote',
        as: 'imagenes',
        onDelete: 'RESTRICT',
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
    SuscripcionProyecto.hasMany(Pago, {
      foreignKey: 'id_suscripcion',
      as: 'pagos',
      onDelete: 'RESTRICT',
    });

    // --- Relaciones de Pago ---
    Pago.belongsTo(SuscripcionProyecto, {
      foreignKey: 'id_suscripcion',
      as: 'suscripcion',
    });

    // **NUEVO: Relaciones de Mensaje**
    Mensaje.belongsTo(Usuario, { foreignKey: 'id_remitente', as: 'remitente' });
    Mensaje.belongsTo(Usuario, { foreignKey: 'id_receptor', as: 'receptor' });
};

module.exports = configureAssociations;
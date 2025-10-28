// models/associations.js

// Importa todos los modelos
const Usuario = require("./usuario");
const Inversion = require("./inversion");
const Lote = require("./lote");
const Proyecto = require("./proyecto");
const Puja = require("./puja");
const Transaccion = require("./transaccion");
const Imagen = require("./imagen");
const Contrato = require("./contrato");
const SuscripcionProyecto = require("./suscripcion_proyecto");
const SuscripcionCancelada = require("./suscripcion_cancelada"); // 🆕 ¡MODELO AÑADIDO!
const Pago = require("./pago"); // Pagos de mensualidad
const PagoMercado = require("./pagoMercado"); // Pagos de pasarela (Mercado Pago)
const Mensaje = require("./mensaje");
const CuotaMensual = require("./CuotaMensual");
const ResumenCuenta = require("./resumen_cuenta");
const Favorito = require("./Favorito");

const configureAssociations = () => {
  // -------------------------------------------------------------------
  // --- Relaciones de Usuario ---
  // -------------------------------------------------------------------
  Usuario.hasMany(Inversion, {
    foreignKey: "id_inversor",
    as: "inversiones",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Proyecto, {
    foreignKey: "id_creador_proyecto",
    as: "proyectos_creados",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Lote, {
    foreignKey: "id_ganador",
    as: "lotes_ganados",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Puja, {
    foreignKey: "id_usuario",
    as: "pujas",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Transaccion, {
    foreignKey: "id_usuario",
    as: "transacciones",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Contrato, {
    foreignKey: "id_usuario_firmante",
    as: "contratos_firmados",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(SuscripcionProyecto, {
    foreignKey: "id_usuario",
    as: "suscripciones",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(SuscripcionCancelada, {
    // 🆕 Relación con el nuevo modelo
    foreignKey: "id_usuario",
    as: "suscripciones_canceladas",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Mensaje, {
    foreignKey: "id_remitente",
    as: "mensajesEnviados",
    onDelete: "RESTRICT",
  });
  Usuario.hasMany(Mensaje, {
    foreignKey: "id_receptor",
    as: "mensajesRecibidos",
    onDelete: "RESTRICT",
  }); // ------------------------------------------------------------------- // --- Relaciones de Inversion --- // -------------------------------------------------------------------

  Inversion.belongsTo(Usuario, { foreignKey: "id_inversor", as: "inversor" });
  Inversion.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoInvertido",
  });
  Inversion.hasOne(Transaccion, {
    foreignKey: "id_inversion",
    as: "transaccion",
  });
  Inversion.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  }); // ------------------------------------------------------------------- // --- Relaciones de Proyecto --- // -------------------------------------------------------------------

  Proyecto.belongsTo(Usuario, {
    foreignKey: "id_creador_proyecto",
    as: "creador",
  });
  Proyecto.hasMany(Transaccion, {
    foreignKey: "id_proyecto",
    as: "transacciones",
    onDelete: "RESTRICT",
  });
  Proyecto.hasMany(Imagen, {
    foreignKey: "id_proyecto",
    as: "imagenes",
    onDelete: "RESTRICT",
  });
  Proyecto.hasMany(Lote, {
    foreignKey: "id_proyecto",
    as: "lotes",
    onDelete: "RESTRICT",
  });
  Proyecto.hasOne(Contrato, {
    foreignKey: "id_proyecto",
    as: "contrato",
    onDelete: "RESTRICT",
  });
  Proyecto.hasMany(SuscripcionProyecto, {
    foreignKey: "id_proyecto",
    as: "suscripciones_proyecto",
    onDelete: "RESTRICT",
  });
  Proyecto.hasMany(SuscripcionCancelada, {
    // 🆕 Relación con el nuevo modelo
    foreignKey: "id_proyecto",
    as: "cancelaciones",
    onDelete: "RESTRICT",
  });
  Proyecto.hasMany(Puja, { foreignKey: "id_proyecto", as: "pujas" });
  Proyecto.hasMany(CuotaMensual, {
    foreignKey: "id_proyecto",
    as: "cuotas_mensuales",
  }); // ------------------------------------------------------------------- // --- Relaciones de Lote --- // -------------------------------------------------------------------

  Lote.belongsTo(Usuario, { foreignKey: "id_ganador", as: "ganador" });
  Lote.hasMany(Puja, {
    foreignKey: "id_lote",
    as: "pujas",
    onDelete: "RESTRICT",
  });
  Lote.belongsTo(Proyecto, { foreignKey: "id_proyecto", as: "proyectoLote" });
  Lote.hasMany(Imagen, {
    foreignKey: "id_lote",
    as: "imagenes",
    onDelete: "RESTRICT",
  }); // ------------------------------------------------------------------- // --- Relaciones de Puja --- // -------------------------------------------------------------------

  Puja.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });
  Puja.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" });
  Puja.hasOne(Transaccion, {
    foreignKey: "id_puja",
    as: "transaccion",
    onDelete: "RESTRICT",
  });
  Puja.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  }); // ------------------------------------------------------------------- // --- Relaciones de Transaccion --- // -------------------------------------------------------------------

  Transaccion.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });
  Transaccion.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoTransaccion",
  });
  Transaccion.belongsTo(Puja, { foreignKey: "id_puja", as: "puja" });
  Transaccion.belongsTo(Pago, {
    foreignKey: "id_pago_mensual",
    as: "pagoMensual",
  });
  Transaccion.belongsTo(PagoMercado, {
    foreignKey: "id_pago_pasarela",
    as: "pagoPasarela",
  });
  Transaccion.belongsTo(Inversion, {
    foreignKey: "id_inversion",
    as: "inversion",
  }); // ------------------------------------------------------------------- // --- Relaciones de Imagen --- // -------------------------------------------------------------------

  Imagen.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoImagen",
  });
  Imagen.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" }); // ------------------------------------------------------------------- // --- Relaciones de Contrato --- // -------------------------------------------------------------------

  Contrato.belongsTo(Proyecto, { foreignKey: "id_proyecto", as: "proyecto" });
  Contrato.belongsTo(Usuario, {
    foreignKey: "id_usuario_firmante",
    as: "usuario_firmante",
  }); // ------------------------------------------------------------------- // --- Relaciones de SuscripcionProyecto --- // -------------------------------------------------------------------

  SuscripcionProyecto.belongsTo(Usuario, {
    foreignKey: "id_usuario",
    as: "usuario",
  });
  SuscripcionProyecto.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoAsociado",
  });
  SuscripcionProyecto.hasMany(Pago, {
    foreignKey: "id_suscripcion",
    as: "pagos",
    onDelete: "RESTRICT",
  });
  SuscripcionProyecto.hasMany(Puja, {
    foreignKey: "id_suscripcion",
    as: "pujas",
  });
  SuscripcionProyecto.hasMany(Inversion, {
    foreignKey: "id_suscripcion",
    as: "inversiones",
  });
  SuscripcionProyecto.hasOne(ResumenCuenta, {
    foreignKey: "id_suscripcion",
    as: "resumen_cuenta",
  });
  SuscripcionProyecto.hasOne(SuscripcionCancelada, {
    // 🆕 Relación con el nuevo modelo
    foreignKey: "id_suscripcion_original",
    as: "registroCancelacion",
  }); // ------------------------------------------------------------------- // --- Relaciones de SuscripcionCancelada (NUEVAS) --- // -------------------------------------------------------------------

  SuscripcionCancelada.belongsTo(Usuario, {
    foreignKey: "id_usuario",
    as: "usuarioCancelador",
  });
  SuscripcionCancelada.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoCancelado",
  });
  SuscripcionCancelada.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion_original",
    as: "suscripcionOriginal",
  }); // ------------------------------------------------------------------- // --- Relaciones de Pago (Mensualidad) --- // -------------------------------------------------------------------

  Pago.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuarioDirecto" });
  Pago.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoDirecto",
  });
  Pago.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });
  Pago.hasOne(Transaccion, {
    foreignKey: "id_pago_mensual",
    as: "transaccionMensual",
  }); // ------------------------------------------------------------------- // --- Relaciones de PagoMercado (Pasarela) --- // -------------------------------------------------------------------

  PagoMercado.belongsTo(Transaccion, {
    foreignKey: "id_transaccion",
    as: "transaccionAsociada",
  });
  PagoMercado.hasOne(Transaccion, {
    foreignKey: "id_pago_pasarela",
    as: "transaccionDePasarela",
  }); // ------------------------------------------------------------------- // --- Relaciones de Mensaje --- // -------------------------------------------------------------------

  Mensaje.belongsTo(Usuario, { foreignKey: "id_remitente", as: "remitente" });
  Mensaje.belongsTo(Usuario, { foreignKey: "id_receptor", as: "receptor" }); // ------------------------------------------------------------------- // --- Relaciones de CuotaMensual --- // -------------------------------------------------------------------

  CuotaMensual.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoCuota",
  }); // ------------------------------------------------------------------- // --- Relaciones de ResumenCuenta --- // -------------------------------------------------------------------

  ResumenCuenta.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });
  // Relaciones de Favorito
  Favorito.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });
  Favorito.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" });

  Usuario.hasMany(Favorito, { foreignKey: "id_usuario", as: "favoritos" });
  Lote.hasMany(Favorito, { foreignKey: "id_lote", as: "favoritos" });
};

module.exports = configureAssociations;

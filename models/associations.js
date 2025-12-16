// models/associations.js

// Importa todos los modelos de la aplicación para configurar sus relaciones.
const Usuario = require("./usuario");
const Inversion = require("./inversion");
const Lote = require("./lote");
const Proyecto = require("./proyecto");
const Puja = require("./puja");
const Transaccion = require("./transaccion");
const Imagen = require("./imagen");
const Contrato = require("./contrato"); // Se mantiene para compatibilidad con modelos antiguos si es necesario.
const SuscripcionProyecto = require("./suscripcion_proyecto");
const SuscripcionCancelada = require("./suscripcion_cancelada");
const Pago = require("./Pago"); // Representa pagos de mensualidad o internos.
const PagoMercado = require("./pagoMercado"); // Representa pagos procesados por la pasarela (Mercado Pago).
const Mensaje = require("./mensaje");
const CuotaMensual = require("./CuotaMensual");
const ResumenCuenta = require("./resumen_cuenta");
const Favorito = require("./Favorito");
const ContratoPlantilla = require("./ContratoPlantilla");
const ContratoFirmado = require("./ContratoFirmado "); // Modelo clave para los contratos firmados digitalmente.
const VerificacionIdentidad = require("./verificacion_identidad");

const configureAssociations = () => {
  // -------------------------------------------------------------------
  // --- Relaciones de Usuario (Un Usuario puede tener muchos...) ---
  // -------------------------------------------------------------------

  // Un Usuario puede tener múltiples Inversiones (como inversor).
  Usuario.hasMany(Inversion, {
    foreignKey: "id_inversor",
    as: "inversiones",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede haber creado múltiples Proyectos.
  Usuario.hasMany(Proyecto, {
    foreignKey: "id_creador_proyecto",
    as: "proyectos_creados",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede haber ganado múltiples Lotes en subastas.
  Usuario.hasMany(Lote, {
    foreignKey: "id_ganador",
    as: "lotes_ganados",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede haber realizado múltiples Pujas.
  Usuario.hasMany(Puja, {
    foreignKey: "id_usuario",
    as: "pujas",
    onDelete: "RESTRICT",
  });

  // Un Usuario tiene múltiples Transacciones asociadas a su cuenta.
  Usuario.hasMany(Transaccion, {
    foreignKey: "id_usuario",
    as: "transacciones",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede tener múltiples Suscripciones a Proyectos.
  Usuario.hasMany(SuscripcionProyecto, {
    foreignKey: "id_usuario",
    as: "suscripciones",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede tener múltiples Suscripciones Canceladas registradas.
  Usuario.hasMany(SuscripcionCancelada, {
    foreignKey: "id_usuario",
    as: "suscripciones_canceladas",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede ser Remitente de múltiples Mensajes.
  Usuario.hasMany(Mensaje, {
    foreignKey: "id_remitente",
    as: "mensajesEnviados",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede ser Receptor de múltiples Mensajes.
  Usuario.hasMany(Mensaje, {
    foreignKey: "id_receptor",
    as: "mensajesRecibidos",
    onDelete: "RESTRICT",
  });

  // Un Usuario tiene múltiples ContratosFirmados (asociación clave).
  Usuario.hasMany(ContratoFirmado, {
    foreignKey: "id_usuario_firmante",
    as: "contratos_firmados",
    onDelete: "RESTRICT",
  });

  // 🆕 Un Usuario tiene un registro de VerificacionIdentidad (uno a uno).
  Usuario.hasOne(VerificacionIdentidad, {
    foreignKey: "id_usuario",
    as: "verificacion_identidad",
    onDelete: "RESTRICT",
  });

  // 🆕 Un Usuario (admin) puede haber verificado múltiples solicitudes KYC.
  Usuario.hasMany(VerificacionIdentidad, {
    foreignKey: "id_verificador",
    as: "verificaciones_realizadas",
    onDelete: "RESTRICT",
  });

  // Un Usuario puede marcar múltiples Lotes como Favoritos.
  Usuario.hasMany(Favorito, { foreignKey: "id_usuario", as: "favoritos" });

  // -------------------------------------------------------------------
  // --- Relaciones de Inversion (Una Inversión pertenece a...) ---
  // -------------------------------------------------------------------

  // Una Inversión pertenece a un Usuario (el inversor).
  Inversion.belongsTo(Usuario, { foreignKey: "id_inversor", as: "inversor" });

  // Una Inversión pertenece a un Proyecto específico.
  Inversion.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoInvertido",
  });

  // Una Inversión puede tener una Transacción asociada (uno a uno).
  Inversion.hasOne(Transaccion, {
    foreignKey: "id_inversion",
    as: "transaccion",
  });

  // Una Inversión está ligada a una SuscripcionProyecto.
  Inversion.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Proyecto (Un Proyecto tiene muchos...) ---
  // -------------------------------------------------------------------

  // Un Proyecto pertenece a un Usuario (el creador).
  Proyecto.belongsTo(Usuario, {
    foreignKey: "id_creador_proyecto",
    as: "creador",
  });

  // Un Proyecto tiene múltiples Transacciones.
  Proyecto.hasMany(Transaccion, {
    foreignKey: "id_proyecto",
    as: "transacciones",
    onDelete: "RESTRICT",
  });

  // Un Proyecto tiene múltiples Imágenes (fotos, planos, etc.).
  Proyecto.hasMany(Imagen, {
    foreignKey: "id_proyecto",
    as: "imagenes",
    onDelete: "RESTRICT",
  });

  // Un Proyecto está compuesto por múltiples Lotes.
  Proyecto.hasMany(Lote, {
    foreignKey: "id_proyecto",
    as: "lotes",
    onDelete: "RESTRICT",
  });

  // Un Proyecto puede tener asociado un Contrato (modelo antiguo).
  Proyecto.hasOne(Contrato, {
    foreignKey: "id_proyecto",
    as: "contrato",
    onDelete: "RESTRICT",
  });

  // Un Proyecto tiene múltiples Suscripciones activas.
  Proyecto.hasMany(SuscripcionProyecto, {
    foreignKey: "id_proyecto",
    as: "suscripciones_proyecto",
    onDelete: "RESTRICT",
  });

  // Un Proyecto tiene múltiples registros de Suscripciones Canceladas.
  Proyecto.hasMany(SuscripcionCancelada, {
    foreignKey: "id_proyecto",
    as: "cancelaciones",
    onDelete: "RESTRICT",
  });

  // Un Proyecto recibe múltiples Pujas (en sus lotes).
  Proyecto.hasMany(Puja, { foreignKey: "id_proyecto", as: "pujas" });

  // Un Proyecto tiene definidas múltiples CuotasMensuales.
  Proyecto.hasMany(CuotaMensual, {
    foreignKey: "id_proyecto",
    as: "cuotas_mensuales",
  });

  // Un Proyecto puede tener múltiples Plantillas de Contrato.
  Proyecto.hasMany(ContratoPlantilla, {
    foreignKey: "id_proyecto",
    as: "plantillas_contrato",
    onDelete: "RESTRICT",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Lote (Un Lote pertenece a...) ---
  // -------------------------------------------------------------------

  // Un Lote pertenece a un Usuario (el ganador de la subasta del lote).
  Lote.belongsTo(Usuario, { foreignKey: "id_ganador", as: "ganador" });

  // Un Lote tiene múltiples Pujas asociadas.
  Lote.hasMany(Puja, {
    foreignKey: "id_lote",
    as: "pujas",
    onDelete: "RESTRICT",
  });

  // Un Lote pertenece a un Proyecto.
  Lote.belongsTo(Proyecto, { foreignKey: "id_proyecto", as: "proyectoLote" });

  // Un Lote tiene múltiples Imágenes (detalles del lote).
  Lote.hasMany(Imagen, {
    foreignKey: "id_lote",
    as: "imagenes",
    onDelete: "RESTRICT",
  });

  // Un Lote tiene múltiples registros de Favorito.
  Lote.hasMany(Favorito, { foreignKey: "id_lote", as: "favoritos" });

  // -------------------------------------------------------------------
  // --- Relaciones de Puja (Una Puja pertenece a...) ---
  // -------------------------------------------------------------------

  // Una Puja pertenece a un Usuario.
  Puja.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });

  // Una Puja pertenece a un Lote específico.
  Puja.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" });

  // Una Puja puede tener una Transacción asociada (uno a uno).
  Puja.hasOne(Transaccion, {
    foreignKey: "id_puja",
    as: "transaccion",
    onDelete: "RESTRICT",
  });

  // Una Puja está ligada a una SuscripcionProyecto.
  Puja.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Transaccion (Una Transacción se asocia con...) ---
  // -------------------------------------------------------------------

  // Una Transacción pertenece a un Usuario.
  Transaccion.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });

  // Una Transacción está asociada a un Proyecto.
  Transaccion.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoTransaccion",
  });
  Transaccion.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });

  // Una Transacción puede estar ligada a una Puja (e.g., pago de reserva).
  Transaccion.belongsTo(Puja, { foreignKey: "id_puja", as: "puja" });

  // Una Transacción puede estar ligada a un Pago (mensualidad).
  Transaccion.belongsTo(Pago, {
    foreignKey: "id_pago_mensual",
    as: "pagoMensual",
  });

  // Una Transacción puede estar ligada a un PagoMercado (pasarela de pago).
  Transaccion.belongsTo(PagoMercado, {
    foreignKey: "id_pago_pasarela",
    as: "pagoPasarela",
  });

  // Una Transacción puede estar ligada a una Inversión.
  Transaccion.belongsTo(Inversion, {
    foreignKey: "id_inversion",
    as: "inversion",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Imagen (Una Imagen pertenece a...) ---
  // -------------------------------------------------------------------

  // Una Imagen pertenece a un Proyecto.
  Imagen.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoImagen",
  });

  // Una Imagen puede pertenecer a un Lote.
  Imagen.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" });

  // -------------------------------------------------------------------
  // --- Relaciones de Contrato (Modelo antiguo) ---
  // -------------------------------------------------------------------

  // Un Contrato pertenece a un Proyecto.
  Contrato.belongsTo(Proyecto, { foreignKey: "id_proyecto", as: "proyecto" });

  // Un Contrato pertenece a un Usuario (el firmante).
  Contrato.belongsTo(Usuario, {
    foreignKey: "id_usuario_firmante",
    as: "usuario_firmante",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de SuscripcionProyecto (Una suscripción tiene...) ---
  // -------------------------------------------------------------------

  // Una Suscripción pertenece a un Usuario.
  SuscripcionProyecto.belongsTo(Usuario, {
    foreignKey: "id_usuario",
    as: "usuario",
  });

  // Una Suscripción pertenece a un Proyecto.
  SuscripcionProyecto.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoAsociado",
  });

  // Una Suscripción genera múltiples Pagos (mensualidades).
  SuscripcionProyecto.hasMany(Pago, {
    foreignKey: "id_suscripcion",
    as: "pagos",
    onDelete: "RESTRICT",
  });

  // Una Suscripción puede generar múltiples Pujas.
  SuscripcionProyecto.hasMany(Puja, {
    foreignKey: "id_suscripcion",
    as: "pujas",
  });

  // Una Suscripción puede generar múltiples Inversiones.
  SuscripcionProyecto.hasMany(Inversion, {
    foreignKey: "id_suscripcion",
    as: "inversiones",
  });

  // Una Suscripción tiene un ResumenCuenta asociado (uno a uno).
  SuscripcionProyecto.hasOne(ResumenCuenta, {
    foreignKey: "id_suscripcion",
    as: "resumen_cuenta",
  });

  // Una Suscripción tiene un registro de SuscripcionCancelada (si fue cancelada).
  SuscripcionProyecto.hasOne(SuscripcionCancelada, {
    foreignKey: "id_suscripcion_original",
    as: "registroCancelacion",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de SuscripcionCancelada ---
  // -------------------------------------------------------------------

  // Una Cancelación pertenece a un Usuario.
  SuscripcionCancelada.belongsTo(Usuario, {
    foreignKey: "id_usuario",
    as: "usuarioCancelador",
  });

  // Una Cancelación está asociada a un Proyecto.
  SuscripcionCancelada.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoCancelado",
  });

  // Una Cancelación está asociada a la SuscripcionProyecto original.
  SuscripcionCancelada.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion_original",
    as: "suscripcionOriginal",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Pago (Mensualidad) ---
  // -------------------------------------------------------------------

  // Un Pago puede estar asociado directamente a un Usuario.
  Pago.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuarioDirecto" });

  // Un Pago puede estar asociado directamente a un Proyecto.
  Pago.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoDirecto",
  });

  // Un Pago pertenece a una SuscripcionProyecto.
  Pago.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });

  // Un Pago tiene una Transacción asociada.
  Pago.hasOne(Transaccion, {
    foreignKey: "id_pago_mensual",
    as: "transaccionMensual",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de PagoMercado (Pasarela) ---
  // -------------------------------------------------------------------

  // Un PagoMercado pertenece a una Transacción.
  PagoMercado.belongsTo(Transaccion, {
    foreignKey: "id_transaccion",
    as: "transaccionAsociada",
  });

  // Un PagoMercado está asociado a una Transacción (relación inversa).
  PagoMercado.hasOne(Transaccion, {
    foreignKey: "id_pago_pasarela",
    as: "transaccionDePasarela",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Mensaje ---
  // -------------------------------------------------------------------

  // Un Mensaje pertenece a un Usuario (remitente).
  Mensaje.belongsTo(Usuario, { foreignKey: "id_remitente", as: "remitente" });

  // Un Mensaje pertenece a un Usuario (receptor).
  Mensaje.belongsTo(Usuario, { foreignKey: "id_receptor", as: "receptor" });

  // -------------------------------------------------------------------
  // --- Relaciones de CuotaMensual ---
  // -------------------------------------------------------------------

  // Una CuotaMensual pertenece a un Proyecto.
  CuotaMensual.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyectoCuota",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de ResumenCuenta ---
  // -------------------------------------------------------------------

  // Un ResumenCuenta pertenece a una SuscripcionProyecto.
  ResumenCuenta.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion",
    as: "suscripcion",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de Favorito ---
  // -------------------------------------------------------------------

  // Un Favorito pertenece a un Usuario.
  Favorito.belongsTo(Usuario, { foreignKey: "id_usuario", as: "usuario" });

  // Un Favorito pertenece a un Lote.
  Favorito.belongsTo(Lote, { foreignKey: "id_lote", as: "lote" });

  // -------------------------------------------------------------------
  // --- Relaciones de ContratoPlantilla ---
  // -------------------------------------------------------------------

  // Una Plantilla de Contrato pertenece a un Proyecto.
  ContratoPlantilla.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyecto",
  });

  // Una Plantilla de Contrato tiene múltiples ContratosFirmados basados en ella.
  ContratoPlantilla.hasMany(ContratoFirmado, {
    foreignKey: "id_contrato_plantilla",
    as: "contratos_firmados_en_plantilla",
    onDelete: "RESTRICT",
  });

  // -------------------------------------------------------------------
  // --- Relaciones de ContratoFirmado ---
  // -------------------------------------------------------------------

  // Un ContratoFirmado pertenece a una Plantilla.
  ContratoFirmado.belongsTo(ContratoPlantilla, {
    foreignKey: "id_contrato_plantilla",
    as: "plantilla",
  });

  // Un ContratoFirmado pertenece a un Usuario (firmante).
  ContratoFirmado.belongsTo(Usuario, {
    foreignKey: "id_usuario_firmante",
    as: "firmante",
  });

  // Un ContratoFirmado está asociado a un Proyecto.
  ContratoFirmado.belongsTo(Proyecto, {
    foreignKey: "id_proyecto",
    as: "proyecto",
  });

  // Un ContratoFirmado puede estar asociado a una Inversión específica.
  ContratoFirmado.belongsTo(Inversion, {
    foreignKey: "id_inversion_asociada",
    as: "inversion",
  });

  // Un ContratoFirmado puede estar asociado a una SuscripcionProyecto.
  ContratoFirmado.belongsTo(SuscripcionProyecto, {
    foreignKey: "id_suscripcion_asociada",
    as: "suscripcion",
  });

  // -------------------------------------------------------------------
  // --- 🆕 Relaciones de VerificacionIdentidad ---
  // -------------------------------------------------------------------

  // Un registro de Verificación pertenece a un Usuario (el verificado).
  VerificacionIdentidad.belongsTo(Usuario, {
    foreignKey: "id_usuario",
    as: "usuario",
  });

  // Un registro de Verificación pertenece a un Usuario (el que verifica - Admin).
  VerificacionIdentidad.belongsTo(Usuario, {
    foreignKey: "id_verificador",
    as: "verificador",
  });
};

module.exports = configureAssociations;

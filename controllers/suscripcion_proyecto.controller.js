// Archivo: controllers/suscripcion_proyecto.controller.js

// Importaciones de servicios
const suscripcionProyectoService = require("../services/suscripcion_proyecto.service");
const resumenCuentaService = require("../services/resumen_cuenta.service");
const PagoService = require("../services/pago.service");
const TransaccionService = require("../services/transaccion.service");
// 🛑 NUEVAS IMPORTACIONES REQUERIDAS PARA LA LÓGICA 2FA 🛑
const auth2faService = require("../services/auth2fa.service");
const UsuarioService = require("../services/usuario.service");

// Importación de modelos y utilidades
const Proyecto = require("../models/proyecto");
const CuotaMensual = require("../models/CuotaMensual"); // 🛑 IMPORTACIÓN NECESARIA PARA VALIDAR LA CUOTA
const { sequelize } = require("../config/database");

/**
 * Controlador para gestionar el proceso de suscripción a un proyecto,
 * incluyendo la creación de pagos, transacciones y la implementación del punto de control 2FA.
 */
const suscripcionProyectoController = {
  /**
   * @async
   * @function iniciarSuscripcion
   * @description Inicia el proceso de suscripción, creando pagos y transacciones pendientes.
   * Si el 2FA está activo, detiene el flujo y solicita el código 2FA.
   * @param {object} req - Objeto de solicitud de Express (contiene `req.user.id` y `id_proyecto` en `body`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async iniciarSuscripcion(req, res) {
    // Iniciar transacción de DB para garantizar la atomicidad de los registros iniciales
    const t = await sequelize.transaction();
    try {
      const { id_proyecto } = req.body;
      const id_usuario = req.user && req.user.id;
      if (req.user.rol === "admin") {
        await t.rollback();
        return res.status(403).json({
          error:
            "⛔ Los administradores no pueden suscribirse como clientes por motivos de seguridad.",
        });
      }
      // 1. Validaciones básicas
      if (!id_usuario) {
        await t.rollback();
        return res.status(401).json({
          error: "Usuario no autenticado. Inicia sesión para continuar.",
        });
      }

      if (!id_proyecto) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "El ID del proyecto es requerido." });
      }

      // 2. Obtener datos cruciales
      const [proyecto, user] = await Promise.all([
        Proyecto.findByPk(id_proyecto, { transaction: t }),
        UsuarioService.findById(id_usuario, { transaction: t }),
      ]);

      if (!proyecto) {
        await t.rollback();
        return res.status(404).json({ error: "Proyecto no encontrado." });
      }

      // -------------------------------------------------------------
      // 🛑 VALIDACIONES TRASLADADAS Y LA NUEVA VALIDACIÓN DE CUOTA MENSUAL 🛑
      // -------------------------------------------------------------

      // 2a. Validación: Proyecto Cancelado o Finalizado
      if (
        proyecto.estado_proyecto === "Finalizado" ||
        proyecto.estado_proyecto === "Cancelado"
      ) {
        await t.rollback();
        return res.status(400).json({
          error: `❌ No se puede iniciar una suscripción. El proyecto "${proyecto.nombre_proyecto}" está en estado: ${proyecto.estado_proyecto}.`,
        });
      }

      // 2b. Validación: Límite de Suscriptores alcanzado
      if (proyecto.suscripciones_actuales >= proyecto.obj_suscripciones) {
        await t.rollback();
        return res.status(400).json({
          error: `❌ El proyecto "${proyecto.nombre_proyecto}" ya ha alcanzado su límite máximo de ${proyecto.obj_suscripciones} suscriptores. No se puede iniciar el pago.`,
        });
      }

      // 2c. VALIDACIÓN CRÍTICA: Cuota mensual requerida para el resumen de cuenta
      if (proyecto.tipo_inversion === "mensual") {
        const cuotaMensual = await CuotaMensual.findOne({
          where: { id_proyecto },
          transaction: t,
        });

        if (!cuotaMensual) {
          await t.rollback();
          return res.status(400).json({
            error: `❌ El proyecto "${proyecto.nombre_proyecto}" es mensual, pero no tiene una Cuota Mensual definida. La suscripción no puede continuar.`,
          });
        }

        // Verificamos el valor final de la cuota (asumiendo que es el monto usado para el ResumenCuenta)
        const valorMensualFinal = parseFloat(cuotaMensual.valor_mensual_final);
        if (valorMensualFinal <= 0 || isNaN(valorMensualFinal)) {
          await t.rollback();
          return res.status(400).json({
            error: `❌ El proyecto "${proyecto.nombre_proyecto}" tiene un plan mensual con un valor inválido ($${cuotaMensual.valor_mensual_final}). La suscripción no puede continuar.`,
          });
        }
      }

      // -------------------------------------------------------------
      // -------------------------------------------------------------

      const monto = parseFloat(proyecto.monto_inversion);

      // 🛑 PUNTO DE CONTROL DE SEGURIDAD 2FA 🛑
      if (user && user.is_2fa_enabled) {
        // Creamos los registros de pago y transacción en PENDIENTE
        const pagoPendiente = await PagoService.create(
          {
            id_suscripcion: null,
            id_usuario,
            id_proyecto,
            monto,
            fecha_vencimiento: new Date(),
            estado_pago: "pendiente",
            mes: 1,
          },
          { transaction: t },
        );

        const transaccionPendiente = await TransaccionService.create(
          {
            tipo_transaccion: "pago_suscripcion_inicial",
            monto,
            id_usuario,
            id_proyecto,
            id_pago_mensual: pagoPendiente.id,
            estado_transaccion: "pendiente", // El pago está pendiente del 2FA
          },
          { transaction: t },
        );

        await t.commit(); // Confirmamos los registros pendientes

        // Devolvemos 202 (Accepted) para indicar al frontend la necesidad de 2FA
        return res.status(202).json({
          message:
            "Suscripción iniciada, se requiere verificación 2FA para generar el checkout.",
          is2FARequired: true,
          transaccionId: transaccionPendiente.id,
          pagoId: pagoPendiente.id,
        });
      }

      // ---------------------------------------------------------------------------------------
      // FLUJO NORMAL (2FA NO activo) - Procede directamente a la pasarela
      // ---------------------------------------------------------------------------------------

      // 1. Crear Pago y Transacción Pendientes
      const pagoPendiente = await PagoService.create(
        {
          id_suscripcion: null,
          id_usuario,
          id_proyecto,
          monto,
          fecha_vencimiento: new Date(),
          estado_pago: "pendiente",
          mes: 1,
        },
        { transaction: t },
      );

      let transaccionPendiente = await TransaccionService.create(
        {
          tipo_transaccion: "pago_suscripcion_inicial",
          monto,
          id_usuario,
          id_proyecto,
          id_pago_mensual: pagoPendiente.id,
          estado_transaccion: "pendiente",
        },
        { transaction: t },
      );

      // 2. Generar la URL de redirección llamando al servicio de Transacciones
      const { redirectUrl } =
        await TransaccionService.generarCheckoutParaTransaccionExistente(
          transaccionPendiente,
          "mercadopago",
          { transaction: t },
        );

      await t.commit(); // Confirmamos todos los registros

      res.status(200).json({
        message: "Transacción creada. Redireccionando a la pasarela de pago.",
        transaccionId: transaccionPendiente.id,
        pagoId: pagoPendiente.id,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      console.error("Error al iniciar suscripción/pago:", error.message);
      // Devuelve 400 si el error es de negocio (tus validaciones), 500 para errores inesperados
      const statusCode = error.message.startsWith("❌") ? 400 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },
  /**
   * @async
   * @function adminUpdate
   * @description Permite a un administrador corregir campos de una suscripción.
   * Campos permitidos: tokens_disponibles, saldo_a_favor, monto_total_pagado,
   *                    meses_a_pagar, token_consumido, pago_generado, activo.
   */
  async adminUpdate(req, res) {
    try {
      const { id } = req.params;

      // Whitelist de campos editables — evita que se sobreescriban FK u otros campos sensibles
      const CAMPOS_PERMITIDOS = [
        "tokens_disponibles",
        "saldo_a_favor",
        "monto_total_pagado",
        "meses_a_pagar",
        "token_consumido",
        "pago_generado",
        "activo",
      ];

      const datosActualizacion = Object.fromEntries(
        Object.entries(req.body).filter(([key]) =>
          CAMPOS_PERMITIDOS.includes(key),
        ),
      );

      if (Object.keys(datosActualizacion).length === 0) {
        return res.status(400).json({
          error: `No se enviaron campos válidos. Campos permitidos: ${CAMPOS_PERMITIDOS.join(", ")}`,
        });
      }

      const suscripcion = await suscripcionProyectoService.update(
        id,
        datosActualizacion,
      );

      if (!suscripcion) {
        return res.status(404).json({ error: "Suscripción no encontrada." });
      }

      res.status(200).json({
        message: "Suscripción actualizada correctamente.",
        suscripcion,
      });
    } catch (error) {
      console.error("Error al actualizar suscripción (admin):", error.message);
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function confirmarSuscripcionCon2FA
   * @description Verifica el código 2FA para una transacción pendiente y, si es correcto,
   * genera la URL de checkout de la pasarela de pago.
   * @param {object} req - Contiene `transaccionId` y `codigo_2fa` en `body`.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarSuscripcionCon2FA(req, res) {
    const t = await sequelize.transaction();
    try {
      const userId = req.user.id;
      const { transaccionId, codigo_2fa } = req.body;

      // 1. Validar Transacción y Usuario
      const [user, transaccionPendiente] = await Promise.all([
        UsuarioService.findById(userId, { transaction: t }),
        TransaccionService.findById(transaccionId, { transaction: t }),
      ]);

      if (
        !user ||
        !transaccionPendiente ||
        transaccionPendiente.id_usuario !== userId ||
        transaccionPendiente.estado_transaccion !== "pendiente"
      ) {
        await t.rollback();
        return res.status(403).json({
          error: "Transacción no válida, no pendiente o no te pertenece.",
        });
      }

      // 2. VERIFICACIÓN CRÍTICA DEL 2FA
      if (!user.is_2fa_enabled || !user.twofa_secret) {
        await t.rollback();
        return res
          .status(403)
          .json({ error: "2FA no activo. Error de flujo." });
      }

      const isVerified = auth2faService.verifyToken(
        user.twofa_secret,
        codigo_2fa,
      );

      if (!isVerified) {
        await t.rollback();
        return res
          .status(401)
          .json({ error: "Código 2FA incorrecto. Transacción rechazada." });
      }

      // 3. EJECUTAR LA LÓGICA DE PASARELA (Solo si el 2FA es correcto)
      // Reutiliza la transacción existente para generar la URL de pago
      const { redirectUrl } =
        await TransaccionService.generarCheckoutParaTransaccionExistente(
          transaccionPendiente,
          "mercadopago",
          { transaction: t },
        );

      await t.commit();

      // 4. Respuesta de Éxito: Devolver la URL de redirección
      res.status(200).json({
        message: `Verificación 2FA exitosa. Redireccionando a la pasarela.`,
        redirectUrl: redirectUrl,
      });
    } catch (error) {
      await t.rollback();
      res.status(400).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function confirmarSuscripcion
   * @description Procesa la confirmación final de la suscripción (ejecutado después de un pago exitoso).
   * @param {object} req - Objeto de solicitud de Express (contiene `transaccionId`).
   * @param {object} res - Objeto de respuesta de Express.
   */
  async confirmarSuscripcion(req, res) {
    try {
      const { transaccionId } = req.body;

      if (!transaccionId) {
        return res
          .status(400)
          .json({ error: "El ID de la transacción es requerido." });
      }

      // El servicio maneja toda la lógica de validación, creación de Suscripción e Inversión.
      await suscripcionProyectoService.confirmarSuscripcion(transaccionId);

      res
        .status(200)
        .json({ message: "Suscripción confirmada y creada exitosamente." });
    } catch (error) {
      console.error("Error al confirmar la suscripción:", error);
      // Asumimos que los errores del servicio ya vienen formateados
      res.status(500).json({ error: error.message });
    }
  },

  // --- Funciones CRUD de Lectura y Eliminación Lógica ---

  /**
   * @async
   * @function findMySubscriptions
   * @description Obtiene todas las suscripciones del usuario autenticado.
   */
  async findMySubscriptions(req, res) {
    try {
      const userId = req.user.id;
      const suscripciones =
        await suscripcionProyectoService.findByUserId(userId);
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAll
   * @description Obtiene todas las suscripciones (para administradores).
   */
  async findAll(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAll();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllActivo
   * @description Obtiene todas las suscripciones activas (para administradores o reportes).
   */
  async findAllActivo(req, res) {
    try {
      const suscripciones = await suscripcionProyectoService.findAllActivo();
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findById
   * @description Obtiene una suscripción por ID (para administradores).
   */
  async findById(req, res) {
    try {
      const suscripcion = await suscripcionProyectoService.findById(
        req.params.id,
      );
      if (!suscripcion) {
        return res.status(404).json({ error: "Suscripción no encontrada" });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findMySubscriptionById
   * @description Obtiene una suscripción por ID, verificando que pertenezca al usuario autenticado.
   */
  async findMySubscriptionById(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const suscripcion = await suscripcionProyectoService.findByIdAndUserId(
        id,
        userId,
      );
      if (!suscripcion) {
        return res
          .status(404)
          .json({ error: "Suscripción no encontrada o no te pertenece." });
      }
      res.status(200).json(suscripcion);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },


  /**
   * @async
   * @function softDelete
   * @description Realiza el "soft delete" (cancelación) de una suscripción por ID. (Ruta de Admin)
   */
  async softDelete(req, res) {
    try {
      // 🛑 CORRECCIÓN: Usamos req.user, que es lo que funciona en el resto del controlador
      const usuarioAutenticado = req.user; // Asegurarse de que el usuario esté autenticado y su objeto esté disponible

      if (!usuarioAutenticado || !usuarioAutenticado.id) {
        return res
          .status(401)
          .json({ error: "Usuario no autenticado o ID de usuario faltante." });
      }

      const suscripcionEliminada = await suscripcionProyectoService.softDelete(
        req.params.id,
        usuarioAutenticado, // 👈 Se pasa el objeto completo (req.user)
      );

      if (!suscripcionEliminada) {
        return res.status(404).json({ error: "Suscripción no encontrada" });
      }

      res.status(200).json({ message: "Suscripción cancelada correctamente." });
    } catch (error) {
      // Manejo de errores específicos de negocio (400) vs errores de servidor (500)
      const isBusinessError =
        error.message.startsWith("❌") ||
        error.message.includes("Acceso denegado") ||
        error.message.includes("ya ha sido cancelada");

      const statusCode = isBusinessError ? 400 : 500;
      res.status(statusCode).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findActiveByProjectId
   * @description Obtiene solo las suscripciones ACTIVAS de un proyecto (Para administradores).
   */
  async findActiveByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const suscripciones =
        await suscripcionProyectoService.findActiveByProjectId(id_proyecto);
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  /**
   * @async
   * @function findAllByProjectId
   * @description Obtiene TODAS las suscripciones (activas e inactivas) de un proyecto (Para administradores).
   */
  async findAllByProjectId(req, res) {
    try {
      const { id_proyecto } = req.params;
      const suscripciones =
        await suscripcionProyectoService.findAllByProjectId(id_proyecto);
      res.status(200).json(suscripciones);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
  // =======================================================
  // 📊 NUEVAS FUNCIONES DE MÉTRICAS (KPIs)
  // =======================================================

  /**
   * @async
   * @function getMorosityMetrics
   * @description Obtiene las métricas de morosidad (Tasa de Morosidad, Monto en Riesgo) (KPI 4).
   * (ACCESO SÓLO ADMIN)
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getMorosityMetrics(req, res) {
    try {
      const metricas = await suscripcionProyectoService.getMorosityMetrics();
      res.status(200).json({
        kpi_name: "Tasa y Monto de Morosidad",
        ...metricas,
      });
    } catch (error) {
      console.error("Error al obtener métricas de morosidad:", error.message);
      res
        .status(500)
        .json({ error: "Error interno al calcular la morosidad." });
    }
  },

  /**
   * @async
   * @function getCancellationRate
   * @description Obtiene la Tasa de Cancelación de Suscripciones (Churn Rate) (KPI 5).
   * (ACCESO SÓLO ADMIN)
   * @param {object} req - Objeto de solicitud de Express.
   * @param {object} res - Objeto de respuesta de Express.
   */
  async getCancellationRate(req, res) {
    try {
      const metricas = await suscripcionProyectoService.getCancellationRate();
      res.status(200).json({
        kpi_name: "Tasa de Cancelación (Churn Rate)",
        ...metricas,
      });
    } catch (error) {
      console.error("Error al obtener la tasa de cancelación:", error.message);
      res
        .status(500)
        .json({ error: "Error interno al calcular la tasa de cancelación." });
    }
  },
  // ============================================================
// CANCELACIÓN DE SUSCRIPCIÓN CON 2FA (stateless, sin Map)
// ============================================================

/**
 * Paso 1: Inicia la cancelación de una suscripción.
 * Si el usuario tiene 2FA activo, devuelve el suscripcionId para solicitar código.
 * Si no, cancela directamente.
 */
async iniciarCancelacionSuscripcion (req, res){
  try {
    const usuarioAutenticado = req.user;
    const suscripcionId = req.params.id;
    const esAdmin = usuarioAutenticado.rol === "admin";
    const motivo = req.body.motivo || null;

    // Validar suscripción
    const suscripcion = await suscripcionProyectoService.findById(suscripcionId);
    if (!suscripcion) return res.status(404).json({ error: "Suscripción no encontrada." });
    if (!esAdmin && suscripcion.id_usuario !== usuarioAutenticado.id) {
      return res.status(403).json({ error: "No tienes permiso para cancelar esta suscripción." });
    }
    if (!suscripcion.activo) {
      return res.status(400).json({ error: "La suscripción ya está cancelada." });
    }

    const user = await UsuarioService.findById(usuarioAutenticado.id);
    if (!user) throw new Error("Usuario no encontrado");

    if (user.is_2fa_enabled) {
      return res.status(202).json({
        message: "Se requiere verificación 2FA para cancelar la suscripción.",
        requires2FA: true,
        suscripcionId: suscripcionId
      });
    }

    // Sin 2FA: cancelar directamente
    const resultado = await suscripcionProyectoService.softDelete(suscripcionId, usuarioAutenticado);
    res.status(200).json({ message: "Suscripción cancelada correctamente.", suscripcion: resultado });
  } catch (error) {
    console.error("Error en iniciarCancelacionSuscripcion:", error.message);
    res.status(400).json({ error: error.message });
  }
},

/**
 * Paso 2: Confirma la cancelación con el código 2FA.
 */
async confirmarCancelacionSuscripcion  (req, res) {
  try {
    const usuarioId = req.user.id;
    const { suscripcionId, codigo_2fa, motivo } = req.body;
    if (!suscripcionId || !codigo_2fa) {
      return res.status(400).json({ error: "Faltan suscripcionId o codigo_2fa." });
    }

    const user = await UsuarioService.findById(usuarioId);
    if (!user || !user.is_2fa_enabled || !user.twofa_secret) {
      return res.status(403).json({ error: "2FA no activo o configuración inválida." });
    }

    const isVerified = auth2faService.verifyToken(user.twofa_secret, codigo_2fa);
    if (!isVerified) {
      return res.status(401).json({ error: "Código 2FA incorrecto." });
    }

    // Revalidar que la suscripción sigue activa y pertenece
    const esAdmin = req.user.rol === "admin";
    const usuarioAutenticado = { id: usuarioId, rol: esAdmin ? "admin" : "cliente" };
    const suscripcion = await suscripcionProyectoService.findById(suscripcionId);
    if (!suscripcion || !suscripcion.activo) {
      return res.status(409).json({ error: "La suscripción ya no está activa o no existe." });
    }
    if (!esAdmin && suscripcion.id_usuario !== usuarioId) {
      return res.status(403).json({ error: "No tienes permiso para cancelar esta suscripción." });
    }

    const resultado = await suscripcionProyectoService.softDelete(suscripcionId, usuarioAutenticado);
    res.status(200).json({ message: "Suscripción cancelada correctamente.", suscripcion: resultado });
  } catch (error) {
    console.error("Error en confirmarCancelacionSuscripcion:", error.message);
    res.status(400).json({ error: error.message });
  }
}
};

module.exports = suscripcionProyectoController;

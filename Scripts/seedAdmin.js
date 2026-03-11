// scripts/seedAdmin.js
require("dotenv").config(); // Cargar variables de entorno

const { sequelize } = require("../config/database");
const Usuario = require("../models/usuario");
const authService = require("../services/auth.service");

async function seedAdmin() {
  try {
    console.log("🔄 Conectando a la base de datos...");
    await sequelize.authenticate();
    console.log("✅ Conexión establecida\n");

    // ✅ CORRECCIÓN: Verificar si ya existe un admin ACTIVO
    const existingAdmin = await Usuario.findOne({
      where: {
        rol: "admin",
        activo: true, // 🔥 CAMBIO CRÍTICO: Solo buscar admins activos
      },
    });

    if (existingAdmin) {
      console.log(
        "⚠️  Ya existe un usuario administrador ACTIVO en el sistema"
      );
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`   📧 Email:   ${existingAdmin.email}`);
      console.log(`   👤 Usuario: ${existingAdmin.nombre_usuario}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      console.log("❌ No se creará un nuevo admin.");
      console.log(
        "   Si necesitas otro admin, usa el endpoint de administración.\n"
      );
      await sequelize.close();
      process.exit(0);
    }

    // 🆕 INFORMACIÓN ADICIONAL: Verificar si hay admins inactivos
    const inactiveAdmins = await Usuario.findAll({
      where: {
        rol: "admin",
        activo: false,
      },
      attributes: ["id", "email", "nombre_usuario"],
    });

    if (inactiveAdmins.length > 0) {
      console.log("⚠️  ADVERTENCIA: Se encontraron administradores INACTIVOS:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      inactiveAdmins.forEach((admin) => {
        console.log(
          `   🔒 ID: ${admin.id} | Email: ${admin.email} | Usuario: ${admin.nombre_usuario}`
        );
      });
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(
        "   Si deseas reactivar una de estas cuentas en lugar de crear una nueva,"
      );
      console.log(
        "   usa el endpoint PATCH /api/usuarios/:id/reactivate desde otro admin.\n"
      );
      console.log(
        "   ⏩ Procediendo a crear un nuevo administrador ACTIVO...\n"
      );
    }

    // 🔒 Datos del primer administrador
    // Se toman de variables de entorno o valores por defecto
    const adminData = {
      nombre: process.env.ADMIN_NOMBRE || "Admin",
      apellido: process.env.ADMIN_APELLIDO || "Sistema",
      email: process.env.ADMIN_EMAIL || "admin@tuapp.com",
      dni: process.env.ADMIN_DNI || "00000000",
      nombre_usuario: process.env.ADMIN_USERNAME || "admin",
      contraseña: process.env.ADMIN_PASSWORD || "Admin123!@#",
      numero_telefono: process.env.ADMIN_TELEFONO || "000-000000",
      rol: "admin",
      activo: true,
      confirmado_email: true,
      is_2fa_enabled: false,
    };

    console.log("🔍 Verificando disponibilidad de datos...");

    // ✅ CORRECCIÓN: Verificar email solo en cuentas ACTIVAS
    const existingEmail = await Usuario.findOne({
      where: {
        email: adminData.email,
        activo: true, // 🔥 Solo verificar conflictos con cuentas activas
      },
    });
    if (existingEmail) {
      console.log("❌ Error: El email ya está en uso por una cuenta ACTIVA");
      await sequelize.close();
      process.exit(1);
    }

    // ✅ CORRECCIÓN: Verificar username solo en cuentas ACTIVAS
    const existingUsername = await Usuario.findOne({
      where: {
        nombre_usuario: adminData.nombre_usuario,
        activo: true, // 🔥 Solo verificar conflictos con cuentas activas
      },
    });
    if (existingUsername) {
      console.log(
        "❌ Error: El nombre de usuario ya está en uso por una cuenta ACTIVA"
      );
      await sequelize.close();
      process.exit(1);
    }

    // ✅ CORRECCIÓN: Verificar DNI solo en cuentas ACTIVAS
    const existingDni = await Usuario.findOne({
      where: {
        dni: adminData.dni,
        activo: true, // 🔥 Solo verificar conflictos con cuentas activas
      },
    });
    if (existingDni) {
      console.log("❌ Error: El DNI ya está en uso por una cuenta ACTIVA");
      await sequelize.close();
      process.exit(1);
    }

    console.log("✅ Datos disponibles");
    console.log("🔐 Hasheando contraseña...");

    // Hashear la contraseña
    const hashedPassword = await authService.hashPassword(adminData.contraseña);

    console.log("✅ Contraseña hasheada");
    console.log("💾 Creando administrador...\n");

    // Crear el usuario admin
    const admin = await Usuario.create({
      ...adminData,
      contraseña_hash: hashedPassword,
    });

    // Mostrar información del admin creado
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🎉 ¡ADMINISTRADOR CREADO EXITOSAMENTE!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📧 Email:        ${admin.email}`);
    console.log(`👤 Usuario:      ${admin.nombre_usuario}`);
    console.log(`🔑 Rol:          ${admin.rol}`);
    console.log(`🆔 ID:           ${admin.id}`);
    console.log(`✅ Activo:       ${admin.activo ? "Sí" : "No"}`);
    console.log(`📬 Confirmado:   ${admin.confirmado_email ? "Sí" : "No"}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("⚠️  IMPORTANTE - PRÓXIMOS PASOS:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("1. 🔐 Inicia sesión con estas credenciales");
    console.log("2. 🔄 Cambia la contraseña INMEDIATAMENTE");
    console.log("3. 🛡️  Activa 2FA desde el panel de configuración");
    console.log("4. 🗑️  Elimina o asegura este script en producción");
    console.log(
      "5. 🔒 Si usaste variables de entorno, elimina ADMIN_PASSWORD del .env"
    );
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR AL CREAR EL ADMINISTRADOR:");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error(error.message);
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (sequelize) {
      await sequelize.close();
    }
    process.exit(1);
  }
}

// Ejecutar el script
seedAdmin();

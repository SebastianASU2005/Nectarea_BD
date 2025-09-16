const crypto = require('crypto');
const usuarioService = require('../services/usuario.service');
const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const jwtService = require('../services/jwt.service'); // ¡NUEVO!

const authController = {
  // Función para registrar un nuevo usuario
  async register(req, res) {
    try {
      // 1. Hashear la contraseña antes de guardarla
      const hashedPassword = await authService.hashPassword(req.body.contraseña);
      
      // 2. Generar un token de confirmación para el email
      const confirmacionToken = crypto.randomBytes(20).toString('hex');
      const confirmacionTokenExpiracion = new Date(Date.now() + 3600000); // Token válido por 1 hora

      const userData = {
        ...req.body,
        contraseña_hash: hashedPassword,
        confirmacion_token: confirmacionToken,
        confirmacion_token_expiracion: confirmacionTokenExpiracion,
        confirmado_email: false // El email aún no ha sido confirmado
      };
      
      // 3. Crear el usuario en la base de datos
      const newUser = await usuarioService.create(userData);
      
      // 4. Enviar el correo de confirmación
      const subject = 'Confirmación de tu cuenta en Inmoverse';
      const confirmLink = `http://localhost:3000/api/auth/confirmar_email/${confirmacionToken}`;
      const text = `Hola ${newUser.nombre},\n\nGracias por registrarte en Inmoverse.\n\nPor favor, haz clic en el siguiente enlace para confirmar tu dirección de correo electrónico:\n\n${confirmLink}\n\nEste enlace expirará en 1 hora.`;
      
      await emailService.sendEmail(newUser.email, subject, text);
      
      res.status(201).json({ 
        message: 'Usuario registrado exitosamente. Se ha enviado un enlace de confirmación a su correo.',
        user: {
          id: newUser.id,
          nombre_usuario: newUser.nombre_usuario,
          email: newUser.email,
        },
      });
      
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  // Función para el inicio de sesión
  async login(req, res) {
    try {
      const { nombre_usuario, contraseña } = req.body;
      
      // 1. Buscar al usuario por nombre de usuario
      const user = await usuarioService.findByUsername(nombre_usuario);

      if (!user) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }

      // 2. Comparar la contraseña ingresada con el hash de la base de datos
      const isMatch = await authService.comparePassword(contraseña, user.contraseña_hash);

      if (!isMatch) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
      }

      // 3. ¡NUEVO! Generar el token JWT
      const token = jwtService.generateToken(user);

      // 4. Devolver el token y los datos básicos del usuario
      res.status(200).json({
        message: 'Inicio de sesión exitoso.',
        token: token,
        user: {
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          rol: user.rol,
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Función para confirmar el email del usuario
  async confirmarEmail(req, res) {
    try {
      const { token } = req.params;

      // 1. Buscar al usuario con el token de confirmación
      const user = await usuarioService.findByConfirmationToken(token);

      if (!user) {
        return res.status(404).json({ error: 'Token de confirmación inválido.' });
      }

      // 2. Verificar si el token ha expirado
      if (user.confirmacion_token_expiracion < new Date()) {
        return res.status(400).json({ error: 'El token de confirmación ha expirado.' });
      }

      // 3. Marcar el email como confirmado y limpiar los campos del token
      user.confirmado_email = true;
      user.confirmacion_token = null;
      user.confirmacion_token_expiracion = null;
      await user.save();

      res.status(200).json({ message: 'Email confirmado exitosamente. ¡Gracias!' });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = authController;

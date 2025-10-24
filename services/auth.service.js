const bcrypt = require("bcryptjs");

/**
 * Servicio de autenticación básico centrado en el manejo seguro de contraseñas
 * mediante hashing asíncrono con bcryptjs.
 */
const authService = {
  /**
   * @async
   * @function hashPassword
   * @description Hashea una contraseña usando un factor de costo de 10.
   * Este proceso genera un valor único ('salt') que se incluye en el hash final.
   * @param {string} password - La contraseña en texto plano a hashear.
   * @returns {Promise<string>} El hash de la contraseña resultante.
   */
  async hashPassword(password) {
    // Genera un 'salt' (valor aleatorio) con un factor de costo de 10.
    const salt = await bcrypt.genSalt(10);
    // Hashea la contraseña usando el 'salt' generado.
    return bcrypt.hash(password, salt);
  },

  /**
   * @async
   * @function comparePassword
   * @description Compara una contraseña en texto plano con un hash almacenado.
   * Internamente, utiliza el 'salt' extraído del hash para recrear el hash y compararlo de forma segura.
   * @param {string} password - La contraseña ingresada por el usuario.
   * @param {string} hash - El hash de la contraseña almacenado en la base de datos.
   * @returns {Promise<boolean>} Devuelve true si la contraseña coincide con el hash, false si no.
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  },
};

module.exports = authService;

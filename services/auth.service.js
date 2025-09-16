const bcrypt = require('bcryptjs');

const authService = {
  /**
   * Hashes una contraseña.
   * @param {string} password - La contraseña a hashear.
   * @returns {Promise<string>} El hash de la contraseña.
   */
  async hashPassword(password) {
    // Genera un 'salt' (valor aleatorio) para asegurar que el hash sea único, incluso para la misma contraseña.
    const salt = await bcrypt.genSalt(10);
    // Hashea la contraseña con el 'salt'.
    return bcrypt.hash(password, salt);
  },

  /**
   * Compara una contraseña con su hash.
   * @param {string} password - La contraseña ingresada por el usuario.
   * @param {string} hash - El hash de la contraseña almacenado en la base de datos.
   * @returns {Promise<boolean>} Devuelve true si coinciden, false si no.
   */
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }
};

module.exports = authService;
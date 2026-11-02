const { openDatabase } = require('./database');
const { hashPassword } = require('./password');
async function main() {
  const usuario = process.env.ADMIN_USER?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!usuario || usuario.length > 80 || !password || password.length < 12 || password.length > 128) throw new Error('Define ADMIN_USER y ADMIN_PASSWORD (12 a 128 caracteres).');
  const db = await openDatabase();
  try {
    await db.run('INSERT INTO usuarios (usuario, nombre, password) VALUES (?, ?, ?)', usuario, process.env.ADMIN_NAME?.trim() || usuario, hashPassword(password));
    console.log('Usuario creado en la base configurada.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'El usuario ya existe.' : 'No se pudo crear el usuario. Revisa credenciales, conexión y que el usuario sea nuevo.'); process.exitCode = 1; });

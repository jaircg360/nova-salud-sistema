const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
module.exports = { hashPassword, verifyPassword };

/**
 * admin-auth SAF testleri — parola karma (scrypt) + imzalı oturum token'ı.
 * Kullanım: node rooms-server/admin-auth.test.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const a = require('./admin-auth.js');

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else {
    fail++;
    console.error('  ❌', m);
  }
};

// --- parola karma ---
const h = a.hashPassword('güçlü-parola-123');
ok(/^scrypt\$/.test(h), 'karma scrypt biçiminde');
ok(!h.includes('güçlü-parola-123'), 'düz metin parola karmada YOK');
ok(a.verifyPassword('güçlü-parola-123', h) === true, 'doğru parola doğrulanır');
ok(a.verifyPassword('yanlış', h) === false, 'yanlış parola reddedilir');
ok(a.verifyPassword('güçlü-parola-123', 'bozuk$hash') === false, 'bozuk karma reddedilir');
ok(a.isValidHash(h) === true && a.isValidHash('düz-metin') === false, 'karma biçim denetimi');
// Aynı parola iki kez → farklı karma (rastgele tuz)
ok(a.hashPassword('x') !== a.hashPassword('x'), 'her karma farklı tuz kullanır');

// --- oturum token ---
const secret = 'test-secret';
const tok = a.signToken({ sub: 'admin', exp: Date.now() + 10000 }, secret);
ok(a.verifyToken(tok, secret)?.sub === 'admin', 'geçerli token doğrulanır');
ok(a.verifyToken(tok, 'başka-secret') === null, 'yanlış anahtarla token reddedilir');
ok(a.verifyToken(tok + 'x', secret) === null, 'kurcalanmış token reddedilir');
ok(
  a.verifyToken(a.signToken({ exp: Date.now() - 1 }, secret), secret) === null,
  'süresi dolmuş token reddedilir',
);
ok(
  a.verifyToken('', secret) === null && a.verifyToken(null, secret) === null,
  'boş token reddedilir',
);
// exp'siz token → reddedilir (kalıcı oturum olmasın)
ok(
  a.verifyToken(a.signToken({ sub: 'admin' }, secret), secret) === null,
  'exp yoksa token reddedilir',
);

console.log(`\nadmin-auth: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);

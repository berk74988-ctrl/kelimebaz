'use strict';

/**
 * YÖNETİM KİMLİK DOĞRULAMA — bağımlılıksız (Node yerleşik crypto).
 *
 * Parola karma: **scrypt** (bellek-sert KDF; bcrypt/argon2 muadili, ama Node'a
 * gömülü → bağımlılık yok). Düz metin parola HİÇBİR yerde saklanmaz; yalnız
 * `scrypt$N$r$p$salt$hash` biçiminde karma ortam değişkeninde durur.
 *
 * Oturum: HMAC-SHA256 ile İMZALI token (`base64url(json).imza`) — sunucu gizli
 * anahtarıyla doğrulanır, süre dolumu (exp) içerir. Kurcalanırsa geçersiz.
 *
 * Hepsi saf ve doğrudan test edilir (server ayağa kalkmadan).
 */

const crypto = require('crypto');

// scrypt parametreleri: 16 MB bellek maliyeti (128*N*r) — kaba kuvveti pahalılaştırır.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024;

/** Parolayı karmala → `scrypt$N$r$p$saltHex$hashHex` (saltHex verilirse yeniden üretir). */
function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(password), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${dk.toString('hex')}`;
}

/** Parola saklanan karmayla eşleşiyor mu? (sabit-zamanlı; hata→false). */
function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const dk = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, {
      N: +n,
      r: +r,
      p: +p,
      maxmem: MAXMEM,
    });
    return expected.length === dk.length && crypto.timingSafeEqual(expected, dk);
  } catch {
    return false;
  }
}

/** Geçerli bir scrypt karması mı? (yapılandırma denetimi için). */
function isValidHash(stored) {
  return /^scrypt\$\d+\$\d+\$\d+\$[0-9a-f]+\$[0-9a-f]+$/i.test(String(stored || ''));
}

/** İmzalı oturum token'ı üret — payload'a exp eklenir (ms). */
function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}

/** Token'ı doğrula: imza + süre. Geçersiz/süresi dolmuş → null. */
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { hashPassword, verifyPassword, isValidHash, signToken, verifyToken };

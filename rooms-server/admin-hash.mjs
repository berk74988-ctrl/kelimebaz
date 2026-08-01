/**
 * YÖNETİM PAROLA KARMASI ÜRET — ortam değişkenine konacak scrypt karması.
 *
 * Düz metin parola HİÇBİR yerde saklanmaz; yalnız çıktısındaki karma env'e girer.
 *
 * Kullanım:
 *   node rooms-server/admin-hash.mjs 'güçlü-parolam'
 * Çıktıyı servise ver:
 *   /etc/systemd/system/berk-rooms.service içine
 *   Environment=ADMIN_PASS_HASH=scrypt$...
 * sonra: sudo systemctl daemon-reload && sudo systemctl restart berk-rooms
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hashPassword } = require('./admin-auth.js');

const pw = process.argv[2];
if (!pw || pw.length < 8) {
  console.error('Kullanım: node rooms-server/admin-hash.mjs <parola>  (en az 8 karakter)');
  process.exit(1);
}
console.log(hashPassword(pw));

/**
 * hint-util SAF fonksiyon testleri — sunucu ayağa kalkmadan.
 * Kullanım: node rooms-server/hint-util.test.mjs
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const u = require('./hint-util.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error('  ❌', msg); } };

// --- leaksAnswer: cevap sızıntısı yakalanmalı ---
ok(u.leaksAnswer('KALEM', 'Cevap KALEM olabilir') === true, 'düz cevap yakalanmalı');
ok(u.leaksAnswer('KALEM', 'K A L E M harflerini dene') === true, 'ayraçlı harf dizisi yakalanmalı');
ok(u.leaksAnswer('KALEM', 'KALEMİ denemelisin') === true, 'çekim eki yakalanmalı');
ok(u.leaksAnswer('KİTAP', 'kitap kelimesini yaz') === true, 'küçük harf cevap yakalanmalı');
ok(u.leaksAnswer('KALEM', 'Üçüncü harf ünlü, K ile başlayan bir kelime dene') === false, 'temiz ipucu sızıntı DEĞİL');
ok(u.leaksAnswer('MASA', 'Sarı harfleri başka yere kaydır') === false, 'genel ipucu sızıntı değil');

// --- validateInput ---
const good = u.validateInput({ length: 5, lang: 'tr', answer: 'kalem', guesses: [{ word: 'araba', pattern: '00100' }] });
ok(!good.error && good.answer === 'KALEM' && good.length === 5, 'geçerli girdi kabul');
ok(u.validateInput({ length: 5, answer: 'kalem', guesses: [{ word: 'ab', pattern: '00' }] }).error === 'bad_guess_word', 'yanlış uzunlukta tahmin reddedilir');
ok(u.validateInput({ length: 5, answer: 'kalem', guesses: [{ word: 'araba', pattern: '00X00' }] }).error === 'bad_pattern', 'bozuk desen reddedilir');
ok(u.validateInput({ length: 9, answer: 'x', guesses: [] }).error, 'geçersiz uzunluk reddedilir');
ok(u.validateInput({ length: 5, answer: 'kalem', guesses: [] }).error === 'bad_guesses', 'boş tahmin listesi reddedilir');

// --- sanitizeHint: XML/etiket temizliği ---
ok(u.sanitizeHint('<thinking>gizli</thinking> Gerçek ipucu') === 'gizli Gerçek ipucu' || !u.sanitizeHint('<thinking>x</thinking> ipucu').includes('<'), 'XML etiketleri temizlenir');
ok(!u.sanitizeHint('<b>ip</b>ucu').includes('<'), 'etiket kalmaz');

// --- genericHint ---
ok(u.genericHint('tr').length > 0 && u.genericHint('en').length > 0, 'genel ipucu iki dilde var');

console.log(`\nhint-util: ${pass} geçti, ${fail} kaldı`);
process.exit(fail ? 1 : 0);

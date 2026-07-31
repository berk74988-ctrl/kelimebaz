/**
 * ODA AKIŞI SENARYOLARI (rooms-server) — çok oyunculu ana akışlar.
 *
 * Sunucuyu başlatır ve uçtan uca (gerçek HTTP) doğrular:
 *   1. İki oyuncu katılır → ikisi de lobide
 *   2. Biri ayrılır → oda güncellenir
 *   3. Sahip ayrılır → sahiplik en eski oyuncuya DEVREDİLİR
 *   4. Yeniden bağlanma → kaydedilmiş kimlikle (playerId+token) oturum sürer
 *   5. Yetki → yanlış token reddedilir (403)
 *   6. Son oyuncu ayrılınca oda silinir (404)
 *
 * Tarayıcısız + deterministik (CI-uyumlu). Kullanım: node scripts/rooms-flow-check.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const DIR = fileURLToPath(new URL('../rooms-server', import.meta.url));
const STATE = fileURLToPath(new URL('../rooms-server/.test-flow-state.json', import.meta.url));
const PORT = 4297;
const BASE = `http://127.0.0.1:${PORT}`;
// Akış testinde hız sınırı engel olmasın diye yüksek eşikler.
const ENV = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  STATE_FILE: STATE,
  RL_CREATE: '100',
  RL_JOIN: '100',
  RL_CHAT_IP: '100',
  RL_CHAT_PLAYER: '100',
};

let fail = 0;
const check = (name, ok, d = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${d ? '  — ' + d : ''}`);
};

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const create = (name) => post('/create', { name });
const join = (code, name) => post('/join', { code, name });
const leave = (code, playerId, token) => post('/leave', { code, playerId, token });
const state = (code, playerId = '') =>
  get(`/state?code=${code}&playerId=${encodeURIComponent(playerId)}`);

rmSync(STATE, { force: true });
const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env: ENV, stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE + '/health')).ok) break;
  } catch {
    /* değil */
  }
  await sleep(100);
}

// --- 1) İki oyuncu katılır ---
const a = (await create('Ayse')).data;
const b = (await join(a.code, 'Berk')).data;
const s1 = (await state(a.code, a.playerId)).data.room;
check('iki oyuncu lobide', s1.playerCount === 2, `${s1.playerCount} oyuncu`);
check(
  'her iki ad görünüyor',
  s1.players.some((p) => p.name === 'Ayse') && s1.players.some((p) => p.name === 'Berk'),
);

// --- 2) Biri ayrılır ---
await leave(a.code, b.playerId, b.token);
const s2 = (await state(a.code, a.playerId)).data.room;
check('ayrılan oyuncu odadan çıktı', s2.playerCount === 1, `${s2.playerCount} oyuncu`);
check('kalan yalnız Ayse', s2.players[0]?.name === 'Ayse');

// --- 3) Sahiplik devri: sahip ayrılınca en eski oyuncuya geçer ---
const c = (await create('Sahip')).data;
const d = (await join(c.code, 'Konuk')).data;
check('başta sahip oluşturan', c.playerId === (await state(c.code)).data.room.ownerId);
await leave(c.code, c.playerId, c.token); // SAHİP ayrılır
const s3 = (await state(c.code, d.playerId)).data.room;
check('sahiplik devredildi (yeni sahip = kalan oyuncu)', s3.ownerId === d.playerId, s3.ownerId);
check('kalan oyuncu artık sahip', s3.you?.isOwner === true);

// --- 4) Yeniden bağlanma: kaydedilmiş kimlikle oturum sürer ---
const e = (await create('Reconn')).data;
// "Sayfa yenilendi" — aynı creds ile durum çek + eylem yap
const reState = (await state(e.code, e.playerId)).data.room;
check('yeniden bağlanınca hâlâ odada', reState.you?.inRoom === true);
const reChat = await post('/chat', {
  code: e.code,
  playerId: e.playerId,
  token: e.token,
  text: 'geri döndüm',
});
check('kaydedilmiş kimlikle eylem yapılabiliyor', reChat.status === 200);

// --- 5) Yetki: yanlış token reddedilir ---
const bad = await post('/chat', {
  code: e.code,
  playerId: e.playerId,
  token: 'YANLIS',
  text: 'sahtekar',
});
check('yanlış token reddedilir (403)', bad.status === 403, `durum ${bad.status}`);

// --- 6) Son oyuncu ayrılınca oda silinir ---
const f = (await create('Solo')).data;
await leave(f.code, f.playerId, f.token);
const gone = await state(f.code);
check('boşalan oda silindi (404)', gone.status === 404, `durum ${gone.status}`);

child.kill();
await sleep(200);
rmSync(STATE, { force: true });

console.log('\n' + (fail ? `❌ ${fail} kontrol başarısız` : '✅ ODA AKIŞ SENARYOLARI GEÇTİ'));
process.exit(fail ? 1 : 0);

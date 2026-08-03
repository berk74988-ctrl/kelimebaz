/**
 * ODA SUNUCUSU — SSE (canlı akış) DENETİMİ.
 *
 * Gerçek server.js'i başlatır, bir oda kurar, GET /events ile SSE bağlantısı açar ve:
 *   1) bağlanır bağlanmaz İLK oda durumunu push ediyor mu,
 *   2) bir mutasyondan (sohbet) sonra güncel odayı ANINDA push ediyor mu (polling YOK),
 *   3) oda silinince "gone" olayı gönderiyor mu
 * doğrular. Böylece istemcinin polling yerine SSE'ye geçişi CI'da güvence altına alınır.
 *
 * Kullanım: node scripts/rooms-sse-check.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';

const DIR = fileURLToPath(new URL('../rooms-server', import.meta.url));
const STATE = fileURLToPath(new URL('../rooms-server/.test-sse-state.json', import.meta.url));
const PORT = 4298;
const BASE = `http://127.0.0.1:${PORT}`;
const ENV = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  STATE_FILE: STATE,
  SSE_PUSH_MS: '150', // testte hızlı push
  RL_CREATE: '100',
  RL_JOIN: '100',
  RL_CHAT: '100',
  RL_CHAT_IP: '100',
  RL_CHAT_PLAYER: '100',
  RL_EVENTS: '100',
};

let failures = 0;
const ok = (c, m) => {
  console.log(`${c ? '✅' : '❌'} ${m}`);
  if (!c) failures++;
};

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** SSE bağlantısı aç; gelen her {room} / gone olayını topla. */
function openSse(code, playerId) {
  const events = [];
  const state = { gone: false, contentType: '' };
  const req = http.request(
    `${BASE}/events?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`,
    (res) => {
      state.contentType = res.headers['content-type'] || '';
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          if (/^event:\s*gone/m.test(block)) {
            state.gone = true;
            continue;
          }
          const line = block.split('\n').find((l) => l.startsWith('data:'));
          if (!line) continue;
          try {
            const obj = JSON.parse(line.slice(5).trim());
            if (obj && obj.room) events.push(obj.room);
          } catch {
            /* keepalive / retry satırı */
          }
        }
      });
    },
  );
  req.end();
  return { events, state, close: () => req.destroy() };
}

async function waitFor(pred, ms = 3000, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return true;
    await sleep(step);
  }
  return false;
}

const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env: ENV, stdio: 'ignore' });
let sse;
try {
  // sunucu hazır olsun
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + '/health')).ok) {
        up = true;
        break;
      }
    } catch {
      /* daha kalkmadı */
    }
    await sleep(100);
  }
  if (!up) throw new Error('sunucu başlamadı');

  // 1) oda kur
  const create = await post('/create', { name: 'Ali', settings: { maxPlayers: 6, timeLimit: 0 } });
  ok(create.status === 200 && create.json.code, 'oda kuruldu');
  const { code, playerId } = create.json;

  // 2) SSE aç → ilk durum hemen gelmeli
  sse = openSse(code, playerId);
  const gotInitial = await waitFor(() => sse.events.length >= 1);
  ok(gotInitial, 'SSE bağlanınca ilk oda durumu push edildi');
  ok(/text\/event-stream/.test(sse.state.contentType), 'içerik türü text/event-stream');
  ok(sse.events[0]?.code === code && sse.events[0]?.players?.length === 1, 'ilk durum doğru oda');

  // 3) mutasyon (sohbet) → anında push
  const before = sse.events.length;
  const MSG = 'merhaba-sse-' + Date.now();
  await post('/chat', { code, playerId, token: create.json.token, text: MSG });
  const pushed = await waitFor(
    () =>
      sse.events.length > before && sse.events.some((r) => r.messages?.some((m) => m.text === MSG)),
    2000,
  );
  ok(pushed, 'sohbet mesajı SSE ile ANINDA push edildi (polling yok)');

  // 4) ikinci oyuncu katılır → mevcut aboneye push
  const join = await post('/join', { code, name: 'Veli' });
  ok(join.status === 200, 'ikinci oyuncu katıldı');
  const pushed2 = await waitFor(() => sse.events.some((r) => r.playerCount === 2), 2000);
  ok(pushed2, 'yeni oyuncu SSE ile push edildi (canlı lobi)');

  // 5) herkes çıkar → oda silinir → "gone" olayı
  await post('/leave', { code, playerId: join.json.playerId, token: join.json.token });
  await post('/leave', { code, playerId, token: create.json.token });
  const gone = await waitFor(() => sse.state.gone, 3000);
  ok(gone, 'oda silinince "gone" olayı gönderildi');
} catch (e) {
  ok(false, 'beklenmedik hata: ' + (e?.message || e));
} finally {
  try {
    sse?.close();
  } catch {
    /* yoksay */
  }
  child.kill('SIGTERM');
  await sleep(300);
  child.kill('SIGKILL');
  try {
    rmSync(STATE);
  } catch {
    /* yoksay */
  }
}

console.log(failures ? `\n❌ ${failures} kontrol başarısız` : '\n✅ SSE canlı akış çalışıyor');
process.exit(failures ? 1 : 0);

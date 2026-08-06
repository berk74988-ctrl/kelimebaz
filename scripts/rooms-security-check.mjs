/**
 * ODA SUNUCUSU GÜVENLİK DOĞRULAMASI (rooms-server/server.js)
 *
 * Sunucuyu test yapılandırmasıyla başlatır ve sertleştirmeleri ölçer:
 *   1. IP başına hız sınırı → 429 (create/join)
 *   2. Oyuncu başına sohbet sınırı → 429
 *   3. CORS yalnızca izinli kökene izin veriyor
 *   4. Küfür filtresi ad + sohbette çalışıyor
 *   5. Aynı odada aynı ad numaralandırılıyor
 *   6. SIGTERM → yeniden başlatmada aktif odalar korunuyor
 *
 * Farklı IP'ler X-Forwarded-For ile simüle edilir (testler birbirini etkilemesin).
 * Kullanım: node scripts/rooms-security-check.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rmSync, writeFileSync } from 'node:fs';

const DIR = fileURLToPath(new URL('../rooms-server', import.meta.url));
const STATE = fileURLToPath(new URL('../rooms-server/.test-state.json', import.meta.url));
const PORT = 4299;
const BASE = `http://127.0.0.1:${PORT}`;

const ENV = {
  ...process.env,
  PORT: String(PORT),
  HOST: '127.0.0.1',
  STATE_FILE: STATE,
  RL_CREATE: '3',
  RL_JOIN: '3',
  RL_CHAT_IP: '100',
  RL_CHAT_PLAYER: '2',
  ALLOWED_ORIGINS: 'https://kelimebaz.aicirkit.com,http://localhost:4200',
};

let fail = 0;
const check = (name, ok, d = '') => {
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${name}${d ? '  — ' + d : ''}`);
};

function startServer() {
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env: ENV, stdio: 'ignore' });
  return child;
}
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE + '/health')).ok) return;
    } catch {
      /* daha up değil */
    }
    await sleep(100);
  }
  throw new Error('sunucu açılmadı');
}
async function post(path, body, ip = '1.2.3.4', headers = {}) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...headers },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data, acao: r.headers.get('access-control-allow-origin') };
}

rmSync(STATE, { force: true });
let child = startServer();
await waitUp();

// --- 1) /create hız sınırı (RL_CREATE=3) ---
const ipA = '9.9.9.9';
let created = 0;
let got429 = false;
for (let i = 0; i < 5; i++) {
  const r = await post('/create', { name: 'Test' }, ipA);
  if (r.status === 200) created++;
  else if (r.status === 429 && r.data.error === 'rate_limited') got429 = true;
}
check('/create IP hız sınırı: ilk 3 kabul', created === 3, `${created} oluşturuldu`);
check('/create sınır aşılınca 429 + rate_limited', got429);

// --- 2) CORS izin listesi ---
const allowed = await fetch(BASE + '/health', {
  headers: { Origin: 'https://kelimebaz.aicirkit.com' },
});
const disallowed = await fetch(BASE + '/health', { headers: { Origin: 'http://evil.example' } });
check(
  'CORS izinli kökeni yansıtıyor',
  allowed.headers.get('access-control-allow-origin') === 'https://kelimebaz.aicirkit.com',
  allowed.headers.get('access-control-allow-origin'),
);
check(
  'CORS izinsiz kökene İZİN VERMİYOR',
  disallowed.headers.get('access-control-allow-origin') !== 'http://evil.example',
  disallowed.headers.get('access-control-allow-origin'),
);

// --- 3) Küfür filtresi: ad ---
const badNameAll = await post('/create', { name: 'orospu' }, '2.0.0.1');
const meAll = badNameAll.data.room.players.find((p) => p.id === badNameAll.data.playerId);
check('küfür ad tamamen maskelenince "Oyuncu"ya düşer', meAll?.name === 'Oyuncu', meAll?.name);

const badNamePartial = await post('/create', { name: 'Kral siktir' }, '2.0.0.2');
const mePartial = badNamePartial.data.room.players.find(
  (p) => p.id === badNamePartial.data.playerId,
);
check('küfür ad kısmen maskelenir', /Kral \*+/.test(mePartial?.name || ''), mePartial?.name);

// --- 4) Küfür filtresi: sohbet ---
const rc = badNamePartial.data; // geçerli oda + creds
const chat = await post(
  '/chat',
  { code: rc.code, playerId: rc.playerId, token: rc.token, text: 'seni orospu çocuğu' },
  '2.0.0.2',
);
const lastMsg = chat.data.room?.messages?.slice(-1)[0];
check('sohbette küfür maskelenir', lastMsg && /\*{3,}/.test(lastMsg.text), lastMsg?.text);
check(
  'sohbette küfürsüz kısım korunur',
  lastMsg && lastMsg.text.startsWith('seni '),
  lastMsg?.text,
);

// --- 5) Oyuncu başına sohbet sınırı (RL_CHAT_PLAYER=2) ---
let chatOk = 0;
let chat429 = false;
for (let i = 0; i < 4; i++) {
  const r = await post(
    '/chat',
    { code: rc.code, playerId: rc.playerId, token: rc.token, text: 'merhaba ' + i },
    '2.0.0.2',
  );
  if (r.status === 200) chatOk++;
  else if (r.status === 429) chat429 = true;
}
check('oyuncu başına sohbet sınırı 429 veriyor', chat429, `${chatOk} kabul edildikten sonra`);

// --- 6) Aynı odada aynı ad numaralandırılır ---
const host = await post('/create', { name: 'Ayse' }, '3.0.0.1');
const code = host.data.code;
const joiner = await post('/join', { code, name: 'Ayse' }, '3.0.0.2');
const joinerName = joiner.data.room.players.find((p) => p.id === joiner.data.playerId)?.name;
check('aynı ad numaralandırıldı (Ayse (2))', joinerName === 'Ayse (2)', joinerName);

// --- 7) Kalıcılık: yeniden başlatmada aktif odalar korunuyor ---
// NOT: Windows'ta child.kill('SIGTERM') Node handler'ını ÇALIŞTIRMAZ (OS süreci
// sertçe sonlandırır) → orada yalnızca YÜKLEME yolu doğrulanır. Linux/CI ve
// üretimde (systemd gerçek SIGTERM) tam kaydet→yükle round-trip'i koşar.
if (process.platform === 'win32') {
  child.kill();
  await sleep(300);
  // saveState'in ürettiği biçimde (players = dizi) bir state dosyası yaz
  const fake = {
    code: 'TST1',
    ownerId: 'p1',
    status: 'lobby',
    settings: { maxPlayers: 6, timeLimit: 0 },
    seed: null,
    startedAt: null,
    players: [
      {
        id: 'p1',
        token: 't',
        name: 'Ayse',
        finished: false,
        solved: false,
        attempts: 0,
        score: 0,
        timeMs: 0,
        ready: true,
      },
    ],
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeFileSync(STATE, JSON.stringify([fake]));
  child = startServer();
  await waitUp();
  const r = await fetch(`${BASE}/state?code=TST1`);
  const room = (await r.json().catch(() => ({}))).room;
  check(
    'kalıcılık: state dosyasından oda geri yüklendi (Windows: load yolu)',
    r.status === 200 && room?.code === 'TST1',
    room ? `${room.playerCount} oyuncu` : 'oda yok',
  );
  check(
    'geri yüklenen odada oyuncu adı korundu',
    room?.players?.some((p) => p.name === 'Ayse'),
  );
} else {
  const exited = new Promise((r) => child.on('exit', r));
  child.kill('SIGTERM'); // gerçek SIGTERM → saveState çalışır
  await exited;
  await sleep(300);
  child = startServer();
  await waitUp();
  const r = await fetch(`${BASE}/state?code=${code}`);
  const room = (await r.json().catch(() => ({}))).room;
  check(
    'kalıcılık: SIGTERM sonrası oda yeniden başlatmada korundu',
    r.status === 200 && room?.code === code,
    room ? `${room.playerCount} oyuncu` : 'oda yok',
  );
  check(
    'geri yüklenen odada oyuncu adları korundu',
    room?.players?.some((p) => p.name === 'Ayse'),
  );
}

child.kill();
await sleep(300);
rmSync(STATE, { force: true });

console.log(
  '\n' + (fail ? `❌ ${fail} kontrol başarısız` : '✅ ODA SUNUCUSU GÜVENLİK KONTROLLERİ GEÇTİ'),
);
process.exit(fail ? 1 : 0);

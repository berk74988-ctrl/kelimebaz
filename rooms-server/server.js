'use strict';

/**
 * KELİMEBAZ — Çok oyunculu oda sunucusu (berk-rooms)
 *
 * Bağımlılıksız, saf Node HTTP. Oda durumu BELLEKTE tutulur (Map). Kalıcı
 * veritabanı yok — arkadaş yarışı için gerekli değil; süreç yeniden başlarsa
 * aktif odalar sıfırlanır (kabul edilebilir).
 *
 * nginx bunu /berk/rooms/ altında :4243'e proxy'ler; proxy_pass sondaki "/"
 * ile ön eki düşürür, yani bu sunucu /create, /join gibi yolları görür.
 *
 * TASARIM: Gerçek zamanlılık KISA ARALIKLI SORGULAMA (polling) ile sağlanır —
 * istemci ~1.5 sn'de bir GET /state çeker. WebSocket YOK: paylaşılan nginx'te
 * upgrade yapılandırması gerektirmez, dağıtımı çok daha sağlamdır. Bir kelime
 * yarışının lobisi için polling fazlasıyla yeterlidir.
 */

const http = require('http');

const PORT = process.env.PORT || 4243;
// Varsayılan 127.0.0.1: servis YALNIZCA yerelde dinler, internete kapalı.
// Dışarıya nginx /berk/rooms/ yolu üzerinden (aynı köken) açılır — böylece
// backend doğrudan internete maruz kalmaz. (İstenirse HOST=0.0.0.0 ile açılır.)
const HOST = process.env.HOST || '127.0.0.1';

// --- Oda deposu ---
/** @type {Map<string, Room>} */
const rooms = new Map();

const MAX_ATTEMPTS = 6;
const MAX_ROOMS = 500; // bellek koruması — herkese açık port, kötüye kullanıma karşı
const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // 3 saat hareketsizlikten sonra silinir
const MAX_MESSAGES = 200; // odada saklanan sohbet mesajı üst sınırı (bellek)
const CHAT_VIEW = 40; // istemciye gönderilen son mesaj sayısı
const MAX_MSG_LEN = 200; // tek mesaj karakter sınırı
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışan harfler (I,O,0,1) yok

function now() {
  return Date.now();
}

function makeId(len = 10) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  return s;
}

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  } while (rooms.has(code));
  return code;
}

function sanitizeName(raw) {
  const s = String(raw || '').trim().slice(0, 16);
  return s || 'Oyuncu';
}

/** Sohbet metni: kontrol karakterleri temizlenir, kırpılır, uzunluk sınırlanır. */
function sanitizeText(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // kontrol karakterleri -> bosluk
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MSG_LEN);
}

function clampInt(v, min, max, dflt) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

/** Oda sahibinin belirlediği ayarlar. */
function normalizeSettings(s) {
  s = s || {};
  return {
    maxPlayers: clampInt(s.maxPlayers, 2, 8, 6),
    // Süre sınırı SANİYE; 0 = serbest (sınırsız).
    timeLimit: [0, 60, 120, 180].includes(Number(s.timeLimit)) ? Number(s.timeLimit) : 0,
  };
}

/**
 * Sunucu-otoriter puan: istemci yalnızca ham sonucu bildirir (çözdü mü,
 * kaç tahminde, kaç ms), puanı sunucu hesaplar — kural tek yerde.
 */
function computeScore(solved, attempts, timeMs, timeLimit) {
  if (!solved) return 0;
  const tries = clampInt(attempts, 1, MAX_ATTEMPTS, MAX_ATTEMPTS);
  let score = 500 + (MAX_ATTEMPTS - tries) * 100; // az tahmin = çok puan (500..1000)
  if (timeLimit > 0) {
    const remainingSec = Math.max(0, (timeLimit * 1000 - Number(timeMs || 0)) / 1000);
    score += Math.min(300, Math.round(remainingSec * 5)); // hız bonusu, tavan 300
  }
  return score;
}

/** İstemciye gönderilecek oda görünümü (token'lar gizlenir). */
function roomView(room, viewerId) {
  const players = [...room.players.values()]
    .map((p) => ({
      id: p.id,
      name: p.name,
      isOwner: p.id === room.ownerId,
      finished: p.finished,
      solved: p.solved,
      attempts: p.attempts,
      score: p.score,
      timeMs: p.timeMs,
      ready: p.ready,
    }))
    // Sıralama: önce bitmişler; sonra PUAN (yüksek üstte); BERABERLİKTE en hızlı
    // (küçük timeMs) üstte; bekleyenler en altta.
    .sort(
      (a, b) =>
        Number(b.finished) - Number(a.finished) ||
        b.score - a.score ||
        a.timeMs - b.timeMs,
    );

  return {
    code: room.code,
    status: room.status, // 'lobby' | 'playing' | 'finished'
    settings: room.settings,
    ownerId: room.ownerId,
    seed: room.status === 'lobby' ? null : room.seed, // kelime ancak başlayınca
    startedAt: room.startedAt,
    players,
    you: viewerId
      ? { id: viewerId, isOwner: viewerId === room.ownerId, inRoom: room.players.has(viewerId) }
      : null,
    finishedCount: players.filter((p) => p.finished).length,
    playerCount: players.length,
    readyCount: players.filter((p) => p.ready).length,
    // Son N sohbet mesajı (oyun öncesi/sonrası iletişim)
    messages: room.messages.slice(-CHAT_VIEW),
  };
}

function touch(room) {
  room.updatedAt = now();
}

/** Herkes bitince odayı sonlandır. */
function maybeFinish(room) {
  if (room.status !== 'playing') return;
  const players = [...room.players.values()];
  if (players.length > 0 && players.every((p) => p.finished)) {
    room.status = 'finished';
  }
}

// --- Süresi dolan odaları temizle ---
setInterval(() => {
  const cutoff = now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.updatedAt < cutoff) rooms.delete(code);
  }
}, 5 * 60 * 1000).unref?.();

// --- HTTP yardımcıları ---

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 8192) {
        tooBig = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return resolve({});
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

/** Oda + yetki doğrulama. */
function auth(body) {
  const code = String(body.code || '').toUpperCase();
  const room = rooms.get(code);
  if (!room) return { error: 'not_found' };
  const player = room.players.get(String(body.playerId || ''));
  if (!player || player.token !== body.token) return { error: 'forbidden', room };
  return { room, player };
}

// --- Rota işleyicileri ---

const routes = {
  'POST /create': async (req, res) => {
    if (rooms.size >= MAX_ROOMS) return send(res, 503, { error: 'busy' });
    const body = await readJson(req);
    const code = makeCode();
    const playerId = makeId();
    const token = makeId(16);
    const settings = normalizeSettings(body.settings);

    const room = {
      code,
      ownerId: playerId,
      status: 'lobby',
      settings,
      seed: null,
      startedAt: null,
      players: new Map(),
      messages: [], // sohbet — {id, playerId, name, text, ts}
      createdAt: now(),
      updatedAt: now(),
    };
    room.players.set(playerId, {
      id: playerId,
      token,
      name: sanitizeName(body.name),
      finished: false,
      solved: false,
      attempts: 0,
      score: 0,
      timeMs: 0, // beraberlik bozma: aynı puanda hızlı olan üstte
      ready: true, // oda sahibi her zaman hazır
    });
    rooms.set(code, room);
    send(res, 200, { code, playerId, token, room: roomView(room, playerId) });
  },

  'POST /join': async (req, res) => {
    const body = await readJson(req);
    const code = String(body.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'not_found' });
    if (room.status !== 'lobby') return send(res, 409, { error: 'already_started' });
    if (room.players.size >= room.settings.maxPlayers)
      return send(res, 409, { error: 'full' });

    const playerId = makeId();
    const token = makeId(16);
    room.players.set(playerId, {
      id: playerId,
      token,
      name: sanitizeName(body.name),
      finished: false,
      solved: false,
      attempts: 0,
      score: 0,
      timeMs: 0,
      ready: false, // katılan oyuncu "hazır" işaretleyene kadar hazır değil
    });
    touch(room);
    send(res, 200, { code, playerId, token, room: roomView(room, playerId) });
  },

  'GET /state': async (req, res, url) => {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const viewerId = url.searchParams.get('playerId') || '';
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'not_found' });
    send(res, 200, { room: roomView(room, viewerId) });
  },

  'POST /settings': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    if (player.id !== room.ownerId) return send(res, 403, { error: 'not_owner' });
    if (room.status !== 'lobby') return send(res, 409, { error: 'already_started' });
    room.settings = normalizeSettings(body.settings);
    touch(room);
    send(res, 200, { room: roomView(room, player.id) });
  },

  'POST /start': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    if (player.id !== room.ownerId) return send(res, 403, { error: 'not_owner' });
    if (room.status !== 'lobby') return send(res, 409, { error: 'already_started' });
    if (room.players.size < 1) return send(res, 409, { error: 'empty' });

    room.status = 'playing';
    room.seed = (Math.random() * 1e9) | 0; // istemci: answers[seed % len]
    room.startedAt = now();
    for (const p of room.players.values()) {
      p.finished = false;
      p.solved = false;
      p.attempts = 0;
      p.score = 0;
      p.timeMs = 0;
    }
    touch(room);
    send(res, 200, { room: roomView(room, player.id) });
  },

  'POST /score': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    if (room.status !== 'playing') return send(res, 409, { error: 'not_playing' });
    if (player.finished) return send(res, 200, { room: roomView(room, player.id) }); // idempotent

    const solved = !!body.solved;
    const attempts = clampInt(body.attempts, 1, MAX_ATTEMPTS, MAX_ATTEMPTS);
    const timeMs = Math.max(0, Number(body.timeMs) || 0);
    player.solved = solved;
    player.attempts = attempts;
    player.timeMs = timeMs;
    player.finished = true;
    player.score = computeScore(solved, attempts, timeMs, room.settings.timeLimit);
    maybeFinish(room);
    touch(room);
    send(res, 200, { room: roomView(room, player.id) });
  },

  'POST /ready': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    if (room.status !== 'lobby') return send(res, 409, { error: 'already_started' });
    // Oda sahibi her zaman hazır kabul edilir; yalnızca katılanlar toggle eder.
    if (player.id !== room.ownerId) player.ready = !!body.ready;
    touch(room);
    send(res, 200, { room: roomView(room, player.id) });
  },

  'POST /chat': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    const text = sanitizeText(body.text);
    if (!text) return send(res, 200, { room: roomView(room, player.id) }); // boş → no-op
    room.messages.push({ id: makeId(8), playerId: player.id, name: player.name, text, ts: now() });
    if (room.messages.length > MAX_MESSAGES) {
      room.messages.splice(0, room.messages.length - MAX_MESSAGES);
    }
    touch(room);
    send(res, 200, { room: roomView(room, player.id) });
  },

  'POST /leave': async (req, res) => {
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    room.players.delete(player.id);

    if (room.players.size === 0) {
      rooms.delete(room.code); // boşalan oda kaybolur
    } else {
      // Sahip çıktıysa liderliği en eski oyuncuya devret
      if (player.id === room.ownerId) {
        room.ownerId = room.players.keys().next().value;
      }
      maybeFinish(room);
      touch(room);
    }
    send(res, 200, { ok: true });
  },
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;

  // Sağlık kontrolü
  if (url.pathname === '/' || url.pathname === '/health') {
    return send(res, 200, { ok: true, rooms: rooms.size, uptime: process.uptime() });
  }

  const handler = routes[key];
  if (!handler) return send(res, 404, { error: 'no_route' });
  try {
    await handler(req, res, url);
  } catch (e) {
    send(res, 500, { error: 'server_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`berk-rooms dinliyor: http://${HOST}:${PORT}`);
});

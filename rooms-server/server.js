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
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const hintUtil = require('./hint-util');
const badWords = require('./bad-words');

const PORT = process.env.PORT || 4243;

// --- ANONİM TELEMETRİ (isteğe bağlı, oyunu ASLA etkilemez) ---
// Başlatılamazsa telemetry=null → /events 503 döner, odalar/ipucu etkilenmez.
let telemetry = null;
try {
  telemetry = require('./telemetry').open({
    dir: process.env.TELEMETRY_DIR || path.join(__dirname, 'telemetry'),
    retentionDays: Number(process.env.TELEMETRY_RETENTION_DAYS || 90),
  });
  console.log(`[telemetri] arka uç=${telemetry.backend} · saklama=${telemetry.retentionDays} gün`);
} catch (e) {
  console.error('[telemetri] başlatılamadı (oyun etkilenmez):', e.message);
}
// Olay gönderimi için IP başına hız sınırı (toplu geldiği için geniş).
const rlEvents = rateLimiter(Number(process.env.RL_EVENTS || 60), 60_000);
const EVENTS_MAX_BATCH = 200; // tek istekte kabul edilen en çok olay

// --- YÖNETİM PANOSU kimlik doğrulaması (HTTP Basic) ---
// ADMIN_PASS TANIMSIZSA panel KAPALIDIR (503) → asla kimlik doğrulamasız açılmaz.
// (Bu, tam bir auth paketi gelene kadar tek-yönetici için yeterli, gerçek bir kapı.)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const ADMIN_ENABLED = !!ADMIN_PASS;
const rlAdmin = rateLimiter(Number(process.env.RL_ADMIN || 30), 60_000); // kaba-kuvvete karşı

function safeEq(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function basicAuthOk(req) {
  const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
  if (!m) return false;
  let dec = '';
  try {
    dec = Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return false;
  }
  const i = dec.indexOf(':');
  if (i < 0) return false;
  // İki karşılaştırma da her zaman yapılır (zamanlama sızıntısını azalt).
  const okUser = safeEq(dec.slice(0, i), ADMIN_USER);
  const okPass = safeEq(dec.slice(i + 1), ADMIN_PASS);
  return okUser && okPass;
}

/** Panel kapısı: kapalıysa 503, kimlik yoksa 401 (tarayıcı giriş penceresi). */
function adminGate(req, res) {
  if (!ADMIN_ENABLED) {
    send(res, 503, { error: 'admin_disabled' });
    return false;
  }
  if (!rlAdmin(clientIp(req))) {
    stats.rateLimited++;
    send(res, 429, { error: 'rate_limited' });
    return false;
  }
  if (!basicAuthOk(req)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Kelimebaz Yönetim", charset="UTF-8"',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ error: 'auth_required' }));
    return false;
  }
  return true;
}

/** ?range=today|7d|30d|all → [from, to) zaman aralığı. */
function rangeFromParam(r) {
  const to = now() + 1;
  const DAY = 86_400_000;
  if (r === 'today') return { from: to - (to % DAY), to };
  if (r === '7d') return { from: to - 7 * DAY, to };
  if (r === '30d') return { from: to - 30 * DAY, to };
  return { from: 0, to }; // all
}

// --- IP/oyuncu başına kayan pencere hız sınırı (bellekte) ---
// Herkese açık uç nokta: kötüye kullanımı sınırla. Aşınca 429 döner.
function rateLimiter(limit, windowMs) {
  const hits = new Map(); // anahtar -> zaman damgaları
  setInterval(() => {
    const t = Date.now();
    for (const [k, arr] of hits) {
      const keep = arr.filter((x) => t - x < windowMs);
      if (keep.length) hits.set(k, keep);
      else hits.delete(k);
    }
  }, Math.max(windowMs, 60_000)).unref?.();
  return function ok(key) {
    const t = Date.now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (arr.length >= limit) {
      hits.set(key, arr);
      return false;
    }
    arr.push(t);
    hits.set(key, arr);
    return true;
  };
}

// Eşikler (env ile ayarlanabilir). Normal oyun akışını engellemeyecek kadar
// geniş, kötüye kullanımı durduracak kadar dar.
const rlCreate = rateLimiter(Number(process.env.RL_CREATE || 10), 60_000); // dakikada oda
const rlJoin = rateLimiter(Number(process.env.RL_JOIN || 30), 60_000); // dakikada katılma
const rlChatIp = rateLimiter(Number(process.env.RL_CHAT_IP || 40), 60_000); // dakikada IP
const rlChatPlayer = rateLimiter(Number(process.env.RL_CHAT_PLAYER || 5), 10_000); // 10 sn / oyuncu

// --- İzin verilen CORS kökenleri (yayın kökeni + yerel geliştirme) ---
// '*' YERİNE beyaz liste: yalnızca oyunun yayınlandığı köken ve geliştirme
// sunucusu API'yi tarayıcıdan çağırabilir.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  'http://34.158.136.9,http://localhost:4200,http://127.0.0.1:4200'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function pickOrigin(req) {
  const origin = req.headers.origin;
  // İzinli köken → aynen yansıt. İzinsiz/kökensiz → varsayılan yayın kökeni
  // (izinsiz tarayıcı isteği Allow-Origin uyuşmazlığından ENGELLENİR).
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// --- Basit erişim/kötüye kullanım günlüğü ---
const stats = { requests: 0, errors: 0, rateLimited: 0, masked: 0, startedAt: Date.now() };
setInterval(() => {
  const errPct = stats.requests ? Math.round((stats.errors / stats.requests) * 100) : 0;
  console.log(
    `[stat] istek=${stats.requests} hata=${stats.errors} (%${errPct}) 429=${stats.rateLimited} ` +
      `filtre=${stats.masked} oda=${rooms.size}`,
  );
}, 5 * 60 * 1000).unref?.();

// --- YZ İPUCU (çalışma zamanı, maliyetli) yapılandırması ---
// API anahtarı YALNIZCA sunucuda env'de durur; istemciye asla gönderilmez.
// Anahtar yoksa özellik KAPALI: /health hint:false döner → istemci butonu gizler.
const HINT_KEY = process.env.ANTHROPIC_API_KEY || '';
const HINT_MODEL = process.env.HINT_MODEL || 'claude-opus-5';
const HINT_RL_PER_MIN = Number(process.env.HINT_RL_PER_MIN || 8); // IP başına dakikada
const HINT_ENABLED = !!HINT_KEY;

// IP başına dakikalık hız sınırı (yukarıdaki genel fabrikayla).
const rlHint = rateLimiter(HINT_RL_PER_MIN, 60_000);

/** Anthropic Messages API'yi çağır (bağımlılıksız fetch — Node 18+). */
async function callAnthropic(system, user) {
  const body = { model: HINT_MODEL, max_tokens: 400, system, messages: [{ role: 'user', content: user }] };
  // opus/sonnet/fable ailesinde düşünmeyi kapat → hızlı ve ucuz (tek cümlelik iş).
  // haiku bu parametreleri almaz; onda gönderme.
  if (!/haiku/.test(HINT_MODEL)) {
    body.thinking = { type: 'disabled' };
    body.output_config = { effort: 'low' };
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': HINT_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error('api_' + r.status);
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
}
// Varsayılan 127.0.0.1: servis YALNIZCA yerelde dinler, internete kapalı.
// Dışarıya nginx /berk/rooms/ yolu üzerinden (aynı köken) açılır — böylece
// backend doğrudan internete maruz kalmaz. (İstenirse HOST=0.0.0.0 ile açılır.)
const HOST = process.env.HOST || '127.0.0.1';

// --- Oda deposu ---
/** @type {Map<string, Room>} */
const rooms = new Map();

const MAX_ATTEMPTS = 6;
const MAX_ROOMS = 500; // bellek koruması — herkese açık port, kötüye kullanıma karşı
const WARN_ROOMS = Math.floor(MAX_ROOMS * 0.8); // bu eşiği geçince uyarı günlüğü
const ROOM_TTL_MS = 3 * 60 * 60 * 1000; // 3 saat hareketsizlikten sonra silinir
// Zarif kapanma: SIGTERM'de aktif odalar buraya yazılır, açılışta geri okunur.
const STATE_FILE = process.env.STATE_FILE || path.join(__dirname, 'rooms-state.json');
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
  const trimmed = String(raw || '').trim().slice(0, 16);
  const masked = badWords.mask(trimmed);
  if (masked !== trimmed) stats.masked++;
  // Boşsa ya da küfür yüzünden tamamı maskelendiyse varsayılana düş.
  if (!masked || /^[*\s]+$/.test(masked)) return 'Oyuncu';
  return masked;
}

/** Oda içinde aynı ad varsa numaralandır: "Berk", "Berk (2)", "Berk (3)"... */
function uniqueName(room, name) {
  const taken = new Set([...room.players.values()].map((p) => p.name));
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i++) {
    const candidate = `${name} (${i})`.slice(0, 20);
    if (!taken.has(candidate)) return candidate;
  }
  return name;
}

/** Sohbet metni: kontrol karakterleri temizlenir, kırpılır, küfür maskelenir. */
function sanitizeText(raw) {
  const clean = String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // kontrol karakterleri -> bosluk
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MSG_LEN);
  const masked = badWords.mask(clean);
  if (masked !== clean) stats.masked++;
  return masked;
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
    // '*' değil: yalnızca izinli köken (yayın + geliştirme). Ana işleyici her
    // istekte res.corsOrigin'i ayarlar.
    'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function readJson(req, maxBytes = 8192) {
  return new Promise((resolve) => {
    let raw = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
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

/** İstemci IP'si (nginx arkasında X-Forwarded-For; yerelde soket adresi). */
function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
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
    if (!rlCreate(clientIp(req))) {
      stats.rateLimited++;
      return send(res, 429, { error: 'rate_limited' });
    }
    if (rooms.size >= MAX_ROOMS) return send(res, 503, { error: 'busy' });
    if (rooms.size >= WARN_ROOMS) {
      console.warn(`[uyarı] oda sayısı yüksek: ${rooms.size}/${MAX_ROOMS} (sınıra yaklaşılıyor)`);
    }
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
    if (!rlJoin(clientIp(req))) {
      stats.rateLimited++;
      return send(res, 429, { error: 'rate_limited' });
    }
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
      name: uniqueName(room, sanitizeName(body.name)),
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
    if (!rlChatIp(clientIp(req))) {
      stats.rateLimited++;
      return send(res, 429, { error: 'rate_limited' });
    }
    const body = await readJson(req);
    const { error, room, player } = auth(body);
    if (error) return send(res, error === 'not_found' ? 404 : 403, { error });
    // Oyuncu başına: 10 sn'de en fazla N mesaj (spam koruması).
    if (!rlChatPlayer(player.id)) {
      stats.rateLimited++;
      return send(res, 429, { error: 'rate_limited' });
    }
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

  // --- YZ İPUCU (çalışma zamanı) ---
  // Girdi: { length, lang, guesses:[{word,pattern}], answer }. Cevap YALNIZCA
  // sunucuda sızıntı denetimi için kullanılır — modele GÖNDERİLMEZ.
  'POST /hint': async (req, res) => {
    if (!HINT_ENABLED) return send(res, 503, { error: 'disabled' });
    const ip = clientIp(req);
    if (!rlHint(ip)) return send(res, 429, { error: 'rate_limited' });

    const body = await readJson(req);
    const v = hintUtil.validateInput(body);
    if (v.error) return send(res, 400, { error: v.error });

    let text;
    try {
      const raw = await callAnthropic(
        hintUtil.systemPrompt(v.lang),
        hintUtil.userPrompt(v.length, v.guesses, v.lang),
      );
      text = hintUtil.sanitizeHint(raw);
    } catch {
      return send(res, 502, { error: 'ai_unavailable' });
    }

    // SIZINTI KORUMASI: dönen metin cevabı içeriyorsa modeli reddet, genel ipucu ver.
    if (!text || hintUtil.leaksAnswer(v.answer, text)) {
      text = hintUtil.genericHint(v.lang);
    }
    send(res, 200, { hint: text });
  },

  // --- ANONİM TELEMETRİ ---
  // Girdi: { events: [{type, mode, lang, wlen, word, result, attempts, duration_ms, code}, ...] }
  // Toplu, doğrulanır, temizlenir, yazılır. KİMLİK/IP YAZILMAZ. Depo yoksa 503.
  'POST /events': async (req, res) => {
    if (!telemetry) return send(res, 503, { error: 'disabled' });
    if (!rlEvents(clientIp(req))) {
      stats.rateLimited++;
      return send(res, 429, { error: 'rate_limited' });
    }
    const body = await readJson(req, 32_768); // toplu olaya izin ver (yine sınırlı)
    const list = Array.isArray(body.events) ? body.events : [];
    if (!list.length) return send(res, 200, { ok: true, written: 0 });
    const t = now();
    let written = 0;
    for (const raw of list.slice(0, EVENTS_MAX_BATCH)) {
      const ev = telemetry.normalize(raw, t);
      if (!ev) continue; // geçersiz → atla
      try {
        telemetry.insert(ev);
        written++;
      } catch {
        /* yazma hatası sessiz — telemetri oyunu/isteği bozmaz */
      }
    }
    send(res, 200, { ok: true, written });
  },

  // --- YÖNETİM PANOSU (kimlik doğrulamalı; ADMIN_PASS yoksa 503) ---
  'GET /admin': async (req, res) => {
    if (!adminGate(req, res)) return;
    let html;
    try {
      html = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
    } catch {
      return send(res, 500, { error: 'no_page' });
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  },

  // Özet metrikler (tarih aralığı parametreli). Yalnız kimlik doğrulanmışsa.
  'GET /admin/summary': async (req, res, url) => {
    if (!adminGate(req, res)) return;
    if (!telemetry) return send(res, 503, { error: 'no_telemetry' });
    const { from, to } = rangeFromParam(url.searchParams.get('range'));
    send(res, 200, telemetry.summary(from, to, now()));
  },
};

// --- Telemetri bakımı: açılışta + günde bir kez (eski kayıt temizliği + yedek) ---
if (telemetry) {
  const maintain = () => {
    const r = telemetry.runMaintenance(now());
    console.log(`[telemetri] bakım: ${telemetry.count()} kayıt · ${r.pruned} eski silindi`);
  };
  try {
    maintain();
  } catch {
    /* bakım hatası kritik değil */
  }
  setInterval(() => {
    try {
      maintain();
    } catch {
      /* yoksay */
    }
  }, 24 * 60 * 60 * 1000).unref?.();
}

// --- Kalıcılık: zarif kapanmada odaları diske yaz, açılışta geri oku ---

function serializeRooms() {
  const out = [];
  for (const room of rooms.values()) {
    out.push({ ...room, players: [...room.players.values()] });
  }
  return out;
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializeRooms()));
    console.log(`[kapanma] ${rooms.size} oda diske yazıldı → ${STATE_FILE}`);
  } catch (e) {
    console.error('[kapanma] durum yazılamadı:', e.message);
  }
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const arr = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const cutoff = now() - ROOM_TTL_MS;
    let n = 0;
    for (const r of Array.isArray(arr) ? arr : []) {
      if (!r || !r.code || !(r.updatedAt > cutoff)) continue; // süresi geçmişi atla
      r.players = new Map((r.players || []).map((p) => [p.id, p]));
      r.messages = Array.isArray(r.messages) ? r.messages : [];
      rooms.set(r.code, r);
      n++;
    }
    fs.unlinkSync(STATE_FILE); // tek seferlik: çökme sonrası bayat durum yüklenmesin
    if (n) console.log(`[açılış] ${n} oda diskten geri yüklendi`);
  } catch (e) {
    console.error('[açılış] durum okunamadı:', e.message);
  }
}

loadState(); // süreç başlarken varsa önceki oturumun odalarını geri yükle

const server = http.createServer(async (req, res) => {
  // Her istekte: izinli CORS kökenini belirle + erişim sayaçlarını güncelle.
  res.corsOrigin = pickOrigin(req);
  res.on('finish', () => {
    stats.requests++;
    if (res.statusCode >= 400) stats.errors++;
  });

  if (req.method === 'OPTIONS') return send(res, 204, {});

  const url = new URL(req.url, 'http://localhost');
  const key = `${req.method} ${url.pathname}`;

  // Sağlık kontrolü
  if (url.pathname === '/' || url.pathname === '/health') {
    // hint: YZ ipucu özelliği açık mı? (ANTHROPIC_API_KEY sunucuda tanımlı mı)
    return send(res, 200, {
      ok: true,
      rooms: rooms.size,
      uptime: process.uptime(),
      hint: HINT_ENABLED,
      telemetry: telemetry ? telemetry.backend : false,
      admin: ADMIN_ENABLED,
    });
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

// Zarif kapanma: SIGTERM (systemd restart/stop) veya SIGINT (Ctrl-C) gelince
// aktif odaları diske yaz, sonra çık → yeniden başlayınca odalar korunur.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  saveState();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref?.(); // bağlantı takılırsa da çık
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

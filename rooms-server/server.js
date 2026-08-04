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
const { Worker } = require('worker_threads'); // YZ ölçümü ayrı thread'de (ana döngü bloklanmaz)
const hintUtil = require('./hint-util');
const badWords = require('./bad-words');

const PORT = process.env.PORT || 4243;

// --- ANONİM TELEMETRİ (isteğe bağlı, oyunu ASLA etkilemez) ---
// Başlatılamazsa telemetry=null → /events 503 döner, odalar/ipucu etkilenmez.
const telemetryMod = require('./telemetry');
let telemetry = null;
try {
  telemetry = telemetryMod.open({
    dir: process.env.TELEMETRY_DIR || path.join(__dirname, 'telemetry'),
    retentionDays: Number(process.env.TELEMETRY_RETENTION_DAYS || 90),
  });
  console.log(`[telemetri] arka uç=${telemetry.backend} · saklama=${telemetry.retentionDays} gün`);
} catch (e) {
  console.error('[telemetri] başlatılamadı (oyun etkilenmez):', e.message);
}

// LLM zorluk puanları (word-difficulty-{lang}.json) — küratörlük karşılaştırması
// için. rooms-server'a kopyalanırsa yüklenir; yoksa karşılaştırma boş kalır.
let _difficulty = null;
function difficultyMaps() {
  if (_difficulty) return _difficulty;
  _difficulty = {};
  for (const lang of ['tr', 'en']) {
    try {
      const d = JSON.parse(
        fs.readFileSync(path.join(__dirname, `word-difficulty-${lang}.json`), 'utf8'),
      );
      _difficulty[lang] = d.scores || d;
    } catch {
      /* dosya yoksa o dil için karşılaştırma yapılmaz */
    }
  }
  return _difficulty;
}
// Olay gönderimi için IP başına hız sınırı (toplu geldiği için geniş).
const rlEvents = rateLimiter(Number(process.env.RL_EVENTS || 60), 60_000);
const EVENTS_MAX_BATCH = 200; // tek istekte kabul edilen en çok olay

// --- GÜNÜN KELİMESİ geçersiz kılma (override) deposu ---
// Kötü bir günlük kelime çıkarsa yeniden dağıtım yapmadan müdahale. Override YALNIZ
// gelecek günler için; istemci sunucu erişilemezse gömülü algoritmaya düşer.
const dailyMod = require('./daily');
let daily = null;
try {
  daily = dailyMod.open({ file: process.env.DAILY_OVERRIDES_FILE });
  console.log(
    `[günlük] override deposu hazır · önizleme havuzu: ${daily.hasPools ? 'var' : 'yok (words.json eksik)'}`,
  );
} catch (e) {
  console.error('[günlük] başlatılamadı:', e.message);
}

// --- DENGE AYARLARI (ekonomi/zorluk override) ---
// Kod içi değerler varsayılan; sunucu override sunarsa istemci onu kullanır
// (aralığa sıkıştırılmış). Erişilemezse istemci gömülü varsayılana düşer.
const balanceMod = require('./balance');
let balance = null;
try {
  balance = balanceMod.open({ file: process.env.BALANCE_FILE });
  console.log(`[denge] ayar deposu hazır · ${Object.keys(balance.overrides()).length} override`);
} catch (e) {
  console.error('[denge] başlatılamadı:', e.message);
}

// YZ AYAR DEPOSU — çalışma zamanı model + çağrı parametreleri (yeniden başlatmasız).
// Depo yalnız modeli/parametreleri yönetir; API anahtarı burada YOK.
const aiConfigMod = require('./ai-config');
let aiConfig = null;
try {
  aiConfig = aiConfigMod.open({ file: process.env.AI_CONFIG_FILE });
  console.log(`[yz] ayar deposu hazır · model=${aiConfig.current().model}`);
} catch (e) {
  console.error('[yz] başlatılamadı:', e.message);
}

// YZ DAVRANIŞ DEPOSU — rakip gücü + ipucu koçu ayarları (yeniden başlatmasız).
const aiBehaviorMod = require('./ai-behavior');
let aiBehavior = null;
try {
  aiBehavior = aiBehaviorMod.open({ file: process.env.AI_BEHAVIOR_FILE });
  console.log(`[yz-güç] davranış deposu hazır · ${Object.keys(aiBehavior.overrides()).length} override`); // prettier-ignore
} catch (e) {
  console.error('[yz-güç] başlatılamadı:', e.message);
}

// YZ KULLANIM SAYAÇLARI — hacim + maliyet (toplu, gizlilik-güvenli). Fiyat ai-config'ten.
const aiUsageMod = require('./ai-usage');
let aiUsage = null;
try {
  aiUsage = aiUsageMod.open({ file: process.env.AI_USAGE_FILE });
  console.log('[yz-maliyet] kullanım sayaçları hazır');
} catch (e) {
  console.error('[yz-maliyet] başlatılamadı:', e.message);
}

// İÇERİK ÜRETİMİ DEPOSU — LLM içerik paketi Faz B: taslaklar + günlük bütçe (diske kalıcı).
const contentGenMod = require('./content-gen');
let contentGen = null;
try {
  contentGen = contentGenMod.open({ file: process.env.CONTENT_GEN_FILE });
  console.log('[icerik] uretim deposu hazir');
} catch (e) {
  console.error('[icerik] baslatilamadi:', e.message);
}

/** Aylık bütçe aşıldı VE oto-kapat açık mı? (ipucu koçu güvenlik anahtarı) */
function budgetAutoOff() {
  return !!(aiUsage && aiUsage.budget().autoOff && aiUsage.budgetExceeded(aiConfigMod.priceOf));
}

// --- YZ ölçümü: tek eşzamanlı çalıştırma + maç sınırı + kısa önbellek ---
const MEASURE_MATCHES_DEF = Number(process.env.MEASURE_MATCHES || 120); // band başına varsayılan
const MEASURE_MATCHES_CAP = Number(process.env.MEASURE_MATCHES_CAP || 300); // üst sınır (CPU koruması)
const MEASURE_CACHE_MS = 5 * 60 * 1000;
const MEASURE_TIMEOUT_MS = 90_000;
let measureBusy = false; // eşzamanlı çalıştırmayı engelle
let measureCache = null; // { key, at, payload }

/** Ölçümü WORKER thread'de koştur (ana olay döngüsü bloklanmaz). */
function runMeasureWorker(wordsFile, length, configs, matches, seed) {
  return new Promise((resolve, reject) => {
    let done = false;
    const worker = new Worker(path.join(__dirname, 'ai-sim-worker.js'), {
      workerData: { wordsFile, length, configs, matches, seed },
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      worker.terminate();
      reject(new Error('timeout'));
    }, MEASURE_TIMEOUT_MS);
    worker.on('message', (msg) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      if (msg && msg.error) reject(new Error(msg.error));
      else resolve(msg);
    });
    worker.on('error', (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
    worker.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error('worker_exit_' + code));
    });
  });
}

// --- YÖNETİM PANOSU kimlik doğrulaması (tek kullanıcı, oturum tabanlı) ---
// Parola KARMASI env'de (düz metin yok). ADMIN_PASS_HASH yoksa panel KAPALI
// (503) → asla kimlik doğrulamasız açılmaz. HTTPS ŞART (aşağıda httpsOk).
const adminAuth = require('./admin-auth');
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH || '';
const ADMIN_ENABLED = adminAuth.isValidHash(ADMIN_PASS_HASH);
// Oturum imza anahtarı: env yoksa süreç başına rastgele (restart'ta oturumlar düşer).
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS || 8 * 60 * 60 * 1000); // 8 saat
const COOKIE = 'kbadmin';
// HTTP üzerinden parola gönderimi kabul edilemez → yerelde/açık izinle geçilir.
const ALLOW_INSECURE = process.env.ADMIN_ALLOW_INSECURE === '1';
// Giriş denemesi hız sınırı (kaba kuvvete karşı, IP başına dakikada).
const rlLogin = rateLimiter(Number(process.env.RL_LOGIN || 8), 60_000);
const rlAdmin = rateLimiter(Number(process.env.RL_ADMIN || 120), 60_000); // genel panel

if (ADMIN_ENABLED) {
  console.log('[yönetim] panel etkin (parola karması yüklü, HTTPS zorunlu)');
} else if (ADMIN_PASS_HASH) {
  console.warn('[yönetim] ADMIN_PASS_HASH geçersiz biçim → panel KAPALI');
}

/** İstek HTTPS mi? (nginx X-Forwarded-Proto). Yerel/izin → geçer. HTTP → panel yok. */
function httpsOk(req) {
  if (ALLOW_INSECURE) return true;
  const host = String(req.headers.host || '').split(':')[0];
  if (host === 'localhost' || host === '127.0.0.1') return true;
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}
function isSecureReq(req) {
  return String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Güvenlik başlıkları — panele özel (clickjacking, sniff, CSP, HSTS, no-index). */
function adminHeaders(req, extra) {
  return {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    // Kendi kaynağı + gömülü stil/script (bağımsız tek sayfa). Çerçeveleme yok.
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ...(isSecureReq(req)
      ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }
      : {}),
    ...extra,
  };
}

/** Yönetim işlemi denetim kaydı: ne zaman, kim (IP), ne, sonuç. */
const AUDIT_FILE = process.env.ADMIN_AUDIT_LOG || path.join(__dirname, 'admin-audit.log');
function audit(req, action, ok, extra) {
  const line =
    JSON.stringify({
      t: new Date().toISOString(),
      ip: clientIp(req),
      action,
      ok: !!ok,
      ...(extra ? { info: extra } : {}),
    }) + '\n';
  fs.appendFile(AUDIT_FILE, line, () => {}); // ateşle-unut; denetim oyunu etkilemez
}

/** Ön koşullar: panel açık mı + HTTPS mı? Değilse yanıtı yazar, false döner. */
function adminPrecheck(req, res) {
  if (!ADMIN_ENABLED) {
    res.writeHead(503, adminHeaders(req, { 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify({ error: 'admin_disabled' }));
    return false;
  }
  if (!httpsOk(req)) {
    // HTTP üzerinden parola/oturum kabul edilemez → panel yayına alınmaz.
    res.writeHead(400, adminHeaders(req, { 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify({ error: 'https_required' }));
    return false;
  }
  return true;
}

/** Geçerli oturum var mı? Yoksa 401 yazar, null döner. (ön koşullar geçilmiş olmalı) */
function requireSession(req, res, action) {
  if (!adminPrecheck(req, res)) return null;
  const payload = adminAuth.verifyToken(parseCookies(req)[COOKIE], SESSION_SECRET);
  if (!payload) {
    audit(req, action || 'access', false, 'no_session');
    res.writeHead(401, adminHeaders(req, { 'Content-Type': 'application/json; charset=utf-8' }));
    res.end(JSON.stringify({ error: 'auth_required' }));
    return null;
  }
  return payload;
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
  setInterval(
    () => {
      const t = Date.now();
      for (const [k, arr] of hits) {
        const keep = arr.filter((x) => t - x < windowMs);
        if (keep.length) hits.set(k, keep);
        else hits.delete(k);
      }
    },
    Math.max(windowMs, 60_000),
  ).unref?.();
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
  process.env.ALLOWED_ORIGINS || 'http://34.158.136.9,http://localhost:4200,http://127.0.0.1:4200'
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
setInterval(
  () => {
    const errPct = stats.requests ? Math.round((stats.errors / stats.requests) * 100) : 0;
    console.log(
      `[stat] istek=${stats.requests} hata=${stats.errors} (%${errPct}) 429=${stats.rateLimited} ` +
        `filtre=${stats.masked} oda=${rooms.size}`,
    );
  },
  5 * 60 * 1000,
).unref?.();

// --- YZ İPUCU (çalışma zamanı, maliyetli) yapılandırması ---
// API anahtarı YALNIZCA sunucuda env'de durur; istemciye asla gönderilmez.
// Anahtar yoksa özellik KAPALI: /health hint:false döner → istemci butonu gizler.
const HINT_KEY = process.env.ANTHROPIC_API_KEY || '';
// Geriye dönük yedek: depo yüklenemezse env HINT_MODEL, o da yoksa opus-5.
const HINT_MODEL_FALLBACK = process.env.HINT_MODEL || 'claude-opus-5';
const HINT_RL_PER_MIN = Number(process.env.HINT_RL_PER_MIN || 8); // IP başına dakikada
const HINT_ENABLED = !!HINT_KEY;

// IP başına dakikalık hız sınırı (yukarıdaki genel fabrikayla).
const rlHint = rateLimiter(HINT_RL_PER_MIN, 60_000);

/**
 * Anahtarın yalnız maskelenmiş önekini döndür (panele değer ASLA gitmez).
 * Örn. "sk-ant-api03-xxxx…" → "sk-ant…". Tanımlı değilse boş.
 */
function maskedKey() {
  if (!HINT_KEY) return '';
  return HINT_KEY.slice(0, 6) + '…';
}

/** Model ailesine göre çağrı gövdesi (depo yoksa yedek). system/messages çağıran ekler. */
function anthropicRequestBase() {
  if (aiConfig) return aiConfig.request();
  const model = HINT_MODEL_FALLBACK;
  const base = { model, max_tokens: 400 };
  if (!/haiku/.test(model)) {
    base.thinking = { type: 'disabled' };
    base.output_config = { effort: 'low' };
  }
  return base;
}

/**
 * Anthropic Messages API'yi çağır (bağımlılıksız fetch — Node 18+).
 * Dönüş: { text, latencyMs, inputTokens, outputTokens, model }.
 * Model/parametreler YZ ayar deposundan gelir (panelden yönetilir).
 */
async function callAnthropicRaw(system, user, timeoutMs = 12_000) {
  const body = { ...anthropicRequestBase(), system, messages: [{ role: 'user', content: user }] };
  const t0 = Date.now();
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': HINT_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const latencyMs = Date.now() - t0;
  if (!r.ok) throw new Error('api_' + r.status);
  const data = await r.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join(' ');
  const usage = data.usage || {};
  return {
    text,
    latencyMs,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    model: data.model || body.model,
  };
}

/** İnce sarmalayıcı: yalnız metin döndürür (/hint için). */
async function callAnthropic(system, user) {
  return (await callAnthropicRaw(system, user)).text;
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
  const trimmed = String(raw || '')
    .trim()
    .slice(0, 16);
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
  const filtered = masked !== clean; // OYUN-204 otomatik filtre devreye girdi mi?
  if (filtered) stats.masked++;
  // filtered → panelde işaretlenir (filtre kalitesi ölçülebilsin). ORİJİNAL metin
  // SAKLANMAZ (yalnız maskeli hali + bayrak) — mahremiyet.
  return { text: masked, filtered };
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
      (a, b) => Number(b.finished) - Number(a.finished) || b.score - a.score || a.timeMs - b.timeMs,
    );

  return {
    code: room.code,
    status: room.status, // 'lobby' | 'playing' | 'finished' | 'closed'
    // Oda yönetici tarafından kapatıldıysa oyunculara anlamlı mesaj (sessiz atma yok).
    closedReason: room.status === 'closed' ? room.closedReason || '' : undefined,
    chatLocked: !!room.chatLocked, // sohbet kilitliyse istemci girişi kapatır
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
    // Son N sohbet mesajı (oyun öncesi/sonrası iletişim). GEÇMİŞ ARŞİVLENMEZ —
    // yalnız CANLI odanın bellekteki son mesajları; oda kapanınca hepsi silinir.
    messages: room.messages.slice(-CHAT_VIEW),
  };
}

function touch(room) {
  room.updatedAt = now();
  // Monotonik revizyon — SSE push'u değişikliği ms'ten bağımsız algılasın (aynı
  // ms içinde iki mutasyon olsa bile rev artar → güncelleme kaçmaz).
  room.rev = (room.rev || 0) + 1;
}

/** Herkes bitince odayı sonlandır. */
function maybeFinish(room) {
  if (room.status !== 'playing') return;
  const players = [...room.players.values()];
  if (players.length > 0 && players.every((p) => p.finished)) {
    room.status = 'finished';
  }
}

// --- Süresi dolan / kapatılan odaları temizle ---
// Kapatılan odalar KISA bir süre (grace) tutulur ki polling yapan istemciler
// "kapatıldı" mesajını görsün; sonra silinir (sohbet geçmişi arşivlenmez).
const CLOSED_GRACE_MS = Number(process.env.CLOSED_GRACE_MS || 120_000);
setInterval(() => {
  const t = now();
  for (const [code, room] of rooms) {
    const expired = room.updatedAt < t - ROOM_TTL_MS;
    const closedDone = room.status === 'closed' && (room.closedAt || 0) < t - CLOSED_GRACE_MS;
    if (expired || closedDone) rooms.delete(code);
  }
}, 60 * 1000).unref?.();

// --- SSE (Server-Sent Events): canlı oda güncellemesi (istemci polling'i yerine push) ---
// İstemci GET /events ile TEK kalıcı bağlantı açar; oda her değiştiğinde (rev artınca)
// güncel görünüm push edilir. Böylece her istemcinin 1.5 sn'de bir /state çekmesi biter;
// sohbet ve canlı sıralama anında yansır. Değişiklik yoksa veri gönderilmez.
// nginx'in yanıtı tamponlamaması için X-Accel-Buffering: no; idle timeout'a düşmesin
// diye 25 sn'de bir keepalive yorumu. İstemci SSE kuramazsa polling'e düşer (bkz. istemci).
const SSE_PUSH_MS = Number(process.env.SSE_PUSH_MS || 600);
const sseClients = new Set();

function sseWriteState(c, room) {
  try {
    c.res.write(`data: ${JSON.stringify({ room: roomView(room, c.viewerId) })}\n\n`);
    return true;
  } catch {
    return false;
  }
}

// Tek paylaşımlı döngü (abone sayısından bağımsız): oda değiştiyse push, silindiyse kapat.
setInterval(() => {
  for (const c of sseClients) {
    const room = rooms.get(c.code);
    if (!room) {
      try {
        c.res.write('event: gone\ndata: {}\n\n');
        c.res.end();
      } catch {
        /* zaten kapalı */
      }
      sseClients.delete(c);
      continue;
    }
    if (room.rev !== c.lastRev) {
      c.lastRev = room.rev;
      if (!sseWriteState(c, room)) sseClients.delete(c);
    }
  }
}, SSE_PUSH_MS).unref?.();

// Keepalive: idle bağlantıyı proxy 60 sn'de kapatmasın (veri değil, ': ' yorumu).
setInterval(() => {
  for (const c of sseClients) {
    try {
      c.res.write(': ka\n\n');
    } catch {
      sseClients.delete(c);
    }
  }
}, 25000).unref?.();

// --- HTTP yardımcıları ---

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // '*' değil: yalnızca izinli köken (yayın + geliştirme). Ana işleyici her
    // istekte res.corsOrigin'i ayarlar.
    'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
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
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
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
    if (room.players.size >= room.settings.maxPlayers) return send(res, 409, { error: 'full' });

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

  // SSE canlı akış — oda değiştikçe güncel görünümü push eder (polling yerine).
  // writeHead sonrası ASLA throw etme (send(500) başlık gönderilmişken çöker).
  'GET /events': async (req, res, url) => {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const viewerId = url.searchParams.get('playerId') || '';
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'not_found' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx: bu yanıtı tamponlama → SSE anında aksın
      'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
      Vary: 'Origin',
    });
    res.write('retry: 3000\n\n'); // istemci EventSource yeniden bağlanma aralığı (ms)
    const client = { res, code, viewerId, lastRev: room.rev };
    sseClients.add(client);
    if (!sseWriteState(client, room)) sseClients.delete(client); // ilk durumu hemen gönder
    req.on('close', () => sseClients.delete(client));
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
    // Yönetici sohbeti kilitlediyse mesaj kabul edilmez.
    if (room.chatLocked) return send(res, 403, { error: 'chat_locked' });
    const { text, filtered } = sanitizeText(body.text);
    if (!text) return send(res, 200, { room: roomView(room, player.id) }); // boş → no-op
    const msg = { id: makeId(8), playerId: player.id, name: player.name, text, ts: now() };
    if (filtered) msg.filtered = true; // OYUN-204 filtre işareti (panelde görünür)
    room.messages.push(msg);
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
    // Bütçe güvenlik anahtarı: aylık eşik aşıldı + oto-kapat açıksa ipucu kapalı.
    if (budgetAutoOff()) return send(res, 503, { error: 'budget' });
    const ip = clientIp(req);
    if (!rlHint(ip)) {
      if (aiUsage) aiUsage.recordRateLimited({ kind: 'hint' }); // sınıra takılanı say
      return send(res, 429, { error: 'rate_limited' });
    }

    const body = await readJson(req);
    const v = hintUtil.validateInput(body);
    if (v.error) return send(res, 400, { error: v.error });

    let text;
    try {
      const out = await callAnthropicRaw(
        hintUtil.systemPrompt(v.lang),
        hintUtil.userPrompt(v.length, v.guesses, v.lang),
      );
      if (aiUsage)
        aiUsage.record({
          kind: 'hint',
          model: out.model,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs: out.latencyMs,
        });
      text = hintUtil.sanitizeHint(out.text);
    } catch {
      if (aiUsage)
        aiUsage.record({ kind: 'hint', model: anthropicRequestBase().model, error: true });
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

  // --- YÖNETİM PANOSU (oturum tabanlı; ADMIN_PASS_HASH yoksa 503, HTTPS şart) ---
  // Oturum varsa pano, yoksa GİRİŞ sayfası. (İkisi de kimlik doğrulama arkasında:
  // veri yalnız /summary,/words'te ve onlar oturum ister.)
  'GET /admin': async (req, res) => {
    if (!adminPrecheck(req, res)) return;
    const authed = !!adminAuth.verifyToken(parseCookies(req)[COOKIE], SESSION_SECRET);
    const file = authed ? 'admin.html' : 'login.html';
    let html;
    try {
      html = fs.readFileSync(path.join(__dirname, file), 'utf8');
    } catch {
      res.writeHead(500, adminHeaders(req, { 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ error: 'no_page' }));
    }
    res.writeHead(200, adminHeaders(req, { 'Content-Type': 'text/html; charset=utf-8' }));
    res.end(html);
  },

  // Giriş: parola karmayla doğrulanır → imzalı oturum çerezi. Hız sınırlı.
  'POST /admin/login': async (req, res) => {
    if (!adminPrecheck(req, res)) return;
    if (!rlLogin(clientIp(req))) {
      stats.rateLimited++;
      audit(req, 'login', false, 'rate_limited');
      res.writeHead(429, adminHeaders(req, { 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ error: 'rate_limited' }));
    }
    const body = await readJson(req);
    const okPw = adminAuth.verifyPassword(body.password || '', ADMIN_PASS_HASH);
    if (!okPw) {
      audit(req, 'login', false, 'bad_password');
      res.writeHead(401, adminHeaders(req, { 'Content-Type': 'application/json' }));
      return res.end(JSON.stringify({ error: 'bad_credentials' }));
    }
    const token = adminAuth.signToken(
      { sub: 'admin', exp: Date.now() + SESSION_TTL_MS },
      SESSION_SECRET,
    );
    const attrs = [
      `${COOKIE}=${token}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ];
    if (isSecureReq(req)) attrs.push('Secure'); // HTTPS'te Secure (HTTP yerel dev'de takılmasın)
    audit(req, 'login', true);
    res.writeHead(
      200,
      adminHeaders(req, { 'Content-Type': 'application/json', 'Set-Cookie': attrs.join('; ') }),
    );
    res.end(JSON.stringify({ ok: true }));
  },

  // Çıkış: çerezi sıfırla.
  'POST /admin/logout': async (req, res) => {
    audit(req, 'logout', true);
    res.writeHead(
      200,
      adminHeaders(req, {
        'Content-Type': 'application/json',
        'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      }),
    );
    res.end(JSON.stringify({ ok: true }));
  },

  // Özet metrikler (tarih aralığı parametreli). Yalnız geçerli oturumla.
  'GET /admin/summary': async (req, res, url) => {
    if (!requireSession(req, res, 'summary')) return;
    if (!telemetry) return send(res, 503, { error: 'no_telemetry' });
    const { from, to } = rangeFromParam(url.searchParams.get('range'));
    audit(req, 'summary', true, url.searchParams.get('range') || 'all');
    send(res, 200, telemetry.summary(from, to, now()));
  },

  // Kelime bazlı istatistik + havuz önerileri. Filtre: lang, len, min (örneklem).
  // format=csv → CSV indir. LLM zorluk puanıyla karşılaştırmalı.
  'GET /admin/words': async (req, res, url) => {
    if (!requireSession(req, res, 'words')) return;
    if (!telemetry) return send(res, 503, { error: 'no_telemetry' });
    const { from, to } = rangeFromParam(url.searchParams.get('range'));
    // min yoksa/boşsa varsayılan 30 (Number(null)=0 tuzağına düşme).
    const minRaw = url.searchParams.get('min');
    const minSample = minRaw == null || minRaw === '' ? 30 : clampInt(minRaw, 1, 100000, 30);
    const lang = url.searchParams.get('lang');
    const len = Number(url.searchParams.get('len')) || 0;

    let { rows } = telemetry.wordStats(from, to, difficultyMaps(), minSample);
    if (lang === 'tr' || lang === 'en') rows = rows.filter((r) => r.lang === lang);
    if (len >= 4 && len <= 7) rows = rows.filter((r) => r.wlen === len);
    const recommendations = telemetryMod.wordRecommendations(rows, minSample);

    if (url.searchParams.get('format') === 'csv') {
      audit(req, 'export_csv', true, `n=${rows.length}`);
      res.writeHead(
        200,
        adminHeaders(req, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="kelime-istatistik.csv"',
        }),
      );
      return res.end(telemetryMod.wordsToCsv(rows));
    }
    audit(req, 'words', true, `n=${rows.length}`);
    send(res, 200, { minSample, count: rows.length, rows, recommendations });
  },

  // --- ODA DENETİMİ (moderasyon) ---
  // MAHREMİYET: yalnız CANLI odalar/sohbet görülür; geçmiş arşivlenmez. Kalıcı
  // oyuncu kimliği yok → "banla" yok; en fazla odayı kapatmak/oturumu bitirmek.

  // Canlı oda listesi + sunucu sağlığı.
  'GET /admin/rooms': async (req, res) => {
    if (!requireSession(req, res, 'rooms')) return;
    const t = now();
    const list = [...rooms.values()].map((room) => ({
      code: room.code,
      status: room.status,
      playerCount: room.players.size,
      chatLocked: !!room.chatLocked,
      ageMs: t - (room.createdAt || t),
      idleMs: t - (room.updatedAt || t),
      messageCount: room.messages.length,
      flaggedCount: room.messages.filter((m) => m.filtered).length,
    }));
    list.sort((a, b) => a.ageMs - b.ageMs); // en yeni üstte
    audit(req, 'rooms', true, `${rooms.size} oda`);
    const mem = process.memoryUsage();
    const health = {
      rooms: rooms.size,
      maxRooms: MAX_ROOMS,
      fillPct: Math.round((rooms.size / MAX_ROOMS) * 100),
      memory: {
        rssMB: Math.round(mem.rss / 1048576),
        heapUsedMB: Math.round(mem.heapUsed / 1048576),
      },
      uptimeSec: Math.round(process.uptime()),
    };
    send(res, 200, { health, rooms: list });
  },

  // Oda detayı: oyuncular + CANLI sohbet (filtre işaretli). Yalnız aktif oda.
  'GET /admin/rooms/detail': async (req, res, url) => {
    if (!requireSession(req, res, 'room_detail')) return;
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'not_found' });
    audit(req, 'room_detail', true, code); // sohbet görüntüleme (mahremiyet-hassas) kayda geçer
    send(res, 200, {
      code: room.code,
      status: room.status,
      chatLocked: !!room.chatLocked,
      closedReason: room.closedReason || null,
      settings: room.settings,
      ageMs: now() - (room.createdAt || now()),
      players: [...room.players.values()].map((p) => ({
        name: p.name,
        isOwner: p.id === room.ownerId,
        finished: p.finished,
        solved: p.solved,
        attempts: p.attempts,
      })),
      messages: room.messages.map((m) => ({
        id: m.id,
        name: m.name,
        text: m.text,
        ts: m.ts,
        filtered: !!m.filtered,
      })),
      flaggedCount: room.messages.filter((m) => m.filtered).length,
    });
  },

  // Odayı kapat: oyunculara anlamlı mesaj (sessiz atma YOK). Kısa süre sonra silinir.
  'POST /admin/rooms/close': async (req, res) => {
    if (!requireSession(req, res, 'room_close')) return;
    const body = await readJson(req);
    const code = String(body.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(res, 404, { error: 'not_found' });
    const reason = sanitizeText(body.reason).text || 'Bu oda yönetici tarafından kapatıldı.';
    room.status = 'closed';
    room.closedReason = reason;
    room.closedAt = now();
    audit(req, 'room_close', true, `${code} · ${room.players.size} oyuncu · ${reason}`);
    send(res, 200, { ok: true });
  },

  // Sohbeti kilitle/aç.
  'POST /admin/rooms/lock': async (req, res) => {
    if (!requireSession(req, res, 'room_lock')) return;
    const body = await readJson(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room) return send(res, 404, { error: 'not_found' });
    room.chatLocked = !!body.locked;
    audit(req, 'room_lock', true, `${room.code} · ${room.chatLocked ? 'kilitli' : 'açık'}`);
    send(res, 200, { ok: true, chatLocked: room.chatLocked });
  },

  // Tek mesaj sil (canlı odadan).
  'POST /admin/rooms/message-delete': async (req, res) => {
    if (!requireSession(req, res, 'room_msg_delete')) return;
    const body = await readJson(req);
    const room = rooms.get(String(body.code || '').toUpperCase());
    if (!room) return send(res, 404, { error: 'not_found' });
    const id = String(body.id || '');
    const before = room.messages.length;
    room.messages = room.messages.filter((m) => m.id !== id);
    const removed = before - room.messages.length;
    audit(req, 'room_msg_delete', removed > 0, `${room.code} · ${id}`);
    send(res, 200, { ok: true, removed });
  },

  // --- GÜNÜN KELİMESİ override ---
  // PUBLIC: istemci bugünün (±1 gün) override'ını çeker. Auth YOK (spoiler yok:
  // yalnız bugün penceresi). Kısa önbellek → her oyunda istek atılmaz.
  'GET /daily-overrides': async (req, res) => {
    if (!daily) return send(res, 200, { overrides: {} });
    const today = daily.dayIndexFor(new Date());
    const map = daily.windowMap(today - 1, today + 1);
    const body = JSON.stringify({ overrides: map });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
      Vary: 'Origin',
      'Cache-Control': 'public, max-age=1800',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  },

  // ADMIN: takvim (geçmiş perf + gelecek önizleme + override).
  'GET /admin/daily': async (req, res, url) => {
    if (!requireSession(req, res, 'daily')) return;
    if (!daily) return send(res, 503, { error: 'no_daily' });
    const today = daily.dayIndexFor(new Date());
    const past = clampInt(url.searchParams.get('past'), 0, 60, 14);
    const future = clampInt(url.searchParams.get('future'), 1, 90, 30);
    // Geçmiş günlük kelimelerin kazanma oranı (telemetriden — zorluk raporuyla bağ).
    const winMap = {};
    if (telemetry) {
      try {
        const { rows } = telemetry.wordStats(0, now() + 1, difficultyMaps(), 1);
        for (const r of rows)
          winMap[`${r.lang}:${r.word}`] = { winRate: r.winRate, sample: r.sample };
      } catch {
        /* telemetri yoksa performans boş kalır */
      }
    }
    const days = [];
    for (let d = today - past; d <= today + future; d++) {
      const entry = {
        dayIndex: d,
        date: daily.dateOf(d),
        started: d <= today,
        isToday: d === today,
      };
      for (const lang of ['tr', 'en']) {
        const override = daily.getOverride(d, lang);
        const algo = daily.algoWord(d, lang);
        const word = override || algo;
        const perf = d < today && word ? winMap[`${lang}:${word}`] : null;
        entry[lang] = { algo, override, word, ...(perf || {}) };
      }
      days.push(entry);
    }
    audit(req, 'daily', true, `bugün ${today}`);
    send(res, 200, { today, days });
  },

  // ADMIN: bir güne kelime ata (GELECEK gün + havuzda olmalı). Bugün/geçmiş engelli.
  'POST /admin/daily/override': async (req, res) => {
    if (!requireSession(req, res, 'daily_override')) return;
    if (!daily) return send(res, 503, { error: 'no_daily' });
    const body = await readJson(req);
    const dayIndex = clampInt(body.dayIndex, 0, 1e9, -1);
    const lang = body.lang === 'en' ? 'en' : body.lang === 'tr' ? 'tr' : null;
    const word = String(body.word || '').trim();
    if (dayIndex < 0 || !lang || !word) return send(res, 400, { error: 'bad_input' });
    // Gün başladıktan sonra değişiklik YOK (sabah/akşam farklı kelime olmasın).
    if (dayIndex <= daily.dayIndexFor(new Date())) return send(res, 409, { error: 'day_started' });
    if (!daily.inPool(word, lang)) return send(res, 422, { error: 'not_in_pool' }); // sözlük doğrulaması
    daily.setOverride(dayIndex, lang, word);
    audit(req, 'daily_override', true, `${daily.dateOf(dayIndex)} ${lang}=${word}`);
    send(res, 200, { ok: true, word: daily.getOverride(dayIndex, lang) });
  },

  // ADMIN: override kaldır (GELECEK gün). Bugün/geçmiş engelli.
  'POST /admin/daily/clear': async (req, res) => {
    if (!requireSession(req, res, 'daily_clear')) return;
    if (!daily) return send(res, 503, { error: 'no_daily' });
    const body = await readJson(req);
    const dayIndex = clampInt(body.dayIndex, 0, 1e9, -1);
    const lang = body.lang === 'en' ? 'en' : 'tr';
    if (dayIndex <= daily.dayIndexFor(new Date())) return send(res, 409, { error: 'day_started' });
    daily.clearOverride(dayIndex, lang);
    audit(req, 'daily_clear', true, `${daily.dateOf(dayIndex)} ${lang}`);
    send(res, 200, { ok: true });
  },

  // --- DENGE AYARLARI ---
  // PUBLIC: istemci override'ları çeker (auth yok; kısa önbellek). Değer aralığı
  // istemcide ayrıca sıkıştırılır → bu uç bozuk veri döndürse bile oyun güvende.
  'GET /balance': async (req, res) => {
    if (!balance) return send(res, 200, { overrides: {} });
    const body = JSON.stringify({ overrides: balance.overrides() });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
      Vary: 'Origin',
      'Cache-Control': 'public, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  },

  // ADMIN: şema (mevcut · varsayılan · aralık) + değişiklik geçmişi.
  'GET /admin/balance': async (req, res) => {
    if (!requireSession(req, res, 'balance')) return;
    if (!balance) return send(res, 503, { error: 'no_balance' });
    send(res, 200, { params: balance.schema(), history: balance.history() });
  },

  // ADMIN: değer ata — ARALIK DIŞI 400 (hem burada hem istemcide denetlenir).
  'POST /admin/balance/set': async (req, res) => {
    if (!requireSession(req, res, 'balance_set')) return;
    if (!balance) return send(res, 503, { error: 'no_balance' });
    const body = await readJson(req);
    const r = balance.set(String(body.key || ''), Number(body.value), new Date().toISOString());
    if (r.error) {
      audit(req, 'balance_set', false, `${body.key}=${body.value} · ${r.error}`);
      return send(res, 400, { error: r.error });
    }
    audit(req, 'balance_set', true, `${body.key}=${r.value}`);
    send(res, 200, { ok: true, value: r.value });
  },

  // ADMIN: geri al — tek anahtar ({key}) ya da hepsi ({all:true}).
  'POST /admin/balance/reset': async (req, res) => {
    if (!requireSession(req, res, 'balance_reset')) return;
    if (!balance) return send(res, 503, { error: 'no_balance' });
    const body = await readJson(req);
    const at = new Date().toISOString();
    if (body.all) {
      balance.resetAll(at);
      audit(req, 'balance_reset', true, 'hepsi');
    } else {
      const r = balance.reset(String(body.key || ''), at);
      if (r.error) return send(res, 400, { error: r.error });
      audit(req, 'balance_reset', true, String(body.key));
    }
    send(res, 200, { ok: true });
  },

  // --- YZ AYARLARI ---
  // ADMIN: model kataloğu (fiyat/yetenek) + mevcut config + geçmiş + anahtar durumu.
  // GÜVENLİK: API anahtarı DEĞERİ asla dönmez — yalnız tanımlı mı + maskelenmiş önek.
  'GET /admin/ai': async (req, res) => {
    if (!requireSession(req, res, 'ai')) return;
    if (!aiConfig) return send(res, 503, { error: 'no_ai' });
    send(res, 200, {
      schema: aiConfig.schema(),
      history: aiConfig.history(),
      keyDefined: HINT_ENABLED,
      keyPrefix: maskedKey(),
    });
  },

  // ADMIN: config ata — GEÇERSİZ kombinasyon 400 (model ailesi kuralları).
  'POST /admin/ai/set': async (req, res) => {
    if (!requireSession(req, res, 'ai_set')) return;
    if (!aiConfig) return send(res, 503, { error: 'no_ai' });
    const body = await readJson(req);
    const r = aiConfig.set(
      {
        model: body.model,
        thinking: body.thinking,
        effort: body.effort,
        maxTokens: Number(body.maxTokens),
      },
      new Date().toISOString(),
    );
    if (r.error) {
      audit(req, 'ai_set', false, `${body.model} · ${r.error}`);
      return send(res, 400, { error: r.error });
    }
    audit(req, 'ai_set', true, `${r.config.model}/${r.config.thinking}/${r.config.effort}`);
    send(res, 200, { ok: true, config: r.config });
  },

  // ADMIN: gömülü varsayılana döndür (tek tık geri al).
  'POST /admin/ai/reset': async (req, res) => {
    if (!requireSession(req, res, 'ai_reset')) return;
    if (!aiConfig) return send(res, 503, { error: 'no_ai' });
    aiConfig.reset(new Date().toISOString());
    audit(req, 'ai_reset', true, 'varsayılana');
    send(res, 200, { ok: true });
  },

  // ADMIN: CANLI TEST — mevcut ayarla örnek bir ipucu üret, gecikme+token+metin döndür.
  // Anahtar yoksa 503; API hatasında {error} (oyun etkilenmez, bu yalnız tanılama).
  'POST /admin/ai/test': async (req, res) => {
    if (!requireSession(req, res, 'ai_test')) return;
    if (!aiConfig) return send(res, 503, { error: 'no_ai' });
    if (!HINT_ENABLED) return send(res, 503, { error: 'no_key' });
    // Sabit örnek girdi (cevap modele gitmez — yalnız tahminler + desenler).
    const lang = req && req.headers && /en/.test(String(req.headers['x-test-lang'] || '')) ? 'en' : 'tr';
    const guesses = [
      { word: 'ARABA', pattern: '10000' },
      { word: 'SELİM', pattern: '01020' },
    ];
    try {
      const out = await callAnthropicRaw(
        hintUtil.systemPrompt(lang),
        hintUtil.userPrompt(5, guesses, lang),
        25_000, // test: daha uzun bekle (yüksek effort seçilmiş olabilir)
      );
      const text = hintUtil.sanitizeHint(out.text) || hintUtil.genericHint(lang);
      if (aiUsage)
        aiUsage.record({
          kind: 'test',
          model: out.model,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs: out.latencyMs,
        });
      audit(req, 'ai_test', true, `${out.model} · ${out.latencyMs}ms`);
      send(res, 200, {
        ok: true,
        model: out.model,
        latencyMs: out.latencyMs,
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        text,
      });
    } catch (e) {
      audit(req, 'ai_test', false, String(e && e.message));
      send(res, 502, { error: 'ai_unavailable', detail: String(e && e.message).slice(0, 40) });
    }
  },

  // --- YZ DAVRANIŞ AYARLARI (rakip gücü + ipucu koçu) ---
  // PUBLIC: istemci override'ları çeker (auth yok). İstemci değerleri ayrıca
  // aralığa sıkıştırır → bu uç bozuk dönse bile oyun gömülü varsayılanla güvende.
  'GET /ai-behavior': async (req, res) => {
    if (!aiBehavior) return send(res, 200, { overrides: {} });
    const body = JSON.stringify({ overrides: aiBehavior.overrides() });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': res.corsOrigin || ALLOWED_ORIGINS[0],
      Vary: 'Origin',
      'Cache-Control': 'public, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  },

  // ADMIN: şema + geçmiş + son ölçüm + hedef bandı + ölçüm sınırları.
  'GET /admin/ai-behavior': async (req, res) => {
    if (!requireSession(req, res, 'ai_behavior')) return;
    if (!aiBehavior) return send(res, 503, { error: 'no_ai_behavior' });
    send(res, 200, {
      params: aiBehavior.schema(),
      history: aiBehavior.history(),
      lastMeasure: aiBehavior.lastMeasure(),
      target: aiBehavior.diffTarget,
      tol: aiBehavior.targetTol,
      matchesDefault: MEASURE_MATCHES_DEF,
      matchesCap: MEASURE_MATCHES_CAP,
    });
  },

  // ADMIN: değer ata — ARALIK DIŞI 400.
  'POST /admin/ai-behavior/set': async (req, res) => {
    if (!requireSession(req, res, 'ai_behavior_set')) return;
    if (!aiBehavior) return send(res, 503, { error: 'no_ai_behavior' });
    const body = await readJson(req);
    const r = aiBehavior.set(String(body.key || ''), Number(body.value), new Date().toISOString());
    if (r.error) {
      audit(req, 'ai_behavior_set', false, `${body.key}=${body.value} · ${r.error}`);
      return send(res, 400, { error: r.error });
    }
    audit(req, 'ai_behavior_set', true, `${body.key}=${r.value}`);
    send(res, 200, { ok: true, value: r.value });
  },

  // ADMIN: geri al — tek anahtar ({key}) ya da hepsi ({all:true}).
  'POST /admin/ai-behavior/reset': async (req, res) => {
    if (!requireSession(req, res, 'ai_behavior_reset')) return;
    if (!aiBehavior) return send(res, 503, { error: 'no_ai_behavior' });
    const body = await readJson(req);
    const at = new Date().toISOString();
    if (body.all) {
      aiBehavior.resetAll(at);
      audit(req, 'ai_behavior_reset', true, 'hepsi');
    } else {
      const r = aiBehavior.reset(String(body.key || ''), at);
      if (r.error) return send(res, 400, { error: r.error });
      audit(req, 'ai_behavior_reset', true, String(body.key));
    }
    send(res, 200, { ok: true });
  },

  // ADMIN: ÖLÇÜM ÇALIŞTIR — seçili ayarla N maç simüle et (WORKER thread'de,
  // ana döngü bloklanmaz). Eşzamanlı tek çalıştırma (409 busy), maç sınırı,
  // 5 dk önbellek. Sonuç: zorluk+persona ortalama tahmin + çözememe oranı.
  'POST /admin/ai-behavior/measure': async (req, res) => {
    if (!requireSession(req, res, 'ai_measure')) return;
    if (!aiBehavior) return send(res, 503, { error: 'no_ai_behavior' });
    const body = await readJson(req);
    const length = 5; // 5 harfli TR/EN havuz — kalibrasyonun temeli
    const lang = body.lang === 'en' ? 'en' : 'tr';
    const wordsFile = path.join(__dirname, lang === 'en' ? 'words-en.json' : 'words.json');
    let matches = Math.floor(Number(body.matches));
    if (!Number.isFinite(matches) || matches < 20) matches = MEASURE_MATCHES_DEF;
    matches = Math.min(matches, MEASURE_MATCHES_CAP); // CPU koruması: üst sınır
    const configs = aiBehavior.measureConfigs();
    const seed = 20260727;
    const key = JSON.stringify({ lang, length, matches, configs, seed });
    // Önbellek: aynı ayar+maç sayısı 5 dk içinde tekrar ölçülmez.
    if (measureCache && measureCache.key === key && Date.now() - measureCache.at < MEASURE_CACHE_MS) {
      return send(res, 200, { ...measureCache.payload, cached: true });
    }
    if (measureBusy) return send(res, 409, { error: 'busy' }); // eşzamanlı çalıştırma yok
    measureBusy = true;
    try {
      const out = await runMeasureWorker(wordsFile, length, configs, matches, seed);
      const results = out.results || {};
      aiBehavior.saveMeasure(results, new Date().toISOString()); // persona avg otomatik güncellenir
      const payload = {
        ok: true,
        matches,
        poolSize: out.poolSize,
        lang,
        results,
        target: aiBehavior.diffTarget,
        tol: aiBehavior.targetTol,
      };
      measureCache = { key, at: Date.now(), payload };
      audit(req, 'ai_measure', true, `${matches} maç · havuz ${out.poolSize}`);
      send(res, 200, payload);
    } catch (e) {
      audit(req, 'ai_measure', false, String(e && e.message).slice(0, 40));
      send(res, 502, { error: 'measure_failed', detail: String(e && e.message).slice(0, 40) });
    } finally {
      measureBusy = false;
    }
  },

  // --- İÇERİK KAPSAMI (LLM içerik paketi · Faz A) ---
  // ADMIN: her içerik türü için toplam/kapsanan/eksik + eksik örnek. Kaynak:
  // content-index.json (scripts/build-content-index.mjs, CI ile AYNI çekirdek →
  // "iki yerde farklı sonuç çıkmaz"). İndeks yoksa boş döner (henüz üretilmemiş).
  'GET /admin/content/coverage': async (req, res) => {
    if (!requireSession(req, res, 'content_coverage')) return;
    let idx;
    try {
      idx = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-index.json'), 'utf8'));
    } catch {
      return send(res, 200, { generatedAt: null, categories: [] });
    }
    const MAX = 300; // eksik örnek üst sınırı (yanıt boyutu koruması)
    const categories = (idx.categories || []).map((c) => ({
      id: c.id,
      label: c.label,
      total: c.total,
      covered: c.covered,
      missingCount: c.total - c.covered,
      missingSample: (c.missing || []).slice(0, MAX),
    }));
    send(res, 200, { generatedAt: idx.generatedAt, categories });
  },

  // --- İÇERİK ÜRETİMİ (LLM içerik paketi · Faz B) ---
  // ADMIN: üretim durumu — günlük bütçe/harcama + kategori-başı taslak sayıları.
  'GET /admin/content/gen': async (req, res) => {
    if (!requireSession(req, res, 'content_gen')) return;
    if (!contentGen) return send(res, 503, { error: 'no_store' });
    send(res, 200, {
      ...contentGen.schema(now()),
      keyDefined: HINT_ENABLED,
      budgetOff: budgetAutoOff(),
      history: contentGen.history(),
    });
  },

  // ADMIN: günlük üretim bütçesi (USD) + parti üst sınırı.
  'POST /admin/content/gen/budget': async (req, res) => {
    if (!requireSession(req, res, 'content_gen_budget')) return;
    if (!contentGen) return send(res, 503, { error: 'no_store' });
    const body = await readJson(req);
    const r = contentGen.setBudget(
      { dailyUsd: body.dailyUsd, batchMax: body.batchMax },
      now(),
    );
    audit(req, 'content_gen_budget', true, `gunluk=$${r.config.dailyBudgetUsd} parti=${r.config.batchMax}`);
    send(res, 200, { ok: true, config: r.config });
  },

  // ADMIN: ÜRETİM. İki aşamalı — confirm YOKSA yalnız maliyet TAHMİNİ döner (para
  // harcamaz); confirm=true ise EKSİK kelimeler için parti üretir (yalnız taslağı
  // olmayanlar), her çıktıyı ön denetimden geçirir (sızıntı/boş/kısa → reddedilir),
  // gerçek maliyeti günlük bütçeye işler. Anahtar yoksa / bütçe aşımında reddeder.
  'POST /admin/content/generate': async (req, res) => {
    if (!requireSession(req, res, 'content_generate')) return;
    if (!contentGen) return send(res, 503, { error: 'no_store' });
    const body = await readJson(req, 4096);
    const category = String(body.category || '');
    if (!contentGenMod.isGeneratable(category)) return send(res, 400, { error: 'bad_category' });
    const cat = contentGenMod.CATS[category];
    const batchMax = contentGen.batchMax();
    const count = Math.floor(Number(body.count) || 0);
    if (!(count >= 1 && count <= batchMax)) {
      return send(res, 400, { error: 'bad_count', batchMax });
    }

    // Eksik kelimeler content-index'ten; yalnız henüz taslağı OLMAYANLAR.
    let idx;
    try {
      idx = JSON.parse(fs.readFileSync(path.join(__dirname, 'content-index.json'), 'utf8'));
    } catch {
      return send(res, 200, { error: 'no_index' });
    }
    const cidx = (idx.categories || []).find((x) => x.id === category);
    const missing = (cidx && cidx.missing) || [];
    const todo = missing.filter((w) => !contentGen.hasDraft(category, w)).slice(0, count);
    if (todo.length === 0) return send(res, 200, { todo: 0, note: 'no_missing' });

    const model = anthropicRequestBase().model;
    const estimate = contentGenMod.estimateCost(category, todo.length, model, aiConfigMod.priceOf);

    // 1. AŞAMA — onay yoksa yalnız TAHMİN (para harcamaz).
    if (!body.confirm) {
      return send(res, 200, { needsConfirm: true, estimate, words: todo, batchMax });
    }

    // 2. AŞAMA — canlı ön koşullar + bütçe kapıları.
    if (!HINT_ENABLED) return send(res, 503, { error: 'no_key' }); // ANTHROPIC_API_KEY yok
    if (budgetAutoOff()) return send(res, 402, { error: 'budget_off' }); // aylık bütçe aşımı
    if (contentGen.wouldExceedDaily(estimate.estUsd, now())) {
      return send(res, 402, {
        error: 'daily_budget',
        dailySpent: contentGen.dailySpent(now()),
        dailyBudgetUsd: contentGen.dailyBudgetUsd(),
      });
    }

    const at = now();
    let generated = 0;
    let rejected = 0;
    let errors = 0;
    let spentUsd = 0;
    const results = [];
    for (const word of todo) {
      let out;
      try {
        out = await callAnthropicRaw(
          contentGenMod.genSystem(cat.lang, cat.type),
          contentGenMod.genUser(word, cat.lang, cat.type),
        );
      } catch {
        if (aiUsage) aiUsage.record({ kind: 'content', model, error: true, at });
        errors++;
        results.push({ word, status: 'error' });
        continue;
      }
      const price = aiConfigMod.priceOf(out.model) || { inUsd: 0, outUsd: 0 };
      const costUsd =
        (out.inputTokens / 1e6) * price.inUsd + (out.outputTokens / 1e6) * price.outUsd;
      spentUsd += costUsd;
      contentGen.addSpend(costUsd, at);
      if (aiUsage) {
        aiUsage.record({
          kind: 'content',
          model: out.model,
          inputTokens: out.inputTokens,
          outputTokens: out.outputTokens,
          latencyMs: out.latencyMs,
          at,
        });
      }

      const parsed = contentGenMod.parseOutput(cat.type, out.text);
      if (parsed.error) {
        contentGen.addDraft({ category, word, status: 'rejected', reason: 'parse', inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd, at }); // prettier-ignore
        rejected++;
        results.push({ word, status: 'rejected', reason: 'parse' });
      } else {
        const chk = contentGenMod.precheck(word, cat.type, parsed.content);
        if (chk.rejected) {
          contentGen.addDraft({ category, word, status: 'rejected', content: parsed.content, reason: chk.reason, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd, at }); // prettier-ignore
          rejected++;
          results.push({ word, status: 'rejected', reason: chk.reason });
        } else {
          contentGen.addDraft({ category, word, status: 'generated', content: parsed.content, inputTokens: out.inputTokens, outputTokens: out.outputTokens, costUsd, at }); // prettier-ignore
          generated++;
          results.push({ word, status: 'generated' });
        }
      }

      // Birikimli günlük tavan aşıldıysa kalanları bırak (koruma).
      if (contentGen.wouldExceedDaily(0, at)) break;
    }

    audit(req, 'content_generate', true, `${category} uretildi=${generated} reddedildi=${rejected} hata=${errors} $${spentUsd.toFixed(4)}`); // prettier-ignore
    send(res, 200, {
      category,
      generated,
      rejected,
      errors,
      spentUsd: Math.round(spentUsd * 100000) / 100000,
      dailySpent: contentGen.dailySpent(at),
      results,
    });
  },

  // --- YZ KULLANIM + MALİYET ---
  // ADMIN: son N günün özeti (tür başına istek/token/gecikme/hata/rl + maliyet) +
  // aylık maliyet + bütçe durumu. Fiyat model tablosundan (ai-config) — TEK KAYNAK.
  // GİZLİLİK: yalnız toplu sayaç; kişiye bağlı veri yok.
  'GET /admin/ai/usage': async (req, res, url) => {
    if (!requireSession(req, res, 'ai_usage')) return;
    if (!aiUsage) return send(res, 503, { error: 'no_usage' });
    const days = Math.max(1, Math.min(120, Math.floor(Number(url.searchParams.get('days')) || 30)));
    send(res, 200, {
      summary: aiUsage.summary(aiConfigMod.priceOf, days),
      budget: aiUsage.budget(),
      monthCostUsd: aiUsage.monthCostUsd(aiConfigMod.priceOf),
      exceeded: aiUsage.budgetExceeded(aiConfigMod.priceOf),
      autoOff: budgetAutoOff(),
      keyDefined: HINT_ENABLED,
    });
  },

  // ADMIN: aylık bütçe eşiği (USD) + eşik aşımında ipucu koçunu oto-kapat.
  'POST /admin/ai/budget/set': async (req, res) => {
    if (!requireSession(req, res, 'ai_budget')) return;
    if (!aiUsage) return send(res, 503, { error: 'no_usage' });
    const body = await readJson(req);
    const r = aiUsage.setBudget({ monthlyUsd: Number(body.monthlyUsd), autoOff: body.autoOff });
    audit(req, 'ai_budget', true, `aylık=$${r.budget.monthlyUsd} oto=${r.budget.autoOff}`);
    send(res, 200, { ok: true, budget: r.budget });
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
  setInterval(
    () => {
      try {
        maintain();
      } catch {
        /* yoksay */
      }
    },
    24 * 60 * 60 * 1000,
  ).unref?.();
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
      hint: HINT_ENABLED && !budgetAutoOff(), // bütçe oto-kapalıysa özellik gizlenir
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

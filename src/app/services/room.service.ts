import { inject, Injectable, signal } from '@angular/core';
import { serverBase } from '../core/server-base';
import { LanguageService } from './language.service';

/** Sunucudan gelen tek oyuncu görünümü. */
export interface RoomPlayer {
  id: string;
  name: string;
  isOwner: boolean;
  finished: boolean;
  solved: boolean;
  attempts: number;
  score: number;
  /** Çözüm süresi (ms) — beraberlikte hızlı olan üstte. */
  timeMs: number;
  /** Oyuncu hazır mı (oda sahibi her zaman hazır). */
  ready: boolean;
}

/** Sohbet mesajı. */
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  text: string;
  ts: number;
}

/** Oda ayarları — oda sahibi belirler. */
export interface RoomSettings {
  maxPlayers: number;
  /** Süre sınırı saniye; 0 = serbest. */
  timeLimit: number;
}

/** Sunucudan gelen oda anlık görüntüsü. */
export interface RoomView {
  code: string;
  status: 'lobby' | 'playing' | 'finished' | 'closed';
  /** Oda yönetici tarafından kapatıldıysa oyuncuya gösterilecek anlamlı mesaj. */
  closedReason?: string;
  /** Sohbet yönetici tarafından kilitli mi? (istemci girişi kapatır) */
  chatLocked?: boolean;
  settings: RoomSettings;
  ownerId: string;
  seed: number | null;
  startedAt: number | null;
  players: RoomPlayer[];
  you: { id: string; isOwner: boolean; inRoom: boolean } | null;
  finishedCount: number;
  playerCount: number;
  readyCount: number;
  messages: ChatMessage[];
}

const CREDS_KEY = 'kelimebaz:room';

/** Sunucu hata kodu → i18n mesaj anahtarı (LanguageService.t ile çevrilir). */
const ERRORS: Record<string, string> = {
  not_found: 'roomerr.notFound',
  full: 'roomerr.full',
  already_started: 'roomerr.alreadyStarted',
  not_owner: 'roomerr.notOwner',
  forbidden: 'roomerr.forbidden',
  empty: 'roomerr.empty',
  not_playing: 'roomerr.notPlaying',
  chat_locked: 'roomerr.chatLocked',
  busy: 'roomerr.busy',
  rate_limited: 'roomerr.rateLimited',
  server_error: 'roomerr.serverError',
  timeout: 'roomerr.timeout',
  network: 'roomerr.network',
};

/** Ağ isteği zaman aşımı (ms) — sunucu takılırsa arayüz donmasın. */
const REQUEST_TIMEOUT = 8000;

/**
 * Çok oyunculu oda istemcisi.
 *
 * Sunucuyla HTTP + CANLI AKIŞ (SSE) ile konuşur: bir odaya girince GET /events ile
 * tek kalıcı bağlantı açılır; sunucu oda her değiştiğinde güncel görünümü PUSH eder
 * (lobiye katılma, ayar değişikliği, oyunun başlaması, puanlar, sohbet anında yansır).
 * SSE kurulamazsa (tarayıcı desteklemez / uç nokta yok / proxy engelli) ~1.5 sn'lik
 * POLLING yedeğine düşülür → özellik her koşulda çalışır. WebSocket'e gerek yok.
 */
@Injectable({ providedIn: 'root' })
export class RoomService {
  private readonly i18n = inject(LanguageService);

  /** API kökü: canlıda aynı köken /berk/rooms, yerelde :4243. */
  private readonly base = this.resolveBase();

  private readonly _room = signal<RoomView | null>(null);
  private readonly _error = signal('');
  private readonly _busy = signal(false);

  readonly room = this._room.asReadonly();
  readonly error = this._error.asReadonly();
  readonly busy = this._busy.asReadonly();

  private code = '';
  private playerId = '';
  private token = '';
  private poll: ReturnType<typeof setInterval> | null = null;
  /** Canlı akış (SSE). Kurulamazsa poll yedeğe geçer (aşağıda startLive). */
  private es: EventSource | null = null;

  /**
   * Açılışta kayıtlı bir oda oturumu (sessionStorage kimliği) VAR MIYDI?
   * App bunu okuyup, oturum geri yüklenince kullanıcıyı odasına döndürür
   * (view kalıcı değil → yenilemede başlığa döner; buysa onu telafi eder).
   */
  readonly hadSession: boolean;

  constructor() {
    this.restoreCreds();
    // Sayfa yenilendiyse kimlik burada dolu olur → odaya geri bağlan.
    this.hadSession = !!(this.code && this.playerId && this.token);
    if (this.hadSession) void this.resume();
  }

  /**
   * Sayfa yenilendiğinde odaya geri bağlan: kimlik geçerliyse önce durumu bir kez
   * çeker (refresh), oda hâlâ duruyorsa polling'i başlatır → RoomScreen durumdan
   * doğru aşamayı (lobi/oyun/bitiş) çizer. Sunucu not_found/closed derse refresh()
   * kimliği temizler, _room null kalır → SESSİZCE menüye düşülür (hata gösterilmez).
   */
  private async resume(): Promise<void> {
    if (!this.code || !this.playerId || !this.token) return;
    await this.refresh();
    if (this._room()) this.startLive();
  }

  /** Bu istemcinin oyuncu kimliği (kendini listede bulmak için). */
  get myId(): string {
    return this.playerId;
  }

  private resolveBase(): string {
    return serverBase(); // native APK → gerçek sunucu; web → aynı köken/localhost
  }

  /**
   * Sunucu çağrısı — sağlam hata yönetimi: zaman aşımı (donmaya karşı) +
   * JSON olmayan yanıt koruması (yol yanlış yönlenirse HTML gelirse net hata).
   */
  private async call<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    let res: Response;
    try {
      res = await fetch(this.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      throw new Error((e as Error)?.name === 'AbortError' ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }

    // Sunucu JSON döndürmeliydi; HTML/başka bir şey geldiyse (yanlış yönlenme)
    // res.json() çöker → bunu "network" olarak ele al, "beklenmedik çökme" değil.
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      throw new Error(res.ok ? 'network' : 'server_error');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error || 'server_error');
    return data as T;
  }

  private setError(e: unknown): void {
    const key = e instanceof Error ? e.message : 'network';
    this._error.set(this.i18n.t(ERRORS[key] || ERRORS['network']));
  }

  clearError(): void {
    this._error.set('');
  }

  // --- Oda işlemleri ---

  /** Yeni oda oluştur (oluşturan otomatik oda sahibi olur). */
  async create(name: string, settings: RoomSettings): Promise<boolean> {
    return this.enter('/create', { name, settings });
  }

  /** Var olan odaya kod ile katıl. */
  async join(code: string, name: string): Promise<boolean> {
    return this.enter('/join', { code: code.trim().toUpperCase(), name });
  }

  private async enter(path: string, body: object): Promise<boolean> {
    this._busy.set(true);
    this.clearError();
    try {
      const r = await this.call<{ code: string; playerId: string; token: string; room: RoomView }>(
        path,
        body,
      );
      this.code = r.code;
      this.playerId = r.playerId;
      this.token = r.token;
      this._room.set(r.room);
      this.saveCreds();
      this.startLive();
      return true;
    } catch (e) {
      this.setError(e);
      return false;
    } finally {
      this._busy.set(false);
    }
  }

  /** Oda sahibi ayarları değiştirir. */
  async updateSettings(settings: RoomSettings): Promise<void> {
    try {
      const r = await this.call<{ room: RoomView }>('/settings', {
        code: this.code,
        playerId: this.playerId,
        token: this.token,
        settings,
      });
      this._room.set(r.room);
    } catch (e) {
      this.setError(e);
    }
  }

  /** Katılan oyuncu "hazır" durumunu değiştirir. */
  async setReady(ready: boolean): Promise<void> {
    try {
      const r = await this.call<{ room: RoomView }>('/ready', {
        code: this.code,
        playerId: this.playerId,
        token: this.token,
        ready,
      });
      this._room.set(r.room);
    } catch (e) {
      this.setError(e);
    }
  }

  /** Oda sahibi oyunu başlatır. */
  async start(): Promise<void> {
    try {
      const r = await this.call<{ room: RoomView }>('/start', {
        code: this.code,
        playerId: this.playerId,
        token: this.token,
      });
      this._room.set(r.room);
    } catch (e) {
      this.setError(e);
    }
  }

  /** Sohbet mesajı gönder — tüm oda üyelerine (polling ile) iletilir. */
  async sendChat(text: string): Promise<void> {
    const t = text.trim();
    if (!t) return;
    try {
      const r = await this.call<{ room: RoomView }>('/chat', {
        code: this.code,
        playerId: this.playerId,
        token: this.token,
        text: t,
      });
      this._room.set(r.room);
    } catch (e) {
      this.setError(e);
    }
  }

  /** Oyuncunun sonucunu gönderir (sunucu puanı hesaplar). */
  async submitScore(solved: boolean, attempts: number, timeMs: number): Promise<void> {
    try {
      const r = await this.call<{ room: RoomView }>('/score', {
        code: this.code,
        playerId: this.playerId,
        token: this.token,
        solved,
        attempts,
        timeMs,
      });
      this._room.set(r.room);
    } catch (e) {
      this.setError(e);
    }
  }

  /** Odadan ayrıl — canlı akış durur, durum temizlenir. */
  async leave(): Promise<void> {
    this.stopLive();
    const payload = { code: this.code, playerId: this.playerId, token: this.token };
    this._room.set(null);
    this.code = this.playerId = this.token = '';
    this.clearCreds();
    this.clearError();
    try {
      await this.call('/leave', payload);
    } catch {
      /* ayrılırken hata önemli değil */
    }
  }

  // --- Canlı güncelleme: SSE (birincil) + polling (yedek) ---

  /**
   * Odaya canlı bağlan: önce SSE (tek kalıcı bağlantı, sunucu değişince push eder).
   * SSE kurulamazsa (tarayıcı desteklemiyor / uç nokta yok / proxy engelli) POLLING
   * yedeğe düşer → özellik bugünkü gibi çalışır (regresyon yok). SSE canlıysa polling
   * durur; SSE koparsa yedek polling devreye girer, SSE arka planda yeniden dener.
   */
  private startLive(): void {
    this.stopLive();
    if (!this.code) return;
    if (typeof EventSource === 'undefined') {
      this.startPolling(); // tarayıcı SSE bilmiyor → yalnız polling
      return;
    }
    let opened = false;
    try {
      const es = new EventSource(
        `${this.base}/events?code=${encodeURIComponent(this.code)}&playerId=${encodeURIComponent(this.playerId)}`,
      );
      this.es = es;
      es.onopen = () => {
        opened = true;
        this.stopPolling(); // SSE canlı → yedek polling'i durdur
      };
      es.onmessage = (e) => this.applyLive(e.data);
      es.addEventListener('gone', () => this.onRoomGone()); // oda silindi (herkes çıktı/süre doldu)
      es.onerror = () => {
        // Bağlantı kurulamadı/koptu → yedek polling başlat (bugünkü davranış).
        if (!this.poll) this.startPolling();
        // Hiç açılmadıysa uç nokta yok/engelli demektir → ES'yi kapat (sonsuz yeniden
        // deneme + boşa istek olmasın), sadece polling'e güven. Açıldıysa ES kendi
        // yeniden bağlanmayı sürdürür; bağlanınca onopen polling'i tekrar durdurur.
        if (!opened && this.es) {
          this.es.close();
          this.es = null;
        }
      };
    } catch {
      this.startPolling();
    }
  }

  private stopLive(): void {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.stopPolling();
  }

  /** SSE mesajı ({room}) — refresh()'in başarı yolunun aynısı (closed dâhil). */
  private applyLive(data: string): void {
    let room: RoomView | undefined;
    try {
      room = (JSON.parse(data) as { room?: RoomView }).room;
    } catch {
      return; // bozuk kare → yok say
    }
    if (!room) return;
    if (room.status === 'closed') {
      this.stopLive();
      this._room.set(null);
      this.clearCreds();
      this._error.set(room.closedReason || this.i18n.t('roomerr.closed'));
      return;
    }
    this._room.set(room);
  }

  /** Sunucu "gone" olayı → oda artık yok; sessizce menüye düş. */
  private onRoomGone(): void {
    this.stopLive();
    this._room.set(null);
    this.clearCreds();
    this.code = this.playerId = this.token = '';
  }

  private startPolling(): void {
    this.stopPolling();
    this.poll = setInterval(() => this.refresh(), 1500);
  }

  private stopPolling(): void {
    if (this.poll) {
      clearInterval(this.poll);
      this.poll = null;
    }
  }

  /** Oda durumunu bir kez tazele. */
  async refresh(): Promise<void> {
    if (!this.code) return;
    try {
      const r = await this.call<{ room: RoomView }>(
        `/state?code=${encodeURIComponent(this.code)}&playerId=${encodeURIComponent(this.playerId)}`,
      );
      // Oda yönetici tarafından kapatıldı → anlamlı mesaj göster, sessizce atma.
      if (r.room.status === 'closed') {
        this.stopLive();
        this._room.set(null);
        this.clearCreds();
        this._error.set(r.room.closedReason || this.i18n.t('roomerr.closed'));
        return;
      }
      this._room.set(r.room);
    } catch (e) {
      // Oda silinmişse (herkes çıkmış / süresi dolmuş) temizle
      if (e instanceof Error && e.message === 'not_found') {
        this.stopLive();
        this._room.set(null);
        this.clearCreds();
      }
    }
  }

  // --- Kimlik bilgisi kalıcılığı (sayfa yenilense de odada kal) ---

  private saveCreds(): void {
    try {
      sessionStorage.setItem(
        CREDS_KEY,
        JSON.stringify({ code: this.code, playerId: this.playerId, token: this.token }),
      );
    } catch {
      /* yoksay */
    }
  }

  private restoreCreds(): void {
    try {
      const raw = sessionStorage.getItem(CREDS_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as { code: string; playerId: string; token: string };
      if (c.code && c.playerId && c.token) {
        this.code = c.code;
        this.playerId = c.playerId;
        this.token = c.token;
      }
    } catch {
      /* yoksay */
    }
  }

  private clearCreds(): void {
    try {
      sessionStorage.removeItem(CREDS_KEY);
    } catch {
      /* yoksay */
    }
  }
}

import { Injectable, signal } from '@angular/core';
import { serverBase } from '../core/server-base';

/**
 * ===========================================================================
 * ANONİM TELEMETRİ — kör uçuşu bitirmek için, gizliliği bozmadan.
 *
 * GİZLİLİK (pazarlık konusu değil):
 *   • Kalıcı oyuncu kimliği YOK — hiçbir tanımlayıcı üretilmez/gönderilmez.
 *   • Kişisel veri / profil adı / avatar GÖNDERİLMEZ.
 *   • Ayardan kapatılınca HİÇBİR istek gitmez (kuyruğa bile alınmaz).
 *
 * SAĞLAMLIK (oyunu ASLA bozmaz):
 *   • Olaylar bellekte biriktirilir, ARKA PLANDA toplu gönderilir.
 *   • sendBeacon (yoksa fetch+keepalive) — yanıt beklenmez, ateşle-unut.
 *   • Her hata SESSİZCE yutulur; başarısız gönderim kuyruğu şişirmez (vazgeçilir).
 *   • Gövde 'text/plain' Blob — CORS ön-uçuşu tetiklemez (canlıda aynı köken).
 *
 * VARSAYILAN: AÇIK. Gerekçe: veri tamamen anonim (kimlik/IP yok), ayardan tek
 * dokunuşla kapatılabiliyor ve README'de açıkça yazıyor; kapalı başlasa neredeyse
 * hiç veri gelmez ve "kör uçuş" amacı boşa çıkardı. Şeffaf + kolay çıkış = açık.
 * ===========================================================================
 */

type EventType = 'game_start' | 'game_end' | 'mode_select' | 'lang_change' | 'error';

interface TelemetryEvent {
  type: EventType;
  mode?: string;
  lang?: string;
  wlen?: number;
  word?: string;
  result?: 'won' | 'lost';
  attempts?: number;
  duration_ms?: number;
  code?: string;
}

const KEY = 'kelimebaz:telemetry';
const BATCH = 10; // bu sayıya ulaşınca gönder
const FLUSH_MS = 20_000; // ya da her 20 sn
const MAX_QUEUE = 50; // gönderilemezse bile bellek sınırı

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  /** Kullanıcı anonim veri göndermeyi açtı mı? (varsayılan AÇIK) */
  readonly enabled = signal<boolean>(this.load());

  private queue: TelemetryEvent[] = [];
  private readonly base = this.resolveBase();

  constructor() {
    if (typeof window === 'undefined') return;
    // Düzenli toplu gönderim (kapalıyken no-op).
    setInterval(() => this.flush(), FLUSH_MS);
    // Sayfa gizlenince/kapanınca kalanları yolla (beacon unload'ı atlatır).
    const flushNow = () => this.flush();
    window.addEventListener('pagehide', flushNow);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  /** Ayarı değiştir. Kapatınca kuyruk temizlenir → hiçbir istek gitmez. */
  setEnabled(on: boolean): void {
    this.enabled.set(on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* depolama kapalı */
    }
    if (!on) this.queue = [];
  }

  // --- Olay yardımcıları (hepsi güvenli; kapalıyken sessizce hiçbir şey yapmaz) ---

  gameStart(e: { mode: string; lang: string; wlen: number; word: string }): void {
    this.track({ type: 'game_start', ...e });
  }
  gameEnd(e: {
    mode: string;
    lang: string;
    wlen: number;
    word: string;
    result: 'won' | 'lost';
    attempts: number;
    duration_ms: number;
    code?: string; // ör. YZ modunda zorluk (tier)
  }): void {
    this.track({ type: 'game_end', ...e });
  }
  modeSelect(mode: string, lang: string): void {
    this.track({ type: 'mode_select', mode, lang });
  }
  langChange(lang: string): void {
    this.track({ type: 'lang_change', lang });
  }
  error(code: string): void {
    this.track({ type: 'error', code });
  }

  // --- İç işleyiş ---

  private track(e: TelemetryEvent): void {
    if (!this.enabled()) return; // KAPALI → kuyruğa bile alma
    this.queue.push(e);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (this.queue.length >= BATCH) this.flush();
  }

  /** Kuyruğu toplu gönder. Ateşle-unut; hata sessizce yutulur, kuyruk şişmez. */
  private flush(): void {
    if (!this.enabled() || !this.queue.length || typeof navigator === 'undefined') return;
    const events = this.queue;
    this.queue = []; // başarısız olsa bile geri koymayız → sonsuz büyüme yok
    try {
      const body = JSON.stringify({ events });
      const url = this.base + '/events';
      // 'text/plain' → CORS ön-uçuşu yok; sunucu content-type'a bakmadan JSON.parse eder.
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon && navigator.sendBeacon(url, blob)) return;
      // Beacon yoksa/başarısızsa: keepalive fetch (yanıt beklenmez).
      void fetch(url, { method: 'POST', body: blob, keepalive: true }).catch(() => {});
    } catch {
      /* her türlü hata sessiz — telemetri oyunu asla etkilemez */
    }
  }

  /** RoomService/AiHint ile aynı köken çözümü: canlıda /berk/rooms, yerelde :4243. */
  private resolveBase(): string {
    return serverBase();
  }

  private load(): boolean {
    try {
      return localStorage.getItem(KEY) !== '0'; // varsayılan AÇIK (yalnız '0' kapatır)
    } catch {
      return true;
    }
  }
}

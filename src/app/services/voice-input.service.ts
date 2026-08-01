import { inject, Injectable, signal } from '@angular/core';
import { LanguageService } from './language.service';

/**
 * ===========================================================================
 * SESLİ GİRİŞ SERVİSİ — Web Speech API'nin ince bir sarmalayıcısı.
 *
 * Tarayıcıya YERLEŞİK, ücretsiz, backend gerektirmez. Ama:
 *   • Destek tutarsız (Safari/iOS kısıtlı) → destek yoksa buton HİÇ görünmez.
 *   • İzin reddedilebilir → reddedilince özellik SESSİZCE gizlenir (denied).
 *   • Bazı tarayıcılar sesi bir sunucuya gönderir → gizlilik uyarısı (bileşende).
 *
 * Bu servis yalnız TANIMAYI yönetir. Tanınan metin çağırana verilir; TAHTAYA
 * yazma ve GÖNDERMEME kararı oyun bileşenindedir (onaydan önce yazılır).
 * ===========================================================================
 */

/** Web Speech API tipi tarayıcı libinde standart değil — gereken kadarını tanımlarız. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Dinleme sonucu geri çağrıları. */
export interface VoiceHandlers {
  /** Bir şey duyuldu — ham metin (bileşen harflere indirger). */
  onResult: (transcript: string) => void;
  /** Ses/eşleşme yok — "anlaşılamadı" göster. */
  onNoMatch: () => void;
  /** Beklenmedik hata — genel uyarı göster. */
  onError: () => void;
}

@Injectable({ providedIn: 'root' })
export class VoiceInputService {
  private readonly i18n = inject(LanguageService);
  private readonly ctor = recognitionCtor();

  /** Tarayıcı Web Speech API destekliyor mu? (false → buton hiç render edilmez) */
  readonly supported = signal<boolean>(!!this.ctor);
  /** Mikrofon izni reddedildi mi? (true → özellik sessizce gizlenir) */
  readonly denied = signal(false);
  /** Şu an dinleniyor mu? (görsel durum + aria) */
  readonly listening = signal(false);

  private rec: SpeechRecognitionLike | null = null;

  /**
   * Dinlemeyi başlat. Dil AKTİF oyun diline bağlanır (tr-TR / en-US).
   * Her çağrıda taze bir tanıyıcı kurulur (durum sızmasın). Tek seferlik sonuç.
   */
  start(handlers: VoiceHandlers): void {
    if (!this.ctor || this.listening()) return;

    let rec: SpeechRecognitionLike;
    try {
      rec = new this.ctor();
    } catch {
      // Kurulamıyorsa desteklenmiyor say → buton kaybolur.
      this.supported.set(false);
      return;
    }
    this.rec = rec;
    rec.lang = this.i18n.lang() === 'en' ? 'en-US' : 'tr-TR';
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.continuous = false;

    // Sonuç/hata/bitiş yollarından yalnız BİRİ etkisin (çift geri çağrı olmasın).
    let settled = false;
    const settle = (cb?: () => void): void => {
      if (settled) return;
      settled = true;
      cb?.();
    };

    rec.onresult = (e): void => {
      const transcript = e?.results?.[0]?.[0]?.transcript;
      if (transcript) settle(() => handlers.onResult(String(transcript)));
    };
    rec.onerror = (e): void => {
      const err = e?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.denied.set(true); // izin yok → özelliği sessizce gizle
        settle();
      } else if (err === 'no-speech' || err === 'audio-capture') {
        settle(handlers.onNoMatch); // ses gelmedi
      } else {
        settle(handlers.onError);
      }
    };
    rec.onend = (): void => {
      this.listening.set(false);
      this.rec = null;
      settle(handlers.onNoMatch); // sonuç/hata olmadan bittiyse: anlaşılamadı
    };

    try {
      rec.start();
      this.listening.set(true);
    } catch {
      // Örn. arka arkaya start() → InvalidStateError. Sessizce vazgeç.
      this.listening.set(false);
      this.rec = null;
    }
  }

  /** Dinlemeyi elle durdur (buton tekrar basıldığında). */
  stop(): void {
    try {
      this.rec?.stop();
    } catch {
      /* zaten durmuş */
    }
  }
}

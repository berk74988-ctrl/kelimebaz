import { Injectable, computed, signal } from '@angular/core';

const K_MUSIC_VOL = 'kelimebaz:audio:musicVol';
const K_SFX_VOL = 'kelimebaz:audio:sfxVol';
const K_MUSIC_ON = 'kelimebaz:audio:musicOn';
const K_SFX_ON = 'kelimebaz:audio:sfxOn';

/** Arka plan müziği dosyası (public/ altından servis edilir). */
const MUSIC_SRC = 'music.mp3';

/** Çalınabilecek efektler. */
export type Sfx = 'key' | 'delete' | 'invalid' | 'reveal' | 'win' | 'lose';

/**
 * ===========================================================================
 * SES
 *
 * İki bağımsız kanal:
 *   🎵 MÜZİK  — tek bir mp3, döngüde. Ses seviyesi ayrı.
 *   🔔 EFEKT  — dosya YOK; WebAudio ile anlık üretiliyor (tuş, silme, geçersiz
 *              kelime, kutu açılışı, kazanma, kaybetme). Böylece efektler
 *              paketi bir bayt bile büyütmüyor ve gecikmesiz çalıyor.
 *
 * OTOMATİK BAŞLATMA HAKKINDA:
 * Tarayıcılar sesli otomatik oynatmayı ENGELLER — kullanıcı sayfayla
 * etkileşime girmeden play() reddedilir. Bu bir hata değil, kasıtlı bir
 * politika ve etrafından dolaşılamaz. Bu yüzden: açılışta çalmayı deneriz;
 * engellenirsek ilk dokunuş/tıklama/tuş vuruşunda kendiliğinden başlatırız.
 * Pratikte oyuncu zaten "Günün Kelimesi"ne basarak oyuna giriyor, yani müzik
 * ilk etkileşimde duyuluyor.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly _musicVol = signal(this.loadNum(K_MUSIC_VOL, 0.35));
  private readonly _sfxVol = signal(this.loadNum(K_SFX_VOL, 0.6));
  private readonly _musicOn = signal(this.loadBool(K_MUSIC_ON, true));
  private readonly _sfxOn = signal(this.loadBool(K_SFX_ON, true));

  /** Tarayıcı otomatik oynatmayı engelledi mi? (ilk etkileşimde çözülür) */
  private readonly _blocked = signal(false);

  readonly musicVol = this._musicVol.asReadonly();
  readonly sfxVol = this._sfxVol.asReadonly();
  readonly musicOn = this._musicOn.asReadonly();
  readonly sfxOn = this._sfxOn.asReadonly();
  readonly blocked = this._blocked.asReadonly();

  /** Müzik şu an gerçekten duyuluyor mu? */
  readonly musicAudible = computed(() => this._musicOn() && this._musicVol() > 0 && !this._blocked());

  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private unlockBound = false;

  // --- Ayarlar ---
  //
  // Kayıt DOĞRUDAN ayarlayıcılarda yapılıyor, effect() ile değil.
  // effect() değişiklik algılaması çalıştığında tetiklenir; ayar penceresi
  // kapatılıp uygulama yeniden açılana kadar hiç çalışmayabilir — bu yüzden
  // ayarlar sessizce KAYDEDİLMİYORDU. Yazma anında kaydetmek tek doğrusu.

  setMusicVol(v: number): void {
    this._musicVol.set(clamp(v));
    // Kaydırıcı sıfırdan yukarı çekildiyse kanal kapalıysa kendiliğinden aç —
    // yoksa kaydırıcı hiçbir şey yapmıyormuş gibi görünür.
    if (v > 0 && !this._musicOn()) this._musicOn.set(true);
    this.applyMusic();
    this.save(K_MUSIC_VOL, this._musicVol());
    this.save(K_MUSIC_ON, this._musicOn());
  }

  setSfxVol(v: number): void {
    this._sfxVol.set(clamp(v));
    if (v > 0 && !this._sfxOn()) this._sfxOn.set(true);
    this.save(K_SFX_VOL, this._sfxVol());
    this.save(K_SFX_ON, this._sfxOn());
  }

  toggleMusic(): void {
    this._musicOn.set(!this._musicOn());
    this.applyMusic();
    this.save(K_MUSIC_ON, this._musicOn());
  }

  toggleSfx(): void {
    this._sfxOn.set(!this._sfxOn());
    this.save(K_SFX_ON, this._sfxOn());
    if (this._sfxOn()) this.sfx('key'); // açınca duyulsun — geri bildirim
  }

  /** Ses seviyesini/çalma durumunu <audio> öğesine yansıtır. */
  private applyMusic(): void {
    const el = this.el;
    if (!el) return;

    el.volume = this._musicOn() ? this._musicVol() : 0;
    if (this._musicOn()) this.play();
    else el.pause();
  }

  // --- Müzik ---

  /**
   * Uygulama açılışında çağrılır: müzik öğesini kurar, çalmayı dener ve
   * engellenirse ilk kullanıcı hareketini bekler.
   */
  init(): void {
    if (this.el || typeof Audio === 'undefined') return;

    try {
      const el = new Audio(MUSIC_SRC);
      el.loop = true;
      el.preload = 'auto';
      el.volume = this._musicOn() ? this._musicVol() : 0;
      this.el = el;
    } catch {
      return; // ses desteklenmiyorsa oyun sessiz çalışır, kırılmaz
    }

    this.play();
    this.bindUnlock();
  }

  private play(): void {
    const el = this.el;
    if (!el || !this._musicOn()) return;

    // play() ESKİ tarayıcılarda ve test ortamlarında Promise döndürmez.
    // Doğrudan .then() çağırmak orada çökertiyordu — önce kontrol et.
    let p: Promise<void> | undefined;
    try {
      p = el.play() as Promise<void> | undefined;
    } catch {
      this._blocked.set(true);
      this.bindUnlock();
      return;
    }

    if (!p || typeof p.then !== 'function') return;

    p.then(
      () => this._blocked.set(false),
      () => {
        // Tarayıcı engelledi — ilk etkileşimde tekrar denenecek.
        this._blocked.set(true);
        this.bindUnlock();
      },
    );
  }

  /** İlk kullanıcı hareketinde sesi çöz (tarayıcı politikası gereği). */
  private bindUnlock(): void {
    if (this.unlockBound || typeof window === 'undefined') return;
    this.unlockBound = true;

    const unlock = () => {
      this.unlockBound = false;
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
        window.removeEventListener(ev, unlock);
      }
      this.ctx?.resume().catch(() => {});
      this.play();
    };

    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      window.addEventListener(ev, unlock, { once: true });
    }
  }

  // --- Efektler (WebAudio ile üretilir, dosya yok) ---

  sfx(kind: Sfx): void {
    if (!this._sfxOn() || this._sfxVol() <= 0) return;

    const ctx = this.audioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const t = ctx.currentTime;
    const v = this._sfxVol();

    switch (kind) {
      case 'key':
        this.blip(ctx, t, 660, 0.05, 0.16 * v, 'triangle');
        break;
      case 'delete':
        this.blip(ctx, t, 320, 0.06, 0.14 * v, 'triangle');
        break;
      case 'invalid':
        // İki kısa alçak vuruş — "olmadı" hissi
        this.blip(ctx, t, 180, 0.09, 0.2 * v, 'sawtooth');
        this.blip(ctx, t + 0.11, 150, 0.11, 0.2 * v, 'sawtooth');
        break;
      case 'reveal':
        this.blip(ctx, t, 520, 0.07, 0.13 * v, 'sine');
        break;
      case 'win':
        // Yükselen arpej
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.blip(ctx, t + i * 0.11, f, 0.22, 0.22 * v, 'triangle'),
        );
        break;
      case 'lose':
        // İnen üçlü
        [392, 329.63, 261.63].forEach((f, i) =>
          this.blip(ctx, t + i * 0.14, f, 0.28, 0.18 * v, 'sine'),
        );
        break;
    }
  }

  /** Kutular sırayla açılırken her kutuda bir "tık" — açılış ritmiyle aynı. */
  revealSequence(count: number, stepMs = 90): void {
    if (!this._sfxOn() || this._sfxVol() <= 0) return;
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.sfx('reveal'), i * stepMs);
    }
  }

  private audioCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!Ctor) return null; // WebAudio yoksa oyun sessiz çalışır, kırılmaz
    this.ctx = new Ctor();
    return this.ctx;
  }

  /** Tek bir ton: hızlı yükselip yumuşak sönen zarf (tık sesi olmasın diye). */
  private blip(
    ctx: AudioContext,
    at: number,
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);

    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  // --- Kalıcılık ---

  private loadNum(key: string, fallback: number): number {
    try {
      const raw = localStorage.getItem(key);
      // Boş dizge de bozuk kayıttır: Number('') === 0 olur ve sesi sessizce
      // kısardı. Sayıya çevrilemeyen HER şey varsayılana düşer.
      if (raw === null || raw.trim() === '') return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? clamp(n) : fallback;
    } catch {
      return fallback;
    }
  }

  private loadBool(key: string, fallback: boolean): boolean {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw === '1';
    } catch {
      return fallback;
    }
  }

  private save(key: string, value: number | boolean): void {
    try {
      localStorage.setItem(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
    } catch {
      /* özel sekme / kota — ses yine çalışır, sadece kaydedilmez */
    }
  }
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

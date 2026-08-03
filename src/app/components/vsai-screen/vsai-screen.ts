import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { AiSolver, aiOpeners } from '../../core/ai-opponent';
import { adaptTierLabel, adaptBand } from '../../core/ai-adaptive';
import {
  Persona,
  PERSONAS,
  PERSONA_BONUS,
  persona as personaById,
  PersonaId,
} from '../../core/ai-personas';
import { raceOutcome } from '../../core/vsai-race';
import { LetterState, MAX_ATTEMPTS } from '../../models/game.model';
import { AudioService } from '../../services/audio.service';
import { AiBehaviorService } from '../../services/ai-behavior.service';
import { BalanceService } from '../../services/balance.service';
import { GameService } from '../../services/game.service';
import { GoldService } from '../../services/gold.service';
import { LanguageService } from '../../services/language.service';
import { StatsService } from '../../services/stats.service';
import { TelemetryService } from '../../services/telemetry.service';
import { WordService } from '../../services/word.service';
import { Game } from '../game/game';

type Phase = 'pick' | 'playing' | 'result';
interface AiRow {
  pattern: LetterState[];
}
interface Result {
  solved: boolean;
  attempts: number;
  timeMs: number;
}

/**
 * 🤖 YAPAY ZEKÂYA KARŞI — karakter galerisi, SIRA TABANLI yarış.
 *
 * Oyuncu bir RAKİP KARAKTER seçer (her biri farklı strateji: Temkinli, Ünlü
 * Avcısı, Harf Sayarı, Kumarbaz — bkz. core/ai-personas.ts). Yarış sırayla işler:
 * oyuncu tahmin → karakter kısa "düşünme" sonrası tahmin → sıra oyuncuya. Kelimeyi
 * DAHA AZ tahminde bulan kazanır; aynı turda berabere (core/vsai-race.ts). Maç
 * içi laf atmalar karaktere kişilik katar. Karşılaşma kayıtları tutulur.
 */
@Component({
  selector: 'app-vsai-screen',
  imports: [Game],
  templateUrl: './vsai-screen.html',
  styleUrl: './vsai-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VsaiScreen {
  private readonly words = inject(WordService);
  private readonly stats = inject(StatsService);
  private readonly gold = inject(GoldService);
  private readonly audio = inject(AudioService);
  private readonly game = inject(GameService);
  protected readonly i18n = inject(LanguageService);
  private readonly telemetry = inject(TelemetryService);
  private readonly balance = inject(BalanceService);
  private readonly aiBehavior = inject(AiBehaviorService);

  readonly back = output<void>();

  protected readonly MAX = MAX_ATTEMPTS;
  // Karakter listesi panelden aç/kapa edilebilir (aiBehavior); kapalı olanlar gizlenir.
  protected readonly personas = computed(() =>
    PERSONAS.filter((p) => this.aiBehavior.personaEnabled(p.id)),
  );

  protected readonly phase = signal<Phase>('pick');
  protected readonly personaId = signal<PersonaId>(PERSONAS[0].id);
  protected readonly adaptive = signal(false); // 🎯 "Bana uygun rakip" modu mu?
  /** 🎯 Uyarlanabilir rakip — oyuncunun seviyesine göre ayarlanan sözde-karakter. */
  protected readonly adaptivePersona = computed<Persona>(() => {
    const pos = this.stats.adaptivePos();
    return {
      id: 'adaptive' as PersonaId,
      nameKey: 'vsai.adaptiveName',
      descKey: 'vsai.adaptiveDesc',
      avatar: '🎯',
      tier: adaptTierLabel(pos),
      config: { minMs: 1400, maxMs: 2400, band: adaptBand(pos) },
      avgGuesses: 0,
    };
  });
  protected readonly persona = computed<Persona>(() =>
    this.adaptive() ? this.adaptivePersona() : personaById(this.personaId()),
  );
  protected readonly word = signal('');

  // Sıra: 'you' → oyuncu tahmin yapabilir · 'ai' → karakter düşünüyor (giriş kilitli)
  protected readonly turn = signal<'you' | 'ai'>('you');
  protected readonly botTurn = computed(() => this.turn() === 'ai');

  // Karakter (rakip) durumu — canlı gösterilir
  protected readonly aiRows = signal<AiRow[]>([]);
  protected readonly aiSolved = signal(false);
  protected readonly aiFailed = signal(false);
  protected readonly aiThinking = signal(false);
  protected readonly taunt = signal(''); // maç içi laf atma (kısa süre görünür)
  protected readonly aiGhosts = computed(() =>
    Array.from({ length: Math.max(0, this.MAX - this.aiRows().length) }, (_, i) => i),
  );

  // Sonuç
  protected readonly outcome = signal<'win' | 'lose' | 'draw'>('draw');
  protected readonly bonus = signal(0);
  protected readonly myResult = signal<Result | null>(null);
  protected readonly aiResult = signal<Result | null>(null);

  private solver: AiSolver | null = null;
  private thinkTimer: ReturnType<typeof setTimeout> | null = null;
  private tauntTimer: ReturnType<typeof setTimeout> | null = null;
  private matchStart = 0;
  private aiTimeMs = 0;
  private humanSolved = false;
  private humanAttempts = 0;
  private ended = false;
  private tauntedGreen = false;
  private tauntedLast = false;
  private tauntedClose = false;

  // --- seçim ekranı yardımcıları ---

  /** Bir karaktere karşı karşılaşma kaydı (oynanan/kazanılan) — kartta gösterilir. */
  protected record(id: PersonaId): { played: number; won: number } {
    return this.stats.vsaiRecord(id);
  }

  // --- akış ---

  protected start(p: Persona): void {
    if (p.locked) return;
    this.clearThink();
    this.clearTaunt();
    this.adaptive.set(p.id === 'adaptive');
    if (p.id !== 'adaptive') this.personaId.set(p.id);
    const w = this.words.randomWordForLevel(this.stats.level().level);
    this.word.set(w);
    this.aiRows.set([]);
    this.aiSolved.set(false);
    this.aiFailed.set(false);
    this.aiThinking.set(false);
    this.humanSolved = false;
    this.humanAttempts = 0;
    this.ended = false;
    this.tauntedGreen = this.tauntedLast = this.tauntedClose = false;
    this.myResult.set(null);
    this.aiResult.set(null);
    this.aiTimeMs = 0;
    this.matchStart = performance.now();
    const len = [...w].length;
    // YZ zorluğu sunucudan ayarlanabilir: aiTopKMul çarpanı (>1 = kolay, <1 = zor).
    // Artık band tabanlı → çarpanı entropi diliminde KAYMAYA çeviririz: mul>1 dilimi
    // zayıf uca (kolay), mul<1 güçlü uca (zor) kaydırır. Varsayılan 1 → kayma yok.
    // Diğer strateji parametreleri (bias/gamble) korunur.
    const mul = this.balance.aiTopKMul();
    const shift = Math.max(-0.5, Math.min(0.5, (mul - 1) * 0.3));
    const [lo, hi] = p.config.band;
    const band: [number, number] = [
      Math.max(0, Math.min(1, lo + shift)),
      Math.max(0, Math.min(1, hi + shift)),
    ];
    // Karakter ağırlığı panelden ayarlanabilir (biasWeight/gamble) — band gömülü kalır.
    // AiSolver config'i BURADA sabitlenir → sonraki override süren maçı bozmaz.
    const wo = this.aiBehavior.personaWeightOverride(p.id);
    const cfg = { ...p.config, band, ...wo };
    this.solver = new AiSolver(
      w,
      this.words.answersOfLength(len),
      cfg,
      this.MAX,
      Math.random,
      aiOpeners(this.i18n.lang(), len),
      this.i18n.lang(), // renk mantığı da aktif dilin büyük-harf kuralını kullansın
    );
    this.turn.set('you'); // 🧑 önce oyuncu — karakter, oyuncunun tahminini BEKLER
    this.phase.set('playing');
  }

  /** 🧑 Oyuncu bir tahmin yaptı → sıra karaktere geçer. */
  protected onPlayerGuess(e: { attempts: number; solved: boolean; over: boolean }): void {
    if (this.ended || this.phase() !== 'playing' || this.turn() !== 'you') return;
    this.humanAttempts = e.attempts;
    this.humanSolved = e.solved;
    this.turn.set('ai');
    this.aiThinking.set(true);
    this.clearThink();
    this.thinkTimer = setTimeout(() => this.botTurnStep(), this.thinkDelay());
  }

  /** Karakterin tek turu: bir tahmin, laf atma, sonra tur değerlendirilir. */
  private botTurnStep(): void {
    if (this.ended || this.phase() !== 'playing') return;
    const s = this.solver;
    if (s && !s.done) {
      s.step();
      this.aiRows.set(s.guesses.map((g) => ({ pattern: g.pattern })));
      if (s.solved) {
        this.aiSolved.set(true);
        this.aiTimeMs = Math.round(performance.now() - this.matchStart);
        this.safeSfx('key');
      } else if (s.done) {
        this.aiFailed.set(true);
      }
      this.maybeTaunt(s);
    }
    this.aiThinking.set(false);
    this.decideRound();
  }

  /** Duruma göre kısa laf atma göster (ilk yeşil · son tur · yakın maç — her biri bir kez). */
  private maybeTaunt(s: AiSolver): void {
    if (s.solved) return; // çözünce laf atmaz, sonuç ekranı konuşur
    const rows = this.aiRows();
    const lastPat = rows[rows.length - 1]?.pattern ?? [];
    const hasGreen = lastPat.some((st) => st === 'correct');
    let trigger = '';
    if (!this.tauntedLast && s.attempts >= this.MAX - 1) {
      trigger = 'lastTurn';
      this.tauntedLast = true;
    } else if (hasGreen && !this.tauntedGreen) {
      trigger = 'firstGreen';
      this.tauntedGreen = true;
    } else if (!this.tauntedClose && s.attempts === 2) {
      trigger = 'close';
      this.tauntedClose = true;
    }
    if (trigger) this.showTaunt(`persona.${this.persona().id}.${trigger}`);
  }

  private showTaunt(key: string): void {
    this.taunt.set(this.i18n.t(key));
    if (this.tauntTimer) clearTimeout(this.tauntTimer);
    this.tauntTimer = setTimeout(() => this.taunt.set(''), 3500);
  }

  /** Tur tamamlandı → bitti mi, devam mı? */
  private decideRound(): void {
    const s = this.solver;
    if (!s) return;
    const someoneSolved = this.humanSolved || s.solved;
    const bothExhausted = this.humanAttempts >= this.MAX && s.attempts >= this.MAX;
    if (someoneSolved || bothExhausted) {
      this.endMatch();
      return;
    }
    this.turn.set('you');
  }

  /** Sonucu belirle, göster, karakter bazlı istatistiği (gerçek yarış sonucu) işle. */
  private endMatch(): void {
    if (this.ended || !this.solver) return;
    this.ended = true;
    this.clearThink();
    this.clearTaunt();
    const s = this.solver;

    // Oyuncunun oyunu açıksa kapat (altın/altyapı) — endVsaiMatch: 'lost' değil 'ended'.
    if (!this.game.isOver()) {
      try {
        this.game.endVsaiMatch();
      } catch {
        /* yok say */
      }
    }

    const me: Result = {
      solved: this.humanSolved,
      attempts: this.humanAttempts,
      timeMs: Math.round(performance.now() - this.matchStart),
    };
    const ai: Result = {
      solved: s.solved,
      attempts: s.attempts,
      timeMs: s.solved ? this.aiTimeMs : Number.MAX_SAFE_INTEGER,
    };
    const res = raceOutcome(me, ai);
    this.outcome.set(res);

    // 📊 Maç sonucu (GERÇEK yarış sonucu) + karakter kaydı + 🎯 uyarlanabilir zorluk
    // için oyuncu performansı (bu maçtaki tahmin sayısı) işlenir.
    this.stats.recordVsai(res === 'win', this.persona().id, {
      attempts: me.attempts,
      solved: me.solved,
    });

    // 📊 Anonim YZ maç sonucu — GERÇEK yarış sonucu + zorluk (tier) code alanında.
    // Zorluk kalibrasyonunun gerçek karşılığını görmek için (pano YZ bölümü).
    this.telemetry.gameEnd({
      mode: 'vsai',
      lang: this.i18n.lang(),
      wlen: [...this.word()].length,
      word: this.word(),
      result: res === 'win' ? 'won' : 'lost', // beraberlik de "kazanmadı"
      attempts: me.attempts,
      duration_ms: me.timeMs,
      code: this.persona().tier, // zorluk seviyesi
    });

    const b = res === 'win' ? PERSONA_BONUS[this.persona().tier] : 0;
    if (b) this.gold.earn(b);
    this.bonus.set(b);
    this.myResult.set(me);
    this.aiResult.set(ai);
    this.turn.set('you');
    this.phase.set('result');
    this.safeSfx(res === 'win' ? 'win' : res === 'lose' ? 'lose' : 'key');
  }

  protected again(): void {
    this.start(this.persona());
  }
  protected toPick(): void {
    this.clearThink();
    this.clearTaunt();
    this.phase.set('pick');
  }
  protected exit(): void {
    this.clearThink();
    this.clearTaunt();
    this.back.emit();
  }

  /** Karakterin "düşünme" süresi (ms) — kısa, tempo hissi verir (config'ten). */
  private thinkDelay(): number {
    const c = this.persona().config;
    return Math.round(c.minMs + Math.random() * (c.maxMs - c.minMs));
  }

  private clearThink(): void {
    if (this.thinkTimer) {
      clearTimeout(this.thinkTimer);
      this.thinkTimer = null;
    }
    this.aiThinking.set(false);
  }
  private clearTaunt(): void {
    if (this.tauntTimer) {
      clearTimeout(this.tauntTimer);
      this.tauntTimer = null;
    }
    this.taunt.set('');
  }

  ngOnDestroy(): void {
    this.clearThink();
    this.clearTaunt();
  }

  // --- sonuç ekranı yardımcıları ---

  protected clock(ms: number): string {
    if (!isFinite(ms) || ms >= Number.MAX_SAFE_INTEGER) return '—';
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  private safeSfx(name: string): void {
    try {
      (this.audio as unknown as { sfx: (n: string) => void }).sfx(name);
    } catch {
      /* ses kapalıysa sessiz geç */
    }
  }
}

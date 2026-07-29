import { AiConfig } from './ai-opponent';

/**
 * ===========================================================================
 * 🤖 BOT KARAKTERLERİ — YZ rakip galerisi (KAYIT DEFTERİ)
 *
 * Her karakterin AYRI bir stratejisi vardır (AiConfig ile ifade edilir) → aynı
 * kelimede farklı açılış/oynayış izlerler. Oyuncu "Zor"u değil, "Temkinli'yi
 * yenmeyi" hedefler. Ortalama tahmin sayıları ölçümle doğrulanır
 * (scripts/vsai-persona-test.mjs) ve arayüzde gösterilir.
 *
 * YENİ KARAKTER EKLEMEK:
 *   1. Buraya bir satır ekle (id, ad/desc i18n anahtarı, avatar, tier, config).
 *   2. messages.ts'e persona.<id>.name/desc + laf atma metinlerini (tr/en) ekle.
 *   3. Ölçüm betiğini çalıştır, avgGuesses'i güncelle.
 *   Bitti — seçim ekranı, istatistik ve profil kendiliğinden uyar.
 * ===========================================================================
 */
// 'adaptive' = "Bana uygun rakip" sözde-karakteri (PERSONAS listesinde YOK, çalışma
// zamanında oyuncu seviyesine göre üretilir — bkz. VsaiScreen.adaptivePersona).
export type PersonaId = 'temkinli' | 'unlu' | 'harfsayar' | 'kumarbaz' | 'adaptive';

export interface Persona {
  id: PersonaId;
  /** i18n: 'persona.<id>.name' · 'persona.<id>.desc' */
  nameKey: string;
  descKey: string;
  avatar: string;
  /** Gösterim zorluk etiketi + YZ'yi yenme altın bonusu bunun üstünden. */
  tier: 'easy' | 'medium' | 'hard';
  /** Stratejiyi çözücüye taşıyan parametreler. */
  config: AiConfig;
  /** ÖLÇÜLEN ortalama tahmin (5 harfli TR havuz) — arayüzde gösterilir. */
  avgGuesses: number;
  /** İleride mağazadan açılacak karakterler için altyapı (şimdilik hepsi açık). */
  locked?: boolean;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: 'temkinli',
    nameKey: 'persona.temkinli.name',
    descKey: 'persona.temkinli.desc',
    avatar: '🛡️',
    tier: 'hard',
    // Hep en güvenli (en çok eleyen) tahmin → riske girmez, istikrarlı, güçlü.
    config: { minMs: 1900, maxMs: 2900, topK: 1 },
    avgGuesses: 2.7, // ölçüldü: scripts/vsai-persona-test.mjs
  },
  {
    id: 'unlu',
    nameKey: 'persona.unlu.name',
    descKey: 'persona.unlu.desc',
    avatar: '🎯',
    tier: 'medium',
    // Açılışta ünlü yoğun kelime, sonra hızlı daraltır (topK küçük).
    config: { minMs: 1600, maxMs: 2500, topK: 4, bias: 'vowel', openerBias: true },
    avgGuesses: 2.87,
  },
  {
    id: 'harfsayar',
    nameKey: 'persona.harfsayar.name',
    descKey: 'persona.harfsayar.desc',
    avatar: '🔢',
    tier: 'medium',
    // Sık kullanılan harfleri önceliklendirir (tüm turlarda) → biraz daha zayıf.
    config: { minMs: 2100, maxMs: 3100, topK: 3, bias: 'frequent', openerBias: true, biasWeight: 2.5 },
    avgGuesses: 2.96,
  },
  {
    id: 'kumarbaz',
    nameKey: 'persona.kumarbaz.name',
    descKey: 'persona.kumarbaz.desc',
    avatar: '🎲',
    tier: 'easy',
    // Erken turda doğrudan cevabı dener: tutarsa çok hızlı, tutmazsa tur harcar (değişken).
    config: { minMs: 900, maxMs: 1700, topK: 24, gamble: 0.5 },
    avgGuesses: 3.06,
  },
];

const BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

/** id → karakter (bulunamazsa ilk karakter). */
export function persona(id: PersonaId): Persona {
  return BY_ID.get(id) ?? PERSONAS[0];
}

/** Karaktere göre YZ'yi yenme altın bonusu (tier üstünden). */
export const PERSONA_BONUS: Record<Persona['tier'], number> = { easy: 10, medium: 20, hard: 35 };

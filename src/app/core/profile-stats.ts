import { Stats } from '../models/game.model';
import { Lang } from './lang';

/**
 * ===========================================================================
 * PROFİL İSTATİSTİK KAYIT DEFTERİ
 *
 * Profil sayfasındaki kartlar bu listeden çizilir — şablonda tek tek yazılmaz.
 *
 * YENİ BİR İSTATİSTİK EKLEMEK:
 *   1. Gerekiyorsa Stats'a alanı ekle (models/game.model.ts + EMPTY_STATS)
 *   2. Buraya bir kayıt ekle
 *   Bitti. Profil sayfası, boş durumu, testler — hepsi kendiliğinden uyar.
 *
 * Türetilmiş istatistikler (kazanma oranı gibi) Stats'ta ALAN TUTMAZ; burada
 * hesaplanır. Aynı sayıyı iki yerde saklamak, ikisinin ayrışması demektir.
 * ===========================================================================
 */
export interface ProfileStat {
  /** Kararlı kimlik — testler ve gelecekteki sıralama/gizleme için. */
  key: string;
  icon: string;
  label: string;
  /** Kartın altındaki küçük açıklama (isteğe bağlı). */
  hint?: string;
  /** Ekranda gösterilecek değer (aktif dile göre biçimlenir). */
  value: (s: Stats, lang?: Lang) => string;
}

/** Sayıyı aktif dilin binlik ayracıyla biçimler (tr/de: 1.000 · en: 1,000). */
const fmt = (n: number, lang: Lang = 'tr') =>
  n.toLocaleString(lang === 'en' ? 'en' : lang === 'de' ? 'de' : 'tr');

/** Yüzdeyi dile göre biçimler (tr: %89 · en/de: 89%). */
const pct = (r: number, lang: Lang = 'tr') => (lang === 'tr' ? `%${r}` : `${r}%`);

/** Kazanma oranı — yüzde işareti dile göre konumlanır (tr: %89 · en: 89%). */
const rate = (s: Stats, lang: Lang = 'tr') =>
  pct(s.played === 0 ? 0 : Math.round((s.won / s.played) * 100), lang);

/** YZ'ye karşı kazanma oranı — 0/0 durumunda NaN değil %0. */
const vsaiRate = (s: Stats, lang: Lang = 'tr') =>
  pct(s.vsaiPlayed === 0 ? 0 : Math.round((s.vsaiWon / s.vsaiPlayed) * 100), lang);

export const PROFILE_STATS: readonly ProfileStat[] = [
  {
    key: 'played',
    icon: '🎮',
    label: 'Oynanan oyun',
    value: (s, lang) => fmt(s.played, lang),
  },
  {
    key: 'winRate',
    icon: '🎯',
    label: 'Kazanma oranı',
    // Türetilmiş: Stats'ta saklanmaz, buradan hesaplanır.
    value: (s, lang) => rate(s, lang),
  },
  {
    key: 'wordsFound',
    icon: '🔍',
    label: 'Bulunan kelime',
    hint: 'Gizli kelimeyi bulduğun oyunlar',
    // Bulunan kelime = kazanılan oyun. Ayrı alan tutmuyorum; aynı sayıyı iki
    // yerde saklamak ikisinin zamanla ayrışması demek olurdu.
    value: (s, lang) => fmt(s.won, lang),
  },
  {
    key: 'maxStreak',
    icon: '🏆',
    label: 'En uzun seri',
    value: (s, lang) => fmt(s.maxStreak, lang),
  },
  {
    key: 'currentStreak',
    icon: '🔥',
    label: 'Güncel seri',
    value: (s, lang) => fmt(s.currentStreak, lang),
  },
  {
    key: 'points',
    icon: '⭐',
    label: 'Toplam puan',
    hint: 'Hızlı bulmak ve seri yapmak puan kazandırır',
    value: (s, lang) => fmt(s.points, lang),
  },
  {
    key: 'guesses',
    icon: '⌨️',
    label: 'Yazılan kelime',
    hint: 'Tahtaya girdiğin geçerli kelimeler',
    value: (s, lang) => fmt(s.guesses, lang),
  },
  {
    key: 'vsaiPlayed',
    icon: '🤖',
    label: 'YZ maçları',
    hint: 'Yapay zekâya karşı oynanan maçlar (ana ilerlemeyi etkilemez)',
    value: (s, lang) => fmt(s.vsaiPlayed, lang),
  },
  {
    key: 'vsaiWinRate',
    icon: '🏅',
    label: 'YZ galibiyet oranı',
    // Türetilmiş: Stats'ta saklanmaz, vsaiWon/vsaiPlayed'den hesaplanır.
    value: (s, lang) => vsaiRate(s, lang),
  },
  {
    // 🆘 Şeffaflık sayacı: kaç kez "Takıldım" YZ ipucu alındı (galibiyeti BOZMAZ).
    key: 'aiHintsUsed',
    icon: '🆘',
    label: 'Alınan YZ ipucu',
    value: (s, lang) => fmt(s.aiHintsUsed, lang),
  },
];

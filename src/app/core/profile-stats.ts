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

/** Sayıyı aktif dilin binlik ayracıyla biçimler (tr: 1.000 · en: 1,000). */
const fmt = (n: number, lang: Lang = 'tr') => n.toLocaleString(lang === 'en' ? 'en' : 'tr');

/** Kazanma oranı — yüzde işareti dile göre konumlanır (tr: %89 · en: 89%). */
const rate = (s: Stats, lang: Lang = 'tr') => {
  const r = s.played === 0 ? 0 : Math.round((s.won / s.played) * 100);
  return lang === 'en' ? `${r}%` : `%${r}`;
};

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
];

import { Stats } from '../models/game.model';

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
  /** Ekranda gösterilecek değer. */
  value: (s: Stats) => string;
}

const tr = (n: number) => n.toLocaleString('tr');

export const PROFILE_STATS: readonly ProfileStat[] = [
  {
    key: 'played',
    icon: '🎮',
    label: 'Oynanan oyun',
    value: (s) => tr(s.played),
  },
  {
    key: 'winRate',
    icon: '🎯',
    label: 'Kazanma oranı',
    // Türetilmiş: Stats'ta saklanmaz, buradan hesaplanır.
    value: (s) => (s.played === 0 ? '%0' : `%${Math.round((s.won / s.played) * 100)}`),
  },
  {
    key: 'wordsFound',
    icon: '🔍',
    label: 'Bulunan kelime',
    hint: 'Gizli kelimeyi bulduğun oyunlar',
    // Bulunan kelime = kazanılan oyun. Ayrı alan tutmuyorum; aynı sayıyı iki
    // yerde saklamak ikisinin zamanla ayrışması demek olurdu.
    value: (s) => tr(s.won),
  },
  {
    key: 'maxStreak',
    icon: '🏆',
    label: 'En uzun seri',
    value: (s) => tr(s.maxStreak),
  },
  {
    key: 'currentStreak',
    icon: '🔥',
    label: 'Güncel seri',
    value: (s) => tr(s.currentStreak),
  },
  {
    key: 'points',
    icon: '⭐',
    label: 'Toplam puan',
    hint: 'Hızlı bulmak ve seri yapmak puan kazandırır',
    value: (s) => tr(s.points),
  },
  {
    key: 'guesses',
    icon: '⌨️',
    label: 'Yazılan kelime',
    hint: 'Tahtaya girdiğin geçerli kelimeler',
    value: (s) => tr(s.guesses),
  },
];

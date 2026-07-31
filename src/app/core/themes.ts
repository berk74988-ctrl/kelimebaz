/**
 * TEMA MODU — tema listesi (metadata) ve ödül yapılandırması. Saf, Angular'sız.
 *
 * Kelime SETLERİ ayrı JSON'da (src/app/data/themes-{tr,en}.json, tembel yüklenir).
 * Burada yalnız her temanın kimliği + ikon/renk + ödülü var. Yeni tema eklemek:
 * buraya bir satır + build-themes.mjs'e aday listesi + i18n theme.<id> anahtarı.
 */
export interface ThemeMeta {
  id: string;
  icon: string;
  color: string;
}

export const THEMES: readonly ThemeMeta[] = [
  { id: 'kitchen', icon: '🍳', color: '#e8894a' },
  { id: 'nature', icon: '🌿', color: '#4caf82' },
  { id: 'sport', icon: '⚽', color: '#4aa3ff' },
  { id: 'music', icon: '🎵', color: '#c084fc' },
  { id: 'health', icon: '🏥', color: '#ef5f6b' },
  { id: 'transport', icon: '🚗', color: '#f0a92e' },
  { id: 'emotions', icon: '😊', color: '#f6c445' },
  { id: 'history', icon: '🏛️', color: '#b0895f' },
];

/** Bir tema tamamlanınca verilen altın (bir kez). */
export const THEME_REWARD_GOLD = 150;

/** TÜM temalar (aktif dilde) tamamlanınca verilen özel rozet (envanterde). */
export const THEME_MASTER_BADGE = 'badge.themeMaster';

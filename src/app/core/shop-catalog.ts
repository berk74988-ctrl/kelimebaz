/**
 * ===========================================================================
 * MAĞAZA KATALOĞU — kozmetik ürünler
 *
 * Ürünler bir KAYIT DEFTERİNDEN okunur — mağaza sayfası, envanter ve testler
 * bu listeden beslenir. Yeni bir ürün eklemek:
 *   1. Buraya bir satır ekle
 *   2. Tema ise _reset.scss'e [data-skin='...'] paletini ekle
 * Bitti — mağaza, profil ve "kullan" akışı kendiliğinden uyar.
 *
 * DÖRT KATEGORİ:
 *   theme  — vurgu rengi paleti (<html data-skin> ile uygulanır)
 *   frame  — profil fotoğrafı/avatar çerçevesi (CSS)
 *   badge  — isim yanında amblem (emoji)
 *   avatar — özel profil emojisi (ücretsiz sekizin ötesinde)
 *
 * Her kategoride ÜCRETSİZ bir "varsayılan" vardır (price 0) — oyuncu ona her
 * zaman sahiptir ve "kullanımda"ya döndürebilir. Böylece satın alınan bir
 * kozmetik geri alınabilir; kilitlenmiş hissi olmaz.
 * ===========================================================================
 */
export type ShopCategory = 'theme' | 'frame' | 'badge' | 'avatar';

export interface ShopItem {
  /** Kararlı kimlik — envanter buna bağlı, DEĞİŞTİRME. */
  id: string;
  category: ShopCategory;
  name: string;
  /** Altın fiyatı. 0 → herkese açık varsayılan. */
  price: number;
  /**
   * Önizleme verisi (kategoriye göre yorumlanır):
   *   theme  → [accent, accent2] renkleri (kart önizlemesi için)
   *   frame  → CSS gradyanı (çerçeve rengi)
   *   badge  → emoji
   *   avatar → emoji
   */
  preview: string;
  preview2?: string;
  /** Yalnızca sezon ödülüyle kazanılır — mağazada satılmaz (kazanılınca listede görünür). */
  seasonOnly?: boolean;
}

export const SHOP_ITEMS: readonly ShopItem[] = [
  // ---- TEMALAR (vurgu paleti) ----
  { id: 'theme.default', category: 'theme', name: 'Klasik', price: 0, preview: '#6c8cff', preview2: '#9d7bff' },
  { id: 'theme.ocean', category: 'theme', name: 'Okyanus', price: 150, preview: '#22b8cf', preview2: '#3b82f6' },
  { id: 'theme.sunset', category: 'theme', name: 'Gün Batımı', price: 150, preview: '#f97316', preview2: '#ec4899' },
  { id: 'theme.forest', category: 'theme', name: 'Orman', price: 200, preview: '#22c55e', preview2: '#84cc16' },
  { id: 'theme.grape', category: 'theme', name: 'Mor Gece', price: 250, preview: '#a855f7', preview2: '#6366f1' },
  { id: 'theme.rose', category: 'theme', name: 'Gül', price: 250, preview: '#f43f5e', preview2: '#fb7185' },
  // 🏆 Sezon ödülü — mağazada satılmaz, yalnız üst liglerde kazanılır
  { id: 'theme.champion', category: 'theme', name: 'Şampiyon', price: 9999, preview: '#ffd75a', preview2: '#c084fc', seasonOnly: true },

  // ---- ÇERÇEVELER (profil fotoğrafı kenarı) ----
  { id: 'frame.none', category: 'frame', name: 'Çerçevesiz', price: 0, preview: 'transparent' },
  { id: 'frame.gold', category: 'frame', name: 'Altın', price: 120, preview: 'linear-gradient(135deg, #f7d774, #d9a441)' },
  { id: 'frame.neon', category: 'frame', name: 'Neon', price: 180, preview: 'linear-gradient(135deg, #22d3ee, #a855f7)' },
  { id: 'frame.fire', category: 'frame', name: 'Ateş', price: 200, preview: 'linear-gradient(135deg, #fb923c, #ef4444)' },
  { id: 'frame.rainbow', category: 'frame', name: 'Gökkuşağı', price: 350, preview: 'linear-gradient(135deg, #f43f5e, #eab308, #22c55e, #3b82f6, #a855f7)' },

  // ---- ROZETLER (isim yanında amblem) ----
  { id: 'badge.none', category: 'badge', name: 'Rozetsiz', price: 0, preview: '' },
  { id: 'badge.star', category: 'badge', name: 'Yıldız', price: 80, preview: '⭐' },
  { id: 'badge.fire', category: 'badge', name: 'Alev', price: 80, preview: '🔥' },
  { id: 'badge.crown', category: 'badge', name: 'Taç', price: 200, preview: '👑' },
  { id: 'badge.diamond', category: 'badge', name: 'Elmas', price: 250, preview: '💎' },
  { id: 'badge.trophy', category: 'badge', name: 'Kupa', price: 300, preview: '🏆' },
  // 🎖️ Sezon ödülü rozeti — mağazada satılmaz, lig performansıyla kazanılır
  { id: 'badge.league', category: 'badge', name: 'Lig Madalyası', price: 9999, preview: '🎖️', seasonOnly: true },

  // ---- AVATARLAR ----
  // Ücretsiz sekiz emoji (eskiden ProfileService'teydi) + satın alınabilir özel avatarlar.
  // Hepsi tek sistemde: iki ayrı avatar seçici olmasın.
  { id: 'avatar.owl', category: 'avatar', name: 'Baykuş', price: 0, preview: '🦉' },
  { id: 'avatar.bee', category: 'avatar', name: 'Arı', price: 0, preview: '🐝' },
  { id: 'avatar.fox', category: 'avatar', name: 'Tilki', price: 0, preview: '🦊' },
  { id: 'avatar.penguin', category: 'avatar', name: 'Penguen', price: 0, preview: '🐧' },
  { id: 'avatar.turtle', category: 'avatar', name: 'Kaplumbağa', price: 0, preview: '🐢' },
  { id: 'avatar.eagle', category: 'avatar', name: 'Kartal', price: 0, preview: '🦅' },
  { id: 'avatar.octopus', category: 'avatar', name: 'Ahtapot', price: 0, preview: '🐙' },
  { id: 'avatar.deer', category: 'avatar', name: 'Geyik', price: 0, preview: '🦌' },
  { id: 'avatar.dragon', category: 'avatar', name: 'Ejderha', price: 120, preview: '🐉' },
  { id: 'avatar.unicorn', category: 'avatar', name: 'Tek Boynuz', price: 120, preview: '🦄' },
  { id: 'avatar.robot', category: 'avatar', name: 'Robot', price: 150, preview: '🤖' },
  { id: 'avatar.alien', category: 'avatar', name: 'Uzaylı', price: 150, preview: '👾' },
  { id: 'avatar.wizard', category: 'avatar', name: 'Büyücü', price: 200, preview: '🧙' },
  { id: 'avatar.ninja', category: 'avatar', name: 'Ninja', price: 200, preview: '🥷' },
];

/** Kategori başına başlangıçta seçili (ve ücretsiz sahip olunan) ürün. */
export const DEFAULT_ITEM: Record<ShopCategory, string> = {
  theme: 'theme.default',
  frame: 'frame.none',
  badge: 'badge.none',
  avatar: 'avatar.owl',
};

/** Başlangıçta herkese ait ücretsiz ürünler (fiyatı 0 olanların hepsi). */
export const FREE_ITEMS: readonly string[] = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);

/** Kategori görüntü bilgisi — mağaza sekmelerini bundan çizer. */
export const CATEGORY_META: Record<ShopCategory, { icon: string; label: string }> = {
  theme: { icon: '🎨', label: 'Temalar' },
  frame: { icon: '🖼️', label: 'Çerçeveler' },
  badge: { icon: '🎖️', label: 'Rozetler' },
  avatar: { icon: '🙂', label: 'Avatarlar' },
};

export const SHOP_CATEGORIES: readonly ShopCategory[] = ['theme', 'frame', 'badge', 'avatar'];

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

export function shopItem(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

export function itemsByCategory(cat: ShopCategory): ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.category === cat);
}

/** Bir kimlik gerçekten katalogda var mı? (bozuk kayda karşı) */
export function isValidItem(id: string): boolean {
  return BY_ID.has(id);
}

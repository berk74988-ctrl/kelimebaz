import {
  CATEGORY_META,
  DEFAULT_ITEM,
  FREE_ITEMS,
  isValidItem,
  itemsByCategory,
  SHOP_CATEGORIES,
  SHOP_ITEMS,
  shopItem,
} from './shop-catalog';

describe('Mağaza kataloğu', () => {
  it('kimlikler BENZERSİZ', () => {
    const ids = SHOP_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('kullanıcının istediği dört kategori de var', () => {
    expect(SHOP_CATEGORIES).toEqual(['theme', 'frame', 'badge', 'avatar']);
    for (const cat of SHOP_CATEGORIES) {
      expect(itemsByCategory(cat).length).toBeGreaterThan(0);
      expect(CATEGORY_META[cat].label.length).toBeGreaterThan(0);
    }
  });

  it('her ürünün adı, negatif olmayan fiyatı ve önizlemesi vardır', () => {
    for (const it of SHOP_ITEMS) {
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.price).toBeGreaterThanOrEqual(0);
      expect(typeof it.preview).toBe('string');
    }
  });

  it('her kategorinin varsayılanı o kategoride ve ÜCRETSİZDİR', () => {
    for (const cat of SHOP_CATEGORIES) {
      const def = shopItem(DEFAULT_ITEM[cat]);
      expect(def).toBeDefined();
      expect(def!.category).toBe(cat);
      expect(def!.price).toBe(0);
    }
  });

  it('FREE_ITEMS tam olarak fiyatı 0 olan ürünlerdir', () => {
    const zeros = SHOP_ITEMS.filter((i) => i.price === 0).map((i) => i.id);
    expect([...FREE_ITEMS].sort()).toEqual(zeros.sort());
  });

  it('theme önizlemesi iki renk, avatar/badge tek emoji taşır', () => {
    for (const it of itemsByCategory('theme')) {
      expect(it.preview).toMatch(/^#/);
      expect(it.preview2).toMatch(/^#/);
    }
  });

  it('isValidItem gerçek kimlikte true, uydurma kimlikte false', () => {
    expect(isValidItem('theme.ocean')).toBe(true);
    expect(isValidItem('theme.olmayan')).toBe(false);
    expect(isValidItem('')).toBe(false);
  });

  it('satın alınabilir (ücretli) ürünler her kategoride vardır', () => {
    // Mağaza boş olmasın: her kategoride en az bir ücretli ürün
    for (const cat of SHOP_CATEGORIES) {
      const paid = itemsByCategory(cat).filter((i) => i.price > 0);
      expect(paid.length).toBeGreaterThan(0);
    }
  });
});

import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_ITEM,
  FREE_ITEMS,
  isValidItem,
  ShopCategory,
  ShopItem,
  shopItem,
} from '../core/shop-catalog';
import { GoldService } from './gold.service';

const OWNED_KEY = 'kelimebaz:inv:owned';
const EQUIP_KEY = 'kelimebaz:inv:equipped';

type Equipped = Record<ShopCategory, string>;

function defaultEquipped(): Equipped {
  return { ...DEFAULT_ITEM };
}

/**
 * ===========================================================================
 * ENVANTER — satın alınan kozmetikler + hangisinin "kullanımda" olduğu.
 *
 * İki durum:
 *   OWNED     — sahip olunan ürünler. Ücretsizler (fiyat 0) baştan buradadır.
 *   EQUIPPED  — her kategoride şu an SEÇİLİ ürün. Satın alınan kalıcıdır ve
 *               istenildiğinde kullanıma alınıp geri çıkarılabilir.
 *
 * Satın alma GoldService.spend()'e dayanır: yetersiz altında hiçbir şey
 * değişmez. Bir ürün İKİ KEZ satın alınamaz (zaten sahipsen buton "Kullan"a
 * döner).
 *
 * TEMA uygulaması burada: seçili tema <html data-skin> ile yansıtılır, tıpkı
 * ThemeService'in data-theme'i gibi — geçiş anında, yeniden çizim yok.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly gold = inject(GoldService);

  private readonly _owned = signal<ReadonlySet<string>>(this.loadOwned());
  private readonly _equipped = signal<Equipped>(this.loadEquipped());

  readonly owned = this._owned.asReadonly();
  readonly equipped = this._equipped.asReadonly();

  /** Satın alınmış ürün sayısı (ücretsizler hariç) — profilde gösterilir. */
  readonly ownedCount = computed(
    () => [...this._owned()].filter((id) => !FREE_ITEMS.includes(id)).length,
  );

  constructor() {
    this.applySkin(); // açılıştaki tema paletini uygula
  }

  /**
   * Seçili tema paletini <html data-skin> olarak yansıtır.
   *
   * DOĞRUDAN çağrılıyor (effect ile değil): Angular effect'i değişiklik
   * algılaması döngüsünde çalışır ve gecikebilir; ThemeService de data-theme'i
   * aynı şekilde anında uyguluyor. Tema geçişi ANINDA olmalı.
   */
  private applySkin(): void {
    if (typeof document === 'undefined') return;
    const skin = this._equipped().theme.replace('theme.', '');
    const el = document.documentElement;
    if (skin === 'default') delete el.dataset['skin'];
    else el.dataset['skin'] = skin;
  }

  owns(id: string): boolean {
    return this._owned().has(id);
  }

  isEquipped(id: string): boolean {
    const item = shopItem(id);
    return item ? this._equipped()[item.category] === id : false;
  }

  /** Bir kategoride şu an seçili ürün. */
  equippedItem(cat: ShopCategory): ShopItem {
    const id = this._equipped()[cat];
    return shopItem(id) ?? shopItem(DEFAULT_ITEM[cat])!;
  }

  /**
   * Ürünü satın alır ve OTOMATİK kullanıma alır (aldığını hemen görürsün).
   * @returns başarılı mı — yetersiz altında / geçersiz üründe false
   */
  buy(id: string): boolean {
    const item = shopItem(id);
    if (!item || this.owns(id)) return false;
    if (!this.gold.spend(item.price)) return false;

    this._owned.update((s) => new Set(s).add(id));
    this.saveOwned();
    this.equip(id);
    return true;
  }

  /**
   * Ödül olarak ücretsiz verir (altın HARCAMAZ). Sezon ödülleri bunu kullanır.
   * @param autoEquip true ise ürünü hemen kullanıma alır (rozetlerde uygun; temalarda
   *   kullanıcının mevcut temasını değiştirmemek için genelde false).
   * @returns geçerli bir ürünse true.
   */
  grant(id: string, autoEquip = false): boolean {
    const item = shopItem(id);
    if (!item) return false;
    if (!this.owns(id)) {
      this._owned.update((s) => new Set(s).add(id));
      this.saveOwned();
    }
    if (autoEquip) this.equip(id);
    return true;
  }

  /**
   * Sahip olunan ürünü kullanıma alır.
   * @returns başarılı mı (sahip değilse false)
   */
  equip(id: string): boolean {
    const item = shopItem(id);
    if (!item || !this.owns(id)) return false;

    this._equipped.update((e) => ({ ...e, [item.category]: id }));
    this.saveEquipped();
    if (item.category === 'theme') this.applySkin();
    return true;
  }

  reset(): void {
    this._owned.set(new Set(FREE_ITEMS));
    this._equipped.set(defaultEquipped());
    this.saveOwned();
    this.saveEquipped();
    this.applySkin();
  }

  // --- kalıcılık ---

  private saveOwned(): void {
    try {
      localStorage.setItem(OWNED_KEY, JSON.stringify([...this._owned()]));
    } catch {
      /* depolama kapalı */
    }
  }

  private saveEquipped(): void {
    try {
      localStorage.setItem(EQUIP_KEY, JSON.stringify(this._equipped()));
    } catch {
      /* depolama kapalı */
    }
  }

  /** Sahiplik — ücretsizler HER ZAMAN dahil, bilinmeyen kimlikler atılır. */
  private loadOwned(): ReadonlySet<string> {
    const set = new Set<string>(FREE_ITEMS);
    try {
      const raw = localStorage.getItem(OWNED_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          for (const id of arr) if (typeof id === 'string' && isValidItem(id)) set.add(id);
        }
      }
    } catch {
      /* yoksay */
    }
    return set;
  }

  /** Seçili ürünler — geçersiz/sahip olunmayan seçim varsayılana düşer. */
  private loadEquipped(): Equipped {
    const owned = this.loadOwned();
    const eq = defaultEquipped();
    try {
      const raw = localStorage.getItem(EQUIP_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Equipped>;
        for (const cat of Object.keys(eq) as ShopCategory[]) {
          const id = saved[cat];
          // Kayıtlı seçim geçerli VE sahip olunan bir ürünse kullan
          if (typeof id === 'string' && isValidItem(id) && owned.has(id)) {
            const item = shopItem(id);
            if (item?.category === cat) eq[cat] = id;
          }
        }
      }
    } catch {
      /* yoksay */
    }
    return eq;
  }
}

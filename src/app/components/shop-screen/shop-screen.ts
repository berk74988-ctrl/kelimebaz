import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import {
  CATEGORY_META,
  itemsByCategory,
  SHOP_CATEGORIES,
  ShopCategory,
  ShopItem,
} from '../../core/shop-catalog';
import { GoldService } from '../../services/gold.service';
import { InventoryService } from '../../services/inventory.service';

/** Bir ürünün mağazadaki durumu. */
type ItemState = 'equipped' | 'owned' | 'buyable' | 'locked';

/**
 * 🛒 MAĞAZA SAYFASI — tam ekran.
 *
 * Ürünler katalogdan (core/shop-catalog.ts) çizilir; sekmeler kategorilerden.
 * Satın alma/kullanma tamamen InventoryService'e devredilir — bu bileşen
 * yalnızca gösterir ve tıklamayı iletir.
 */
@Component({
  selector: 'app-shop-screen',
  imports: [],
  templateUrl: './shop-screen.html',
  styleUrl: './shop-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShopScreen {
  protected readonly gold = inject(GoldService);
  protected readonly inventory = inject(InventoryService);

  readonly back = output<void>();

  protected readonly categories = SHOP_CATEGORIES;
  protected readonly meta = CATEGORY_META;

  protected readonly activeCat = signal<ShopCategory>('theme');

  /** Kısa süreli geri bildirim: "satın alındı" / "yetersiz altın". */
  protected readonly flash = signal<{ id: string; ok: boolean } | null>(null);

  /** Seçili kategorideki ürünler. */
  protected readonly items = computed(() => itemsByCategory(this.activeCat()));

  protected state(item: ShopItem): ItemState {
    if (this.inventory.isEquipped(item.id)) return 'equipped';
    if (this.inventory.owns(item.id)) return 'owned';
    return this.gold.canAfford(item.price) ? 'buyable' : 'locked';
  }

  /** Kart tıklaması: sahip değilse satın al, sahipse kullan. */
  protected onItem(item: ShopItem): void {
    if (this.inventory.owns(item.id)) {
      this.inventory.equip(item.id);
      return;
    }

    const ok = this.inventory.buy(item.id);
    this.flash.set({ id: item.id, ok });
    setTimeout(() => {
      if (this.flash()?.id === item.id) this.flash.set(null);
    }, 1600);
  }

  protected isThemePreview(item: ShopItem): boolean {
    return item.category === 'theme' || item.category === 'frame';
  }
}

import { TestBed } from '@angular/core/testing';
import { FREE_ITEMS } from '../core/shop-catalog';
import { GoldService } from './gold.service';
import { InventoryService } from './inventory.service';

describe('InventoryService — envanter ve satın alma', () => {
  function fresh(): { inv: InventoryService; gold: GoldService } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return { inv: TestBed.inject(InventoryService), gold: TestBed.inject(GoldService) };
  }

  let inv: InventoryService;
  let gold: GoldService;

  beforeEach(() => {
    localStorage.clear();
    ({ inv, gold } = fresh());
  });

  describe('başlangıç', () => {
    it('ücretsiz ürünler baştan sahiptir', () => {
      for (const id of FREE_ITEMS) expect(inv.owns(id)).toBe(true);
    });

    it('ücretli ürünler baştan sahip DEĞİLDİR', () => {
      expect(inv.owns('theme.ocean')).toBe(false);
      expect(inv.ownedCount()).toBe(0); // ücretsizler sayılmaz
    });

    it('her kategoride varsayılan kullanımdadır', () => {
      expect(inv.equippedItem('theme').id).toBe('theme.default');
      expect(inv.equippedItem('frame').id).toBe('frame.none');
      expect(inv.equippedItem('badge').id).toBe('badge.none');
    });
  });

  describe('satın alma', () => {
    it('yeterli altında satın alınır, altın düşer, KULLANIMA alınır', () => {
      gold.earn(200);

      expect(inv.buy('theme.ocean')).toBe(true); // 150
      expect(inv.owns('theme.ocean')).toBe(true);
      expect(gold.balance()).toBe(50);
      expect(inv.isEquipped('theme.ocean')).toBe(true); // otomatik kullanıma alındı
    });

    it('YETERSİZ altında satın alınmaz, hiçbir şey değişmez', () => {
      gold.earn(50);

      expect(inv.buy('theme.grape')).toBe(false); // 250
      expect(inv.owns('theme.grape')).toBe(false);
      expect(gold.balance()).toBe(50); // dokunulmadı
    });

    it('aynı ürün İKİ KEZ satın alınamaz', () => {
      gold.earn(500);
      inv.buy('badge.crown'); // 200

      const kalan = gold.balance();
      expect(inv.buy('badge.crown')).toBe(false); // zaten sahip
      expect(gold.balance()).toBe(kalan); // ikinci kez ödeme yok
    });

    it('geçersiz ürün satın alınamaz', () => {
      gold.earn(999);
      expect(inv.buy('theme.uydurma')).toBe(false);
    });
  });

  describe('kullanma (equip)', () => {
    it('sahip olunan ürün kullanıma alınır', () => {
      gold.earn(300);
      inv.buy('frame.gold'); // otomatik kullanımda
      inv.equip('frame.none'); // varsayılana dön

      expect(inv.isEquipped('frame.none')).toBe(true);
      expect(inv.isEquipped('frame.gold')).toBe(false);

      inv.equip('frame.gold'); // tekrar tak
      expect(inv.isEquipped('frame.gold')).toBe(true);
    });

    it('SAHİP OLUNMAYAN ürün kullanıma alınamaz', () => {
      expect(inv.equip('avatar.dragon')).toBe(false);
      expect(inv.isEquipped('avatar.dragon')).toBe(false);
    });
  });

  describe('tema uygulaması', () => {
    it('tema kullanınca <html data-skin> güncellenir', () => {
      gold.earn(200);
      inv.buy('theme.ocean');
      expect(document.documentElement.dataset['skin']).toBe('ocean');

      inv.equip('theme.default');
      expect(document.documentElement.dataset['skin']).toBeUndefined(); // varsayılan → öznitelik yok
    });
  });

  describe('kalıcılık', () => {
    it('satın alınan ve kullanılan ürünler sayfa yenilenince korunur', () => {
      gold.earn(400);
      inv.buy('theme.forest'); // 200
      inv.buy('badge.star'); // 80

      const { inv: reloaded } = fresh();

      expect(reloaded.owns('theme.forest')).toBe(true);
      expect(reloaded.owns('badge.star')).toBe(true);
      expect(reloaded.isEquipped('theme.forest')).toBe(true);
      expect(reloaded.ownedCount()).toBe(2);
    });

    it('bozuk kayıt çökertmez, ücretsizlerle başlar', () => {
      localStorage.setItem('kelimebaz:inv:owned', '{bozuk');
      localStorage.setItem('kelimebaz:inv:equipped', 'yok');

      const { inv: r } = fresh();

      expect(r.owns(FREE_ITEMS[0])).toBe(true);
      expect(r.equippedItem('theme').id).toBe('theme.default');
    });

    it('SAHİP OLUNMAYAN bir seçim kayıtta varsa varsayılana düşer', () => {
      // Elle kurcalanmış kayıt: sahip olmadığı temayı "kullanımda" göstermeye çalışıyor
      localStorage.setItem('kelimebaz:inv:owned', JSON.stringify(FREE_ITEMS));
      localStorage.setItem('kelimebaz:inv:equipped', JSON.stringify({ theme: 'theme.grape' }));

      const { inv: r } = fresh();

      expect(r.equippedItem('theme').id).toBe('theme.default'); // sahip değil → varsayılan
    });

    it('bilinmeyen ürün kimliği sahiplikten atılır', () => {
      localStorage.setItem(
        'kelimebaz:inv:owned',
        JSON.stringify([...FREE_ITEMS, 'artik-olmayan-urun']),
      );

      const { inv: r } = fresh();

      expect(r.owns('artik-olmayan-urun')).toBe(false);
    });
  });
});

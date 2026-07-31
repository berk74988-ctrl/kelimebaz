import { TestBed } from '@angular/core/testing';
import { ImportError, PlayerDataService } from './player-data.service';

/**
 * Oyuncu verisi yedekleme — dışa/içe aktarma DAVRANIŞI.
 * (Gerçek dosya indirme/DOM test edilmez; toplama, doğrulama ve uygulama mantığı.)
 */
describe('PlayerDataService — yedekleme', () => {
  let svc: PlayerDataService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(PlayerDataService);
  });

  function seed(): void {
    localStorage.setItem('kelimebaz:gold', '250');
    localStorage.setItem('kelimebaz:stats', '{"played":40}');
    localStorage.setItem('kelimebaz:theme', 'dark');
    localStorage.setItem('baska:sey', 'dokunma'); // önekimiz değil → yedeğe girmez
  }

  describe('collect + buildBackup', () => {
    it('yalnızca kelimebaz:* anahtarlarını toplar', () => {
      seed();
      const data = svc.collect();
      expect(data['kelimebaz:gold']).toBe('250');
      expect(data['kelimebaz:stats']).toBe('{"played":40}');
      expect(data['kelimebaz:theme']).toBe('dark');
      expect('baska:sey' in data).toBe(false);
    });

    it('yedek sürüm, tarih ve veri içerir', () => {
      seed();
      const b = svc.buildBackup();
      expect(b.app).toBe('kelimebaz');
      expect(typeof b.version).toBe('number');
      expect(new Date(b.exportedAt).getTime()).toBeGreaterThan(0);
      expect(Object.keys(b.data).length).toBe(3);
    });
  });

  describe('parse — doğrulama', () => {
    it('geçerli yedeği ayrıştırır', () => {
      const text = JSON.stringify({
        app: 'kelimebaz',
        version: 1,
        exportedAt: '2026-07-31T00:00:00.000Z',
        data: { 'kelimebaz:gold': '99' },
      });
      const b = svc.parse(text);
      expect(b.data['kelimebaz:gold']).toBe('99');
    });

    it('bozuk JSON → invalidJson', () => {
      expect(() => svc.parse('{ bozuk')).toThrow(ImportError);
      try {
        svc.parse('{ bozuk');
      } catch (e) {
        expect((e as ImportError).code).toBe('invalidJson');
      }
    });

    it('Kelimebaz yedeği değil → notBackup', () => {
      const text = JSON.stringify({
        app: 'baskaoyun',
        version: 1,
        data: { 'kelimebaz:gold': '1' },
      });
      try {
        svc.parse(text);
        throw new Error('fırlatmalıydı');
      } catch (e) {
        expect((e as ImportError).code).toBe('notBackup');
      }
    });

    it('sürüm yoksa → notBackup', () => {
      const text = JSON.stringify({ app: 'kelimebaz', data: { 'kelimebaz:gold': '1' } });
      try {
        svc.parse(text);
        throw new Error('fırlatmalıydı');
      } catch (e) {
        expect((e as ImportError).code).toBe('notBackup');
      }
    });

    it('kelimebaz:* olmayan / string olmayan değerleri süzer', () => {
      const text = JSON.stringify({
        app: 'kelimebaz',
        version: 1,
        data: { 'kelimebaz:gold': '5', 'baska:sey': 'x', 'kelimebaz:kotu': 42 },
      });
      const b = svc.parse(text);
      expect(Object.keys(b.data)).toEqual(['kelimebaz:gold']);
    });

    it('süzme sonrası boşsa → empty', () => {
      const text = JSON.stringify({ app: 'kelimebaz', version: 1, data: { 'baska:sey': 'x' } });
      try {
        svc.parse(text);
        throw new Error('fırlatmalıydı');
      } catch (e) {
        expect((e as ImportError).code).toBe('empty');
      }
    });
  });

  describe('apply — üzerine yazma + eksik varsayılana düşme', () => {
    it('mevcut kelimebaz:* silinir, yedektekiler yazılır (birebir replika)', () => {
      // Mevcut durumda gold + eski bir anahtar var
      localStorage.setItem('kelimebaz:gold', '10');
      localStorage.setItem('kelimebaz:eski', 'kalmamali');
      localStorage.setItem('baska:sey', 'korunur');

      svc.apply({
        app: 'kelimebaz',
        version: 1,
        exportedAt: '',
        data: { 'kelimebaz:gold': '777', 'kelimebaz:yeni': 'geldi' },
      });

      expect(localStorage.getItem('kelimebaz:gold')).toBe('777');
      expect(localStorage.getItem('kelimebaz:yeni')).toBe('geldi');
      // Yedekte olmayan eski anahtar SİLİNDİ (→ servis varsayılanına düşer)
      expect(localStorage.getItem('kelimebaz:eski')).toBeNull();
      // Önekimiz dışındaki veriye dokunulmaz
      expect(localStorage.getItem('baska:sey')).toBe('korunur');
    });

    it('eski sürüm yedeği: eksik anahtarlar yazılmaz (varsayılana düşer)', () => {
      localStorage.setItem('kelimebaz:gold', '10');
      localStorage.setItem('kelimebaz:league', 'eski-lig');

      // Eski yedekte league yok → uygulanınca kalkmalı (yeni açılışta varsayılan)
      svc.apply({
        app: 'kelimebaz',
        version: 1,
        exportedAt: '',
        data: { 'kelimebaz:gold': '500' },
      });

      expect(localStorage.getItem('kelimebaz:gold')).toBe('500');
      expect(localStorage.getItem('kelimebaz:league')).toBeNull();
    });
  });

  describe('roundtrip', () => {
    it('dışa aktarılan durum, içe aktarınca BİREBİR geri gelir', () => {
      seed();
      const backup = svc.buildBackup();

      // Oyuncu bambaşka bir duruma geçsin
      localStorage.clear();
      localStorage.setItem('kelimebaz:gold', '0');
      localStorage.setItem('kelimebaz:baska', 'cop');

      svc.apply(backup);

      const restored = svc.collect();
      expect(restored).toEqual(backup.data);
      expect(restored['kelimebaz:gold']).toBe('250');
      expect('kelimebaz:baska' in restored).toBe(false);
    });
  });

  describe('isNewer', () => {
    it('daha yüksek sürüm yedeğini yeni sayar', () => {
      expect(svc.isNewer({ app: 'kelimebaz', version: 999, exportedAt: '', data: {} })).toBe(true);
      expect(svc.isNewer({ app: 'kelimebaz', version: 1, exportedAt: '', data: {} })).toBe(false);
    });
  });
});

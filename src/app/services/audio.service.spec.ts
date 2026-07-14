import { TestBed } from '@angular/core/testing';
import { AudioService } from './audio.service';

/**
 * Ses ayarlarının DAVRANIŞI sınanır: kalıcılık, sınırlar, kanalların
 * birbirinden bağımsızlığı. Sesin kendisi (WebAudio / <audio>) test
 * ortamında çalmaz — burada sınanan, ayarların doğru tutulması.
 */
describe('AudioService — müzik ve efekt ayarları', () => {
  function make(): AudioService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(AudioService);
  }

  beforeEach(() => localStorage.clear());

  describe('varsayılanlar', () => {
    it('müzik ve efektler açık başlar', () => {
      const a = make();
      expect(a.musicOn()).toBe(true);
      expect(a.sfxOn()).toBe(true);
    });

    it('müzik efektlerden daha kısık başlar (arka planda kalmalı)', () => {
      const a = make();
      expect(a.musicVol()).toBeLessThan(a.sfxVol());
    });
  });

  describe('ses seviyesi', () => {
    it('0–1 aralığına sıkıştırılır', () => {
      const a = make();

      a.setMusicVol(5);
      expect(a.musicVol()).toBe(1);

      a.setMusicVol(-3);
      expect(a.musicVol()).toBe(0);

      a.setSfxVol(0.42);
      expect(a.sfxVol()).toBeCloseTo(0.42);
    });

    it('iki kanal birbirinden BAĞIMSIZ', () => {
      const a = make();

      a.setMusicVol(0.1);
      a.setSfxVol(0.9);

      expect(a.musicVol()).toBeCloseTo(0.1);
      expect(a.sfxVol()).toBeCloseTo(0.9);
    });

    it('kapalıyken seviye yukarı çekilirse kanal kendiliğinden açılır', () => {
      const a = make();

      a.toggleMusic();
      expect(a.musicOn()).toBe(false);

      a.setMusicVol(0.5);
      expect(a.musicOn()).toBe(true); // yoksa kaydırıcı hiçbir şey yapmıyormuş gibi görünürdü
    });
  });

  describe('aç/kapa', () => {
    it('müzik kapatılınca efektler etkilenmez', () => {
      const a = make();

      a.toggleMusic();

      expect(a.musicOn()).toBe(false);
      expect(a.sfxOn()).toBe(true);
    });

    it('efektler kapatılınca müzik etkilenmez', () => {
      const a = make();

      a.toggleSfx();

      expect(a.sfxOn()).toBe(false);
      expect(a.musicOn()).toBe(true);
    });
  });

  describe('kalıcılık', () => {
    it('ayarlar oyun yeniden açılınca aynı şekilde yüklenir', () => {
      const a = make();
      a.setMusicVol(0.15);
      a.setSfxVol(0.85);
      a.toggleMusic(); // müziği kapat

      // "Oyunu yeniden aç" — yeni servis örneği, aynı localStorage
      const b = make();

      expect(b.musicVol()).toBeCloseTo(0.15);
      expect(b.sfxVol()).toBeCloseTo(0.85);
      expect(b.musicOn()).toBe(false);
      expect(b.sfxOn()).toBe(true);
    });

    it('bozuk kayıt varsayılana düşer, çökmez', () => {
      localStorage.setItem('kelimebaz:audio:musicVol', 'abc');
      localStorage.setItem('kelimebaz:audio:sfxVol', '');

      const a = make();

      expect(a.musicVol()).toBeGreaterThan(0);
      expect(a.sfxVol()).toBeGreaterThan(0);
    });
  });

  describe('efekt çalma', () => {
    it('kapalıyken veya sıfır sesteyken hata vermez', () => {
      const a = make();

      a.toggleSfx();
      expect(() => a.sfx('key')).not.toThrow();

      a.setSfxVol(0);
      expect(() => a.sfx('win')).not.toThrow();
      expect(() => a.revealSequence(5)).not.toThrow();
    });
  });
});

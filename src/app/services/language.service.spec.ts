import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';

/**
 * Dil servisi — anlık geçiş, tembel yükleme, yedek zinciri ve biçimlendirme.
 * (Çeviriler dil başına ayrı JSON; tr gömülü/yedek, en tembel indirilir.)
 */
describe('LanguageService — dil değişimi', () => {
  function fresh(): LanguageService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(LanguageService);
  }

  let lang: LanguageService;

  beforeEach(() => {
    localStorage.clear();
    lang = fresh();
  });

  describe('varsayılan + başlangıç', () => {
    it('kayıt yoksa Türkçe başlar', () => {
      expect(lang.lang()).toBe('tr');
      expect(lang.isEn()).toBe(false);
    });

    it('tr çevirileri gömülü — anında (beklemeden) gelir', () => {
      expect(lang.t('league.title')).toBe('Ustalık');
    });

    it('kayıtlı dil (localStorage) başlangıçta yüklenir', () => {
      localStorage.setItem('kelimebaz:lang', 'en');
      expect(fresh().lang()).toBe('en');
    });
  });

  describe('metinlerin güncellenmesi (t)', () => {
    it("İngilizceye geçince metinler İngilizce'ye döner", async () => {
      expect(lang.t('league.title')).toBe('Ustalık');
      lang.set('en');
      await lang.whenReady();
      expect(lang.lang()).toBe('en');
      expect(lang.t('league.title')).toBe('Mastery');
    });

    it('geri Türkçeye dönünce metinler Türkçe olur', async () => {
      lang.set('en');
      await lang.whenReady();
      lang.set('tr');
      await lang.whenReady();
      expect(lang.t('league.title')).toBe('Ustalık');
    });

    it('{param} yer tutucularını doldurur', () => {
      expect(lang.t('league.season', { n: 3 })).toBe('3. Dönem');
    });

    it('geçersiz dil yok sayılır (tr/en/de dışı)', () => {
      lang.set('fr' as never);
      expect(lang.lang()).toBe('tr');
    });
  });

  describe('yedek zinciri: aktif → tr → anahtar', () => {
    it('hiç var olmayan anahtar → anahtarın kendisi döner (arayüz boş kalmaz)', () => {
      expect(lang.t('boyle.bir.anahtar.yok')).toBe('boyle.bir.anahtar.yok');
    });

    it('İngilizce sözlüğü henüz inmeden en aktifken tr yedeğine düşer', () => {
      // set('en') ensure()'ı başlatır ama whenReady BEKLENMEZ → en henüz yok.
      lang.set('en');
      // en sözlüğü inmediği an: aktif(en yok) → tr yedeği. Çökmemeli, tr metni gelmeli.
      expect(lang.t('league.title')).toBe('Ustalık');
    });
  });

  // NOT: dile özgü locale biçimlendirmesi (tr binlik ayracı ".", tr İ/I) gerçek
  // tarayıcıda çalışır ama vitest ortamının ICU'su tr locale'ini uygulamaz →
  // burada yalnız biçimlendirmenin ÇALIŞTIĞI (ayraç eklendiği, büyük harfe
  // çevrildiği) doğrulanır. Türkçe İ/I gösterimi Playwright (dictionary-check)
  // ile GERÇEK tarayıcıda kapsanır.
  describe('biçimlendirme (num / upper)', () => {
    it('sayıyı binlik ayraçla biçimler', () => {
      expect(lang.num(1000)).toMatch(/1[.,]000/); // ayraç locale'e göre . veya ,
      expect(lang.num(5)).toBe('5');
    });

    it('büyük harfe çevirir', () => {
      expect(lang.upper('kalem')).toBe('KALEM');
    });
  });

  describe('kalıcılık', () => {
    it('seçilen dil localStorage’a yazılır ve yeniden açılışta yüklenir', async () => {
      lang.set('en');
      await lang.whenReady();
      expect(localStorage.getItem('kelimebaz:lang')).toBe('en');
      expect(fresh().lang()).toBe('en');
    });
  });
});

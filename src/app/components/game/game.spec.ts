import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Game } from './game';
import { GameService } from '../../services/game.service';
import { WordService } from '../../services/word.service';

/**
 * Fiziksel klavye (@HostListener('window:keydown')) davranışı.
 * Gerçek keydown olayları gönderilip tahtanın/state'in tepkisi ölçülür.
 */
describe('Game — fiziksel klavye', () => {
  let fixture: ComponentFixture<Game>;
  let game: GameService;

  /** Gerçek bir tuş vuruşu simüle eder. */
  function press(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, ...mods });
    window.dispatchEvent(e);
    fixture.detectChanges();
    return e;
  }

  function type(word: string): void {
    for (const ch of word) press(ch);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameService);
    vi.spyOn(TestBed.inject(WordService), 'randomWordForLevel').mockReturnValue('KALEM');

    fixture = TestBed.createComponent(Game);
    fixture.componentRef.setInput('mode', 'practice');
    fixture.detectChanges(); // ngOnInit → oyun başlar
    game.reset('practice'); // deterministik başlangıç
  });

  it('fiziksel klavyeyle harf yazılır', () => {
    type('kal');
    expect(game.currentGuess()).toBe('KAL');
  });

  it('Türkçe harfler doğru yazılır (i → İ, ı → I)', () => {
    press('i');
    press('ı');
    expect(game.currentGuess()).toBe('İI');
  });

  it('Türkçe klavyede alfabenin 29 harfi de yazılabilir', () => {
    // Türkçe düzende her harf event.key olarak doğrudan gelir.
    for (const ch of 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ') {
      game.reset('practice');
      press(ch.toLocaleLowerCase('tr'));
      expect(game.currentGuess()).toBe(ch);
    }
  });

  describe('Türkçe olmayan fiziksel klavye (US QWERTY)', () => {
    /**
     * US klavyede Ç, Ğ, Ö, Ş, Ü tuşu YOKTUR — o konumlar noktalama üretir.
     * Oyun event.code ile fiziksel KONUMA bakıp Türkçe-Q düzenindeki harfi
     * yazmalı; yoksa bu oyuncular alfabenin 6 harfini hiç kullanamaz.
     */
    const US_KEYS: [string, string, string][] = [
      ['Semicolon', ';', 'Ş'],
      ['Quote', "'", 'İ'],
      ['BracketLeft', '[', 'Ğ'],
      ['BracketRight', ']', 'Ü'],
      ['Comma', ',', 'Ö'],
      ['Period', '.', 'Ç'],
    ];

    for (const [code, key, expected] of US_KEYS) {
      it(`${code} tuşu (key="${key}") → ${expected}`, () => {
        press(key, { code });
        expect(game.currentGuess()).toBe(expected);
      });
    }

    it('Türkçe klavyede konum eşlemesi devreye girmez', () => {
      // Türkçe klavyede aynı fiziksel tuş zaten "ş" üretir. key geçerli bir
      // Türkçe harfse konuma hiç bakılmamalı — yoksa çift yazım olurdu.
      press('ş', { code: 'Semicolon' });
      expect(game.currentGuess()).toBe('Ş');
    });
  });

  it('5 harften fazlası yazılamaz', () => {
    type('kalem');
    press('x'); // 6. harf denemesi
    press('t');
    expect(game.currentGuess()).toBe('KALEM');
  });

  it('Backspace son harfi siler', () => {
    type('kal');
    press('Backspace');
    expect(game.currentGuess()).toBe('KA');
  });

  it('Enter eksik harfle onaylamaz, uyarı verir', () => {
    type('ka');
    press('Enter');
    expect(game.rowIndex()).toBe(0);
    expect(game.message()).toBe('5 harf girin');
  });

  it('Enter geçerli kelimeyi onaylar → satır ilerler', () => {
    type('kalem');
    press('Enter');
    expect(game.rowIndex()).toBe(1);
    expect(game.currentGuess()).toBe('');
  });

  it('Türkçede olmayan tuşlar (Q, W, X) yok sayılır', () => {
    press('q');
    press('w');
    press('x');
    expect(game.currentGuess()).toBe('');
  });

  it('harf olmayan tuşlar (Shift, ok tuşları) yok sayılır', () => {
    press('Shift');
    press('ArrowLeft');
    press('Tab');
    press(' ');
    expect(game.currentGuess()).toBe('');
  });

  it('kısayollar (Ctrl+R gibi) oyuna harf yazmaz', () => {
    press('r', { ctrlKey: true });
    press('a', { metaKey: true });
    press('l', { altKey: true });
    expect(game.currentGuess()).toBe('');
  });

  it('oyunda kullanılan tuşlar tarayıcı varsayılanını engeller', () => {
    const e = press('Backspace'); // tarayıcı "geri" gitmesin
    expect(e.defaultPrevented).toBe(true);
  });

  it('oyun bitince klavye girişi yok sayılır', () => {
    // Not: tahmin gönderilince kutular çevrilirken giriş KİLİTLENİR.
    // Bu yüzden her tahminden sonra animasyonun bitmesini beklemeliyiz.
    vi.useFakeTimers();

    const wrong = ['KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL', 'TAVUK'];
    for (const w of wrong) {
      if (game.isOver()) break;
      type(w.toLocaleLowerCase('tr'));
      press('Enter');
      vi.advanceTimersByTime(1000); // açılma animasyonu bitsin, kilit açılsın
      fixture.detectChanges();
    }

    expect(game.isOver()).toBe(true);

    const before = game.currentGuess();
    type('kal');
    expect(game.currentGuess()).toBe(before); // oyun bitti, hiçbir şey yazılmadı

    vi.useRealTimers();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Game } from './game';
import { GameService } from '../../services/game.service';

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
    expect(game.message()).toBe('Yeterli harf yok');
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
    // 6 hak da yanlış kullanılırsa oyun biter
    const wrong = ['KİTAP', 'ÇORBA', 'DENİZ', 'GÜNEŞ', 'MASAL', 'TAVUK'];
    for (const w of wrong) {
      if (game.isOver()) break;
      type(w.toLocaleLowerCase('tr'));
      press('Enter');
    }
    expect(game.isOver()).toBe(true);

    const before = game.currentGuess();
    type('kal');
    expect(game.currentGuess()).toBe(before); // hiçbir şey yazılmadı
  });
});

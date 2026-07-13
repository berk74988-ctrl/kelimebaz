import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Game } from './game';
import { GameService } from '../../services/game.service';

/**
 * Kenar durum: çok hızlı tuş basımı.
 * Kutular çevrilirken giriş kilitli olmalı — yoksa ENTER'a iki kez basınca
 * ikinci basış boş satırı onaylamaya çalışıp "5 harf girin" uyarısı çıkarır.
 */
describe('Hızlı basma / çift onaylama', () => {
  let fixture: ComponentFixture<Game>;
  let game: GameService;

  function press(key: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    fixture.detectChanges();
  }

  function type(word: string): void {
    for (const ch of word) press(ch);
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameService);

    fixture = TestBed.createComponent(Game);
    fixture.componentRef.setInput('mode', 'practice');
    fixture.detectChanges();
    game.reset('practice');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ENTER\'a iki kez hızlı basınca ikinci basış YOK SAYILIR', () => {
    type('kalem');
    press('Enter'); // geçerli tahmin gönderildi
    expect(game.rowIndex()).toBe(1);

    press('Enter'); // hemen ikinci basış

    // "5 harf girin" uyarısı ÇIKMAMALI — satır zaten gönderildi
    expect(game.message()).toBe('');
    expect(game.invalidShake()).toBe(0); // sallanma da tetiklenmedi
    expect(game.rowIndex()).toBe(1); // fazladan satır yok
  });

  it('kutular çevrilirken yazılan harfler yok sayılır', () => {
    type('kalem');
    press('Enter');

    type('kit'); // animasyon sürerken yazmaya çalış

    expect(game.currentGuess()).toBe(''); // hiçbiri girmedi
  });

  it('animasyon bitince giriş yeniden açılır', () => {
    type('kalem');
    press('Enter');

    vi.advanceTimersByTime(950); // açılma animasyonu bitti
    fixture.detectChanges();

    type('kit');
    expect(game.currentGuess()).toBe('KİT'); // artık yazılabiliyor
  });

  it('kilit sırasında SİL de çalışmaz', () => {
    type('kal');
    expect(game.currentGuess()).toBe('KAL');

    type('em');
    press('Enter'); // KALEM gönderildi

    press('Backspace'); // kilitliyken silmeye çalış
    expect(game.currentGuess()).toBe(''); // zaten boş, bozulmadı
  });

  it('geçersiz tahminden sonra kilit YOK — oyuncu hemen düzeltebilir', () => {
    type('zzzzz');
    press('Enter'); // reddedildi

    expect(game.message()).toBe('Sözlükte yok');

    press('Backspace'); // hemen düzeltmeye başlayabilmeli
    expect(game.currentGuess()).toBe('ZZZZ');
  });
});

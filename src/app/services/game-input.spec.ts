import { TestBed } from '@angular/core/testing';
import { GameService } from './game.service';

/**
 * Klavye → state → tahta zinciri.
 * Klavye bileşeni bu metotları çağırır (type / backspace / submit),
 * bu yüzden burada doğrudan servisi sürerek zincirin sonucunu doğruluyoruz.
 */
describe('Klavye girişi → tahta', () => {
  let game: GameService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    game = TestBed.inject(GameService);
    game.reset('practice');
  });

  /** Tahtanın ilk satırındaki harfleri okur. */
  function firstRow(): string {
    return game
      .board()[0]
      .map((t) => t.letter)
      .join('');
  }

  it('basılan harf tahtaya yazılır', () => {
    game.type('K');
    game.type('İ');
    game.type('T');

    expect(firstRow()).toBe('KİT'); // kalan iki kutu boş
    expect(game.currentGuess()).toBe('KİT');
  });

  it('küçük harf basılsa bile tahtaya Türkçe büyük harf yazılır', () => {
    game.type('i'); // Türkçede i → İ
    expect(game.currentGuess()).toBe('İ');
  });

  it('SİL son harfi siler', () => {
    game.type('K');
    game.type('A');
    game.backspace();

    expect(game.currentGuess()).toBe('K');
    expect(firstRow()).toBe('K');
  });

  it('5 harften fazlası yazılamaz', () => {
    for (const ch of ['K', 'A', 'L', 'E', 'M', 'X', 'Y']) game.type(ch);
    expect(game.currentGuess()).toBe('KALEM');
  });

  it('ENTER eksik harfle tahmini göndermez, uyarı verir', () => {
    game.type('K');
    game.type('A');
    game.submit();

    expect(game.rowIndex()).toBe(0); // satır ilerlemedi
    expect(game.message()).toBe('Yeterli harf yok');
  });

  it('ENTER listede olmayan kelimeyi kabul etmez', () => {
    for (const ch of ['Z', 'Z', 'Z', 'Z', 'Z']) game.type(ch);
    game.submit();

    expect(game.rowIndex()).toBe(0);
    expect(game.message()).toBe('Kelime listede yok');
  });

  it('ENTER geçerli kelimeyi gönderir: satır ilerler ve kutular renklenir', () => {
    for (const ch of ['K', 'A', 'L', 'E', 'M']) game.type(ch);
    game.submit();

    expect(game.rowIndex()).toBe(1); // bir satır ilerledi
    expect(game.currentGuess()).toBe(''); // giriş temizlendi

    const tiles = game.board()[0];
    expect(tiles.map((t) => t.letter).join('')).toBe('KALEM');
    // her kutu değerlendirilmiş olmalı (artık 'empty' değil)
    for (const t of tiles) {
      expect(['correct', 'present', 'absent']).toContain(t.state);
    }
  });

  it('gönderilen tahmin klavye renklerini besler', () => {
    for (const ch of ['K', 'A', 'L', 'E', 'M']) game.type(ch);
    game.submit();

    const keys = game.keyStates();
    for (const ch of ['K', 'A', 'L', 'E', 'M']) {
      expect(['correct', 'present', 'absent']).toContain(keys[ch]);
    }
  });
});

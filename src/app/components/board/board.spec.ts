import { TestBed } from '@angular/core/testing';
import { Board } from './board';
import { LetterState, Tile } from '../../models/game.model';

/** Statik test verisi: 1 değerlendirilmiş satır + 1 yazılmakta olan satır + 4 boş satır. */
function makeRow(word: string, states: LetterState[]): Tile[] {
  return [...word].map((letter, i) => ({ letter, state: states[i] }));
}

function emptyRow(): Tile[] {
  return Array.from({ length: 5 }, () => ({ letter: '', state: 'empty' as LetterState }));
}

const BOARD: Tile[][] = [
  // KALEM tahmini: K🟩 A⬜ L🟨 E⬜ M🟩
  makeRow('KALEM', ['correct', 'absent', 'present', 'absent', 'correct']),
  // yazılmakta olan satır: "KİT" (henüz değerlendirilmedi)
  [
    { letter: 'K', state: 'empty' },
    { letter: 'İ', state: 'empty' },
    { letter: 'T', state: 'empty' },
    { letter: '', state: 'empty' },
    { letter: '', state: 'empty' },
  ],
  emptyRow(),
  emptyRow(),
  emptyRow(),
  emptyRow(),
];

describe('Board — tahta', () => {
  function render() {
    const fixture = TestBed.createComponent(Board);
    fixture.componentRef.setInput('rows', BOARD);
    fixture.componentRef.setInput('submitted', 1);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('6 satır × 5 sütun = 30 kutu çizer', () => {
    const el = render();
    expect(el.querySelectorAll('.row').length).toBe(6);
    expect(el.querySelectorAll('app-tile').length).toBe(30);
  });

  it('kutulara harfler basılıyor', () => {
    const el = render();
    const tiles = el.querySelectorAll('app-tile');
    expect(tiles[0].textContent?.trim()).toBe('K');
    expect(tiles[1].textContent?.trim()).toBe('A');
    expect(tiles[4].textContent?.trim()).toBe('M');
    // yazılmakta olan satır
    expect(tiles[5].textContent?.trim()).toBe('K');
    expect(tiles[6].textContent?.trim()).toBe('İ');
    // boş kutu
    expect(tiles[9].textContent?.trim()).toBe('');
  });

  it('renk sınıfları doğru uygulanıyor (correct / present / absent)', () => {
    const el = render();
    const tiles = el.querySelectorAll('app-tile');
    expect(tiles[0].classList.contains('correct')).toBe(true); // K
    expect(tiles[1].classList.contains('absent')).toBe(true); // A
    expect(tiles[2].classList.contains('present')).toBe(true); // L
    expect(tiles[3].classList.contains('absent')).toBe(true); // E
    expect(tiles[4].classList.contains('correct')).toBe(true); // M
  });

  it('harf girilmiş ama değerlendirilmemiş kutu "filled" olur, boş kutu olmaz', () => {
    const el = render();
    const tiles = el.querySelectorAll('app-tile');
    expect(tiles[5].classList.contains('filled')).toBe(true); // "K" yazılmış
    expect(tiles[9].classList.contains('filled')).toBe(false); // boş
  });

  it('gönderilen satır "reveal" alır, yazılmakta olan satır almaz', () => {
    const el = render();
    const tiles = el.querySelectorAll('app-tile');
    expect(tiles[0].classList.contains('reveal')).toBe(true); // 1. satır gönderildi
    expect(tiles[5].classList.contains('reveal')).toBe(false); // 2. satır yazılıyor
  });
});

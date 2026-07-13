import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Board } from './board';
import { LetterState, Tile } from '../../models/game.model';

/**
 * Animasyon davranışı: kademeli açılma (stagger), kutlama ve sallanma.
 * CSS'in kendisi test edilemez; burada animasyonu TETİKLEYEN
 * sınıfların ve gecikmelerin doğru üretildiği doğrulanır.
 */
describe('Board — animasyonlar', () => {
  function row(word: string, states: LetterState[]): Tile[] {
    return [...word].map((letter, i) => ({ letter, state: states[i] }));
  }

  function emptyRow(): Tile[] {
    return Array.from({ length: 5 }, () => ({ letter: '', state: 'empty' as LetterState }));
  }

  const ALL_GREEN: LetterState[] = ['correct', 'correct', 'correct', 'correct', 'correct'];
  const MIXED: LetterState[] = ['correct', 'absent', 'present', 'absent', 'correct'];

  function render(rows: Tile[][], submitted: number, status: 'playing' | 'won' | 'lost' = 'playing') {
    const fixture: ComponentFixture<Board> = TestBed.createComponent(Board);
    fixture.componentRef.setInput('rows', rows);
    fixture.componentRef.setInput('submitted', submitted);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  describe('kademeli açılma (stagger)', () => {
    it('gönderilen satırda harfler 90ms arayla açılır', () => {
      const el = render([row('KALEM', MIXED), emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()], 1);

      const tiles = el.querySelectorAll<HTMLElement>('app-tile');
      const delays = Array.from(tiles)
        .slice(0, 5)
        .map((t) => t.style.animationDelay);

      expect(delays).toEqual(['0ms', '90ms', '180ms', '270ms', '360ms']);
    });

    it('henüz gönderilmemiş satırda gecikme yoktur', () => {
      const el = render(
        [row('KALEM', MIXED), row('KİT..', ['empty', 'empty', 'empty', 'empty', 'empty']), emptyRow(), emptyRow(), emptyRow(), emptyRow()],
        1,
      );

      const tiles = el.querySelectorAll<HTMLElement>('app-tile');
      // 2. satır (5-9. kutular) yazılıyor → gecikme 0
      for (let i = 5; i < 10; i++) {
        expect(tiles[i].style.animationDelay).toBe('0ms');
      }
    });

    it('sadece gönderilen satırlar "reveal" alır', () => {
      const el = render([row('KALEM', MIXED), emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()], 1);
      const tiles = el.querySelectorAll('app-tile');

      expect(tiles[0].classList.contains('reveal')).toBe(true); // gönderildi
      expect(tiles[5].classList.contains('reveal')).toBe(false); // gönderilmedi
    });
  });

  describe('kutlama', () => {
    it('kazanınca kazanılan satır "win" sınıfı alır', () => {
      const el = render(
        [row('KALEM', MIXED), row('ÇİÇEK', ALL_GREEN), emptyRow(), emptyRow(), emptyRow(), emptyRow()],
        2,
        'won',
      );

      const rows = el.querySelectorAll('.row');
      expect(rows[1].classList.contains('win')).toBe(true); // kazanılan satır
      expect(rows[0].classList.contains('win')).toBe(false); // önceki satır değil
    });

    it('kaybedince hiçbir satır kutlamaz', () => {
      const el = render(
        [row('KALEM', MIXED), row('KİTAP', MIXED), emptyRow(), emptyRow(), emptyRow(), emptyRow()],
        2,
        'lost',
      );

      for (const r of Array.from(el.querySelectorAll('.row'))) {
        expect(r.classList.contains('win')).toBe(false);
      }
    });

    it('oyun sürerken kutlama olmaz', () => {
      const el = render([row('KALEM', MIXED), emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()], 1);

      for (const r of Array.from(el.querySelectorAll('.row'))) {
        expect(r.classList.contains('win')).toBe(false);
      }
    });
  });
});

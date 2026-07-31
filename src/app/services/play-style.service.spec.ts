import { TestBed } from '@angular/core/testing';
import { PlayStyleService } from './play-style.service';

/**
 * Oyun tarzı geçmişi deposu — kayan pencere, kalıcılık, antrenman toggle.
 */
describe('PlayStyleService — geçmiş deposu', () => {
  function fresh(): PlayStyleService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(PlayStyleService);
  }

  let svc: PlayStyleService;

  beforeEach(() => {
    localStorage.clear();
    svc = fresh();
  });

  it('boş başlar', () => {
    expect(svc.games().length).toBe(0);
    expect(svc.training()).toBe(false);
  });

  it('biten maçı ekler ve kalıcı yükler', () => {
    svc.record('KALEM', ['ROBOT', 'KALEM']);
    expect(svc.games().length).toBe(1);
    expect(svc.games()[0]).toEqual({ answer: 'KALEM', guesses: ['ROBOT', 'KALEM'] });
    // Yeni oturum aynı localStorage'dan yükler
    expect(fresh().games().length).toBe(1);
  });

  it('boş tahmin/cevap eklemez', () => {
    svc.record('', ['KALEM']);
    svc.record('KALEM', []);
    expect(svc.games().length).toBe(0);
  });

  it('KAYAN PENCERE: en fazla 80 maç tutar (eskiler düşer)', () => {
    for (let i = 0; i < 100; i++) svc.record('KALEM', ['w' + i, 'KALEM']);
    expect(svc.games().length).toBe(80);
    // En son eklenen korunur, en eski (w0) düşmüş olmalı
    expect(svc.games()[svc.games().length - 1].guesses[0]).toBe('w99');
    expect(svc.games()[0].guesses[0]).toBe('w20');
  });

  it('antrenman toggle kalıcı', () => {
    svc.setTraining(true);
    expect(svc.training()).toBe(true);
    expect(fresh().training()).toBe(true);
    svc.setTraining(false);
    expect(fresh().training()).toBe(false);
  });

  it('reset geçmişi temizler', () => {
    svc.record('KALEM', ['KALEM']);
    svc.reset();
    expect(svc.games().length).toBe(0);
    expect(fresh().games().length).toBe(0);
  });

  it('bozuk kayıt çökertmez', () => {
    localStorage.setItem('kelimebaz:playstyle', '{bozuk');
    expect(fresh().games().length).toBe(0);
  });
});

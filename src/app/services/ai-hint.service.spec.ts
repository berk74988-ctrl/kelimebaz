import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiHintService } from './ai-hint.service';

/**
 * YZ ipucu servisi: sunucu 'hint:true' demezse özellik gizli kalmalı; istek
 * hatasında throw etmeli (çağıran altını iade edebilsin).
 */
describe('AiHintService', () => {
  afterEach(() => vi.restoreAllMocks());

  function make(): AiHintService {
    TestBed.configureTestingModule({});
    return TestBed.inject(AiHintService);
  }

  it('sunucuya ulaşılamazsa özellik KAPALI (available=false)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const svc = make();
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.available()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('sunucu hint:true derse özellik AÇILIR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, hint: true }) }),
    );
    const svc = make();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.available()).toBe(true);
    vi.unstubAllGlobals();
  });

  it('requestHint sunucudan ipucu döndürür', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ hint: 'K harfini dene' }) });
    vi.stubGlobal('fetch', fetchMock);
    const svc = make();
    const hint = await svc.requestHint({
      length: 5,
      guesses: [{ word: 'ARABA', pattern: '00100' }],
      answer: 'KALEM',
    });
    expect(hint).toBe('K harfini dene');
    vi.unstubAllGlobals();
  });

  it('sunucu hatasında requestHint throw eder (altın iadesi için)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) }),
    );
    const svc = make();
    await expect(
      svc.requestHint({
        length: 5,
        guesses: [{ word: 'ARABA', pattern: '00100' }],
        answer: 'KALEM',
      }),
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

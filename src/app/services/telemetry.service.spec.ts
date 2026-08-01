import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelemetryService } from './telemetry.service';

/**
 * Telemetri servisi — GİZLİLİK + SAĞLAMLIK sözleşmesi.
 * Kritik: kapalıyken HİÇBİR istek gitmemeli; hata oyunu asla bozmamalı.
 */
describe('TelemetryService', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    TestBed.configureTestingModule({});
  });

  afterEach(() => vi.restoreAllMocks());

  function make(): TelemetryService {
    return TestBed.inject(TelemetryService);
  }

  /** BATCH (10) olaya ulaşınca otomatik flush olur. */
  function fill(t: TelemetryService, n: number): void {
    for (let i = 0; i < n; i++) t.modeSelect('daily', 'tr');
  }

  it('varsayılan AÇIK (localStorage boşken)', () => {
    expect(make().enabled()).toBe(true);
  });

  it("localStorage '0' ise KAPALI başlar", () => {
    localStorage.setItem('kelimebaz:telemetry', '0');
    expect(make().enabled()).toBe(false);
  });

  it('KAPALIYKEN hiçbir istek gitmez (kuyruğa bile alınmaz)', () => {
    const t = make();
    t.setEnabled(false);
    fill(t, 20); // bol bol olay
    expect(beacon).not.toHaveBeenCalled();
  });

  it('BATCH dolunca sendBeacon ile /events adresine gönderir', () => {
    const t = make();
    fill(t, 10); // tam BATCH → otomatik flush
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0];
    expect(String(url)).toContain('/events');
    // 'text/plain' → CORS ön-uçuşu yok
    expect((blob as Blob).type).toContain('text/plain');
  });

  it('gönderilen gövde olayları içerir', async () => {
    const t = make();
    t.gameEnd({
      mode: 'daily',
      lang: 'tr',
      wlen: 5,
      word: 'KALEM',
      result: 'won',
      attempts: 3,
      duration_ms: 1000,
    });
    fill(t, 9); // 1 + 9 = 10 → flush
    const blob = beacon.mock.calls[0][1] as Blob;
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.events)).toBe(true);
    expect(parsed.events.some((e: { type: string }) => e.type === 'game_end')).toBe(true);
    expect(parsed.events.some((e: { type: string }) => e.type === 'mode_select')).toBe(true);
  });

  it('kapatınca kuyruk temizlenir → bekleyenler gitmez', () => {
    const t = make();
    fill(t, 5); // henüz BATCH dolmadı → kuyrukta bekliyor
    t.setEnabled(false); // kuyruğu temizler
    t.setEnabled(true);
    fill(t, 9); // 9 < 10 → flush yok
    expect(beacon).not.toHaveBeenCalled();
  });

  it('sendBeacon patlarsa SESSİZCE yutulur (oyun bozulmaz)', () => {
    beacon.mockImplementation(() => {
      throw new Error('boom');
    });
    const t = make();
    expect(() => fill(t, 10)).not.toThrow();
  });

  it('sendBeacon yoksa keepalive fetch dener ve hatada patlamaz', () => {
    Object.defineProperty(navigator, 'sendBeacon', { value: undefined, configurable: true });
    const fetchMock = vi.fn(() => Promise.reject(new Error('offline')));
    vi.stubGlobal('fetch', fetchMock);
    const t = make();
    expect(() => fill(t, 10)).not.toThrow();
    expect(fetchMock).toHaveBeenCalled();
  });
});

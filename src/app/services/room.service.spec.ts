import { TestBed } from '@angular/core/testing';
import { RoomService, RoomView } from './room.service';

/**
 * İSTEMCİ OTURUM SÜRDÜRME (resume) — sayfa yenilendiğinde odaya geri bağlanma.
 *
 * Bu paketin ASIL konusu: Angular istemcisi, sessionStorage'daki kimlikle sayfa
 * yenilense de odada kalmalı. (rooms-flow-check yalnız SUNUCUNUN kaydı kabul
 * ettiğini test ediyordu; istemcinin _room'u geri doldurması hiç test edilmiyordu.)
 */
const CREDS_KEY = 'kelimebaz:room';

const ROOM: RoomView = {
  code: 'ABCD',
  status: 'lobby',
  settings: { maxPlayers: 6, timeLimit: 0 },
  ownerId: 'p1',
  seed: null,
  startedAt: null,
  players: [],
  you: { id: 'p1', isOwner: true, inRoom: true },
  finishedCount: 0,
  playerCount: 1,
  readyCount: 1,
  messages: [],
};

/** fetch yanıtı taklidi — RoomService.call() content-type + json() + ok bekler. */
function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    headers: {
      get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
  } as unknown as Response;
}

/** Fire-and-forget resume()'un mikro-görev zincirini boşalt. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Kontrollü sahte EventSource — SSE tüketim yolunu deterministik test eder. */
class FakeES {
  static last: FakeES | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Record<string, Array<(e: unknown) => void>> = {};
  closed = false;
  constructor(readonly url: string) {
    FakeES.last = this;
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    (this.listeners[type] ||= []).push(fn);
  }
  close(): void {
    this.closed = true;
  }
  // test yardımcıları
  open(): void {
    this.onopen?.();
  }
  message(room: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ room }) });
  }
  fire(type: string): void {
    (this.listeners[type] || []).forEach((fn) => fn({}));
  }
}

describe('RoomService — oturum sürdürme (resume)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('kayıtlı kimlik yoksa: hadSession false, /state çağrılmaz, oda null', () => {
    const s = TestBed.inject(RoomService);
    expect(s.hadSession).toBe(false);
    expect(s.room()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('kayıtlı kimlik varsa: açılışta odaya geri bağlanır (_room dolar, polling başlar)', async () => {
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ code: 'ABCD', playerId: 'p1', token: 't' }));
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/state')) return Promise.resolve(jsonResponse(200, { room: ROOM }));
      return Promise.resolve(jsonResponse(200, {}));
    });

    const s = TestBed.inject(RoomService);
    expect(s.hadSession).toBe(true); // App bunu okuyup kullanıcıyı odaya döndürür
    await flush();

    expect(s.room()?.code).toBe('ABCD'); // oda geri yüklendi → menü DEĞİL
    expect(s.myId).toBe('p1');
    // ilk çağrı /state olmalı (oturum sürdürme)
    expect(fetchMock.mock.calls[0][0]).toContain('/state');

    await s.leave(); // polling interval'ini temizle (sızıntı olmasın)
  });

  it('sunucu not_found derse: SESSİZCE menüye düşülür (kimlik temizlenir, hata yok)', async () => {
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ code: 'GONE', playerId: 'p1', token: 't' }));
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/state')) return Promise.resolve(jsonResponse(404, { error: 'not_found' }));
      return Promise.resolve(jsonResponse(200, {}));
    });

    const s = TestBed.inject(RoomService);
    expect(s.hadSession).toBe(true);
    await flush();

    expect(s.room()).toBeNull(); // menüye düşüldü
    expect(s.error()).toBe(''); // sessizce — kullanıcıya hata gösterilmez
    expect(sessionStorage.getItem(CREDS_KEY)).toBeNull(); // kimlik temizlendi
  });

  it('SSE varsa canlı akış kullanılır: gelen mesaj odayı ANINDA günceller (polling yok)', async () => {
    vi.stubGlobal('EventSource', FakeES as unknown as typeof EventSource);
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ code: 'ABCD', playerId: 'p1', token: 't' }));
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/state')) return Promise.resolve(jsonResponse(200, { room: ROOM }));
      return Promise.resolve(jsonResponse(200, {}));
    });

    const s = TestBed.inject(RoomService);
    await flush();
    expect(s.room()?.playerCount).toBe(1);
    // SSE bağlantısı /events'e açıldı
    expect(FakeES.last?.url).toContain('/events');
    FakeES.last!.open(); // SSE canlı → yedek polling durur

    // Sunucu push'u: ikinci oyuncu katıldı → oda ANINDA güncellenir (fetch YOK)
    const calls = fetchMock.mock.calls.length;
    FakeES.last!.message({ ...ROOM, playerCount: 2 });
    expect(s.room()?.playerCount).toBe(2);
    expect(fetchMock.mock.calls.length).toBe(calls); // ek HTTP isteği yok — saf push

    await s.leave();
  });

  it('SSE "gone" olayı → oda silinmiş; sessizce menüye düşülür', async () => {
    vi.stubGlobal('EventSource', FakeES as unknown as typeof EventSource);
    sessionStorage.setItem(CREDS_KEY, JSON.stringify({ code: 'ABCD', playerId: 'p1', token: 't' }));
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/state')) return Promise.resolve(jsonResponse(200, { room: ROOM }));
      return Promise.resolve(jsonResponse(200, {}));
    });

    const s = TestBed.inject(RoomService);
    await flush();
    expect(s.room()?.code).toBe('ABCD');

    FakeES.last!.open();
    FakeES.last!.fire('gone'); // sunucu: oda artık yok
    expect(s.room()).toBeNull();
    expect(sessionStorage.getItem(CREDS_KEY)).toBeNull();
  });
});

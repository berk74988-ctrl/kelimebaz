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
});

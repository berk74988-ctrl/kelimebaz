import { TestBed } from '@angular/core/testing';
import { PwaService } from './pwa.service';

/**
 * PWA servisi — çevrimiçi durum, güncelleme ve kurulum istemi.
 * (Servis worker sağlayıcısı yok → SwUpdate opsiyonel/null; güncelleme kapalı
 * ama online + kurulum mantığı çalışır.)
 */
describe('PwaService — PWA durumu', () => {
  function fresh(): PwaService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(PwaService);
  }

  let pwa: PwaService;

  beforeEach(() => {
    localStorage.clear();
    pwa = fresh();
  });

  it('başlangıçta çevrimiçi (navigator.onLine)', () => {
    expect(pwa.online()).toBe(true);
  });

  it('offline olayında çevrimdışına, online olayında geri döner', () => {
    window.dispatchEvent(new Event('offline'));
    expect(pwa.online()).toBe(false);
    window.dispatchEvent(new Event('online'));
    expect(pwa.online()).toBe(true);
  });

  it('güncelleme ve kurulum istemi başlangıçta yok', () => {
    expect(pwa.updateReady()).toBe(false);
    expect(pwa.installAvailable()).toBe(false);
  });

  it('kurulum istemi yakalanınca görünür, "Şimdi değil" ile KALICI kapanır', () => {
    // Tarayıcının beforeinstallprompt olayını taklit et
    const evt = new Event('beforeinstallprompt') as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    evt.prompt = () => Promise.resolve();
    evt.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(evt);
    expect(pwa.installAvailable()).toBe(true); // artık gösterilebilir

    pwa.dismissInstall();
    expect(pwa.installAvailable()).toBe(false); // reddedildi → gizli
    expect(localStorage.getItem('kelimebaz:pwa-install-dismissed')).toBe('1');
    expect(fresh().installAvailable()).toBe(false); // yeni oturumda da ısrar etmez
  });
});

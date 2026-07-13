import { vi } from 'vitest';
import { copyText, shareNative } from './clipboard';

/**
 * Kopyalama her bağlamda çalışmalı.
 * Kritik: canlı site HTTP üzerinden yayında, orada navigator.clipboard
 * TANIMLI DEĞİLDİR — yedek yöntem devreye girmeli.
 */
describe('Panoya kopyalama', () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;

  function setClipboard(value: unknown): void {
    Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  }

  function setShare(value: unknown): void {
    Object.defineProperty(navigator, 'share', { value, configurable: true });
  }

  beforeEach(() => {
    // jsdom'da execCommand tanımlı değil; casus kurabilmek için yerine koy
    if (typeof document.execCommand !== 'function') {
      Object.defineProperty(document, 'execCommand', {
        value: () => false,
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    setClipboard(originalClipboard);
    setShare(originalShare);
    vi.restoreAllMocks();
  });

  describe('modern API (HTTPS)', () => {
    it('navigator.clipboard varsa onu kullanır', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      setClipboard({ writeText });

      const ok = await copyText('🟩🟨⬜');

      expect(ok).toBe(true);
      expect(writeText).toHaveBeenCalledWith('🟩🟨⬜');
    });
  });

  describe('YEDEK (HTTP — güvensiz bağlam)', () => {
    it('navigator.clipboard YOKSA execCommand ile kopyalar', async () => {
      setClipboard(undefined); // HTTP'de böyle olur
      const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true);

      const ok = await copyText('🟩🟨⬜');

      expect(ok).toBe(true);
      expect(exec).toHaveBeenCalledWith('copy');
    });

    it('modern API hata verirse yedeğe düşer', async () => {
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('izin yok')) });
      const exec = vi.spyOn(document, 'execCommand').mockReturnValue(true);

      const ok = await copyText('🟩');

      expect(ok).toBe(true);
      expect(exec).toHaveBeenCalled();
    });

    it('kopyalama gerçekten başarısızsa false döner (kullanıcıya bildirilir)', async () => {
      setClipboard(undefined);
      vi.spyOn(document, 'execCommand').mockReturnValue(false);

      expect(await copyText('🟩')).toBe(false);
    });

    it('yedek yöntem sayfada iz bırakmaz', async () => {
      setClipboard(undefined);
      vi.spyOn(document, 'execCommand').mockReturnValue(true);

      await copyText('🟩');

      expect(document.querySelectorAll('textarea').length).toBe(0); // temizlendi
    });
  });

  describe('yerel paylaşım', () => {
    it('navigator.share varsa kullanılır', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      setShare(share);

      expect(await shareNative('🟩')).toBe(true);
      expect(share).toHaveBeenCalledWith({ text: '🟩' });
    });

    it('navigator.share yoksa false döner (kopyalamaya düşülür)', async () => {
      setShare(undefined);
      expect(await shareNative('🟩')).toBe(false);
    });

    it('kullanıcı iptal ederse false döner', async () => {
      setShare(vi.fn().mockRejectedValue(new Error('iptal')));
      expect(await shareNative('🟩')).toBe(false);
    });
  });
});

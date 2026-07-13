/**
 * Panoya kopyalama — her tarayıcıda ve her bağlamda çalışır.
 *
 * NEDEN YEDEK GEREKİYOR:
 * `navigator.clipboard` ve `navigator.share` yalnızca GÜVENLİ BAĞLAMDA
 * (HTTPS veya localhost) tanımlıdır. Oyun şu an HTTP üzerinden yayında,
 * yani orada modern API hiç yok — sadece ona güvenirsek kopyalama sessizce
 * başarısız olur. Bu yüzden eski `execCommand` yöntemine düşüyoruz.
 */

/** Modern API kullanılabilir mi? (güvenli bağlam gerektirir) */
function hasModernClipboard(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

/** Gizli bir textarea üzerinden kopyalar — HTTP'de de çalışır. */
function copyViaTextarea(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');

    // Ekranda görünmesin ama seçilebilsin (display:none olursa seçilemez)
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';

    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length); // iOS için gerekli

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Metni panoya kopyalar.
 * Önce modern API'yi dener, olmazsa yedeğe düşer.
 * @returns kopyalama başarılı mı
 */
export async function copyText(text: string): Promise<boolean> {
  if (hasModernClipboard()) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* izin reddedildi ya da güvenli bağlam değil → yedeğe düş */
    }
  }

  return copyViaTextarea(text);
}

/**
 * Mümkünse cihazın yerel paylaşım penceresini açar (mobil).
 * @returns paylaşım penceresi açıldı mı (açılmadıysa arayan taraf kopyalamalı)
 */
export async function shareNative(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;

  try {
    await navigator.share({ text });
    return true;
  } catch {
    // Kullanıcı iptal etti ya da izin yok — kopyalamaya düşmek doğru davranış
    return false;
  }
}

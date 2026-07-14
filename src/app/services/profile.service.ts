import { Injectable, computed, signal } from '@angular/core';

const NAME_KEY = 'kelimebaz:profile:name';
const AVATAR_KEY = 'kelimebaz:profile:avatar';
const PHOTO_KEY = 'kelimebaz:profile:photo';

/**
 * Fotoğraf, localStorage'a data URL olarak yazılır. Ham dosya megabaytlarca
 * olabilir ve kotayı patlatır; bu yüzden KARE olarak kırpılıp bu boyuta
 * küçültülür ve JPEG'e çevrilir → tipik olarak 10–20 KB.
 */
const PHOTO_SIZE = 160;
const PHOTO_QUALITY = 0.82;

/** Seçilebilir avatarlar — oyunun harf kutusu diliyle uyumlu, sade. */
export const AVATARS = ['🦉', '🐝', '🦊', '🐧', '🐢', '🦅', '🐙', '🦌'] as const;

const DEFAULT_AVATAR = AVATARS[0];
const MAX_NAME = 16;

/**
 * Oyuncu profili — ad ve avatar.
 *
 * Sunucu yok, hesap yok: bu tamamen yerel bir kimlik. Amacı, ana menüde
 * "kim oynuyor" hissini vermek ve istatistikleri bir isme bağlamak.
 * Paylaşım metnine karışmaz (spoiler/kimlik sızdırmaz).
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly _name = signal(this.load(NAME_KEY, ''));
  private readonly _avatar = signal(this.loadAvatar());
  private readonly _photo = signal(this.load(PHOTO_KEY, ''));

  readonly name = this._name.asReadonly();
  readonly avatar = this._avatar.asReadonly();

  /** Yüklenmiş profil fotoğrafı (data URL). Yoksa boş dizge → emoji avatar gösterilir. */
  readonly photo = this._photo.asReadonly();
  readonly hasPhoto = computed(() => this._photo().length > 0);

  /** Ad girilmemişse ekranda gösterilecek varsayılan. */
  readonly displayName = computed(() => this._name() || 'Kelimebaz');

  /** Oyuncu kendine bir ad verdi mi? */
  readonly hasName = computed(() => this._name().length > 0);

  setName(value: string): void {
    const clean = value.trim().slice(0, MAX_NAME);
    this._name.set(clean);
    this.save(NAME_KEY, clean);
  }

  setAvatar(value: string): void {
    if (!AVATARS.includes(value as (typeof AVATARS)[number])) return;
    this._avatar.set(value);
    this.save(AVATAR_KEY, value);
  }

  /**
   * Seçilen dosyadan profil fotoğrafı kurar.
   *
   * Dosya OLDUĞU GİBİ saklanmaz: kareye kırpılır, 160 px'e küçültülür ve
   * JPEG'e çevrilir. Ham bir telefon fotoğrafı 5 MB olabilir ve localStorage
   * kotasını (~5 MB) tek başına doldurup TÜM oyun kaydını bozardı.
   *
   * @returns başarılı mı (dosya resim değilse / okunamazsa false)
   */
  async setPhotoFromFile(file: File): Promise<boolean> {
    if (!file.type.startsWith('image/')) return false;

    try {
      const dataUrl = await shrinkToSquare(file, PHOTO_SIZE, PHOTO_QUALITY);
      this._photo.set(dataUrl);
      this.save(PHOTO_KEY, dataUrl);
      return true;
    } catch {
      return false;
    }
  }

  clearPhoto(): void {
    this._photo.set('');
    try {
      localStorage.removeItem(PHOTO_KEY);
    } catch {
      /* depolama kapalı — sorun değil */
    }
  }

  private loadAvatar(): string {
    const saved = this.load(AVATAR_KEY, DEFAULT_AVATAR);
    // Kayıtlı avatar listeden çıkarılmışsa varsayılana düş — bozuk veri ekranı kırmasın
    return AVATARS.includes(saved as (typeof AVATARS)[number]) ? saved : DEFAULT_AVATAR;
  }

  private load(key: string, fallback: string): string {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private save(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* özel sekme / kota — profil kaydedilemezse oyun yine çalışır */
    }
  }
}

/**
 * Resmi ORTASINDAN kare olarak kırpar, küçültür ve JPEG data URL döner.
 *
 * Kırpma neden ortadan: kullanıcı genelde yüzünü ortalar. Sadece ölçekleseydik
 * dikey bir fotoğraf ezilirdi.
 */
function shrinkToSquare(file: File, size: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.width, img.height); // kısa kenar → kare
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas yok'));

        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('resim okunamadı'));
    };

    img.src = url;
  });
}

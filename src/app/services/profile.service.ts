import { Injectable, computed, inject, signal } from '@angular/core';
import { InventoryService } from './inventory.service';

const NAME_KEY = 'kelimebaz:profile:name';
const PHOTO_KEY = 'kelimebaz:profile:photo';

/**
 * Fotoğraf, localStorage'a data URL olarak yazılır. Ham dosya megabaytlarca
 * olabilir ve kotayı patlatır; bu yüzden KARE olarak kırpılıp bu boyuta
 * küçültülür ve JPEG'e çevrilir → tipik olarak 10–20 KB.
 */
const PHOTO_SIZE = 160;
const PHOTO_QUALITY = 0.82;

const MAX_NAME = 16;

/**
 * Oyuncu profili — ad ve fotoğraf.
 *
 * AVATAR ARTIK BURADA DEĞİL: mağaza avatarlarıyla tek sistem olsun diye
 * envantere taşındı (InventoryService). Bu servis avatarı oradan OKUR, böylece
 * eski `profile.avatar()` tüketicileri (ana menü, profil) hiç değişmeden çalışır.
 *
 * Sunucu yok, hesap yok: tamamen yerel bir kimlik. Paylaşım metnine karışmaz.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly inventory = inject(InventoryService);

  private readonly _name = signal(this.load(NAME_KEY, ''));
  private readonly _photo = signal(this.load(PHOTO_KEY, ''));

  readonly name = this._name.asReadonly();

  /** Kullanımdaki avatar emojisi — kaynağı envanter (mağazayla tek sistem). */
  readonly avatar = computed(() => this.inventory.equippedItem('avatar').preview);

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

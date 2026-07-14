import { Injectable, computed, signal } from '@angular/core';

const NAME_KEY = 'kelimebaz:profile:name';
const AVATAR_KEY = 'kelimebaz:profile:avatar';

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

  readonly name = this._name.asReadonly();
  readonly avatar = this._avatar.asReadonly();

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

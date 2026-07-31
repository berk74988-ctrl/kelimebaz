import { computed, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/** Tarayıcının "ana ekrana ekle" istemi olayı (standart dışı ama yaygın). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kelimebaz:pwa-install-dismissed';

/**
 * ===========================================================================
 * PWA SERVİSİ — çevrimiçi durum, güncelleme akışı ve kurulum istemi.
 *
 * Servis worker YALNIZCA güvenli bağlamda (HTTPS / localhost) kaydolur. Düz
 * HTTP'de SwUpdate.isEnabled=false, beforeinstallprompt hiç tetiklenmez →
 * güncelleme/kurulum sessizce devre dışı kalır ama `online` yine çalışır
 * (navigator.onLine'a dayanır), böylece oda modu çevrimdışı kapatılabilir.
 * ===========================================================================
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  // Opsiyonel: servis worker sağlayıcısı yoksa (ör. testler) null olur, servis
  // güncelleme özelliği kapalı ama çalışır kalır.
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  /** Çevrimiçi mi — navigator.onLine + online/offline olaylarıyla güncel. */
  private readonly _online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly online = this._online.asReadonly();

  /** Yeni sürüm indirildi, aktifleştirilmeyi bekliyor → "Yenile" göster. */
  private readonly _updateReady = signal(false);
  readonly updateReady = this._updateReady.asReadonly();

  /** Yakalanan kurulum istemi + kullanıcı kalıcı reddetmedi. */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private readonly _installReady = signal(false);
  private readonly _dismissed = signal(this.loadDismissed());
  readonly installAvailable = computed(() => this._installReady() && !this._dismissed());

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._online.set(true));
      window.addEventListener('offline', () => this._online.set(false));

      window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // tarayıcının kendi mini çubuğunu bastır — zamanlamayı biz seçelim
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        this._installReady.set(true);
      });
      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this._installReady.set(false);
      });
    }

    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this._updateReady.set(true));
      // Uzun oturumlarda arada yeni sürüm çıkmışsa yakala (hata olursa yoksay).
      void this.swUpdate.checkForUpdate().catch(() => undefined);
    }
  }

  /** "Yenile" — yeni sürümü aktifleştir ve sayfayı yeniden yükle. */
  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate?.activateUpdate();
    } finally {
      if (typeof document !== 'undefined') document.location.reload();
    }
  }

  /** "Ana ekrana ekle" — tarayıcının kurulum istemini göster. */
  async promptInstall(): Promise<void> {
    const e = this.deferredPrompt;
    if (!e) return;
    this.deferredPrompt = null;
    this._installReady.set(false);
    try {
      await e.prompt();
      await e.userChoice;
    } catch {
      /* yoksay */
    }
  }

  /** "Şimdi değil" — bir daha ısrar etme (kalıcı). */
  dismissInstall(): void {
    this._dismissed.set(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* depolama kapalı */
    }
  }

  private loadDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
}

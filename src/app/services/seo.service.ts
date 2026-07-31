import { effect, inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { LanguageService } from './language.service';

/**
 * 🔎 SEO / META — sayfa başlığı ve paylaşım etiketlerini AKTİF DİLE göre günceller.
 *
 * SPA olduğu için index.html statik olarak varsayılan dilde (tr) gelir; bu servis
 * dil sinyali değiştiğinde document.title + meta[description] + Open Graph +
 * Twitter etiketlerini günceller. Böylece sekme başlığı, oyun içi ve JS çalıştıran
 * arama motorları (Googlebot) doğru dili görür. (JS çalıştırmayan sosyal crawler'lar
 * için statik varsayılan geçerlidir — SSR olmadan bunun ötesine geçilemez.)
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly i18n = inject(LanguageService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  constructor() {
    effect(() => {
      const lang = this.i18n.lang();
      const t = this.i18n.t('meta.title');
      const d = this.i18n.t('meta.description');

      this.title.setTitle(t);
      this.meta.updateTag({ name: 'description', content: d });
      this.meta.updateTag({ property: 'og:title', content: t });
      this.meta.updateTag({ property: 'og:description', content: d });
      this.meta.updateTag({ property: 'og:locale', content: lang === 'tr' ? 'tr_TR' : 'en_US' });
      this.meta.updateTag({ name: 'twitter:title', content: t });
      this.meta.updateTag({ name: 'twitter:description', content: d });
    });
  }
}

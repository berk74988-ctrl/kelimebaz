# Kelimebaz — Proje Bağlamı (Claude Code)

Türkçe/İngilizce/Almanca **kelime tahmin oyunu** (Wordle tarzı). Angular 22, standalone
bileşenler, signals. Bu dosya her oturumda yüklenir — mimari kararlar ve stil burada.

## Dil ve iletişim

- **Her şey Türkçe** yazılır: kod yorumları, commit mesajları, PR, kullanıcıya yanıtlar.
- Kullanıcı teknik değil; net, dürüst, abartısız anlat. Yapılamayanı açıkça söyle.

## Mimari

- **Angular 22 standalone** bileşenler + **signals/computed/effect**, `inject()`,
  `input()/output()`, `ChangeDetectionStrategy.OnPush`. NgModule yok.
- **Saf çekirdek** (`src/app/core/`): Angular'dan bağımsız saf fonksiyonlar
  (evaluate, gold, daily-rotation, play-style, balance, voice, a11y…) → doğrudan test edilir.
- **Servisler** (`src/app/services/`): durum + I/O. `providedIn: 'root'`.
- **Tembel yükleme**: kelime verisi + i18n + tema/zorluk dinamik `import()` ile ayrı
  chunk. Aktif dilin havuzu ilk gerekince iner (paket küçük kalır).
- **i18n**: `src/i18n/{tr,en,de}.json` (düz, nokta-anahtar). `tr` gömülü + yedek.
  `LanguageService.t()` reaktiftir. `npm run check:i18n` parity'yi zorlar (CI).
- **Diller**: `Lang = 'tr' | 'en' | 'de'`. Yeni dil eklerken: `core/lang.ts`,
  `language.service` + `word.service` + `hint.service` kolları, klavye düzeni,
  `Record<Lang>` haritaları (voice/play-style), i18n dosyası, ayar butonu.

## Backend (bağımlılıksız)

- **`rooms-server/`** — saf Node HTTP (Express YOK, bağımlılık YOK). nginx arkasında
  `/berk/rooms/`. Çok oyunculu oda + YZ ipucu + **telemetri** + **yönetim paneli**
  (`/admin`: özet/kelimeler/odalar/takvim/denge) + günün kelimesi override + denge ayarları.
- **Node 20** çalışıyor (canlı). `node:sqlite` yok → telemetri NDJSON'a düşer.
- Yönetim paneli: **HTTPS zorunlu** (kod düzeyinde), scrypt parola karması, oturum çerezi,
  denetim kaydı. `ADMIN_PASS_HASH` yoksa 503.
- İstemci↔sunucu **parity**: `daily-rotation.js`↔`.ts`, `balance.js`↔`.ts` golden testli.

## Sağlamlık ilkesi (değişmez)

- **Sunucu erişilemezse oyun gömülü varsayılanla çalışır** — override/denge/telemetri
  için oyun ASLA beklemez; hata sessizce yutulur.
- **Erişilebilirlik güçlü**: ekran okuyucu (aria-live), tam klavye, renk körü modu,
  hareket azaltma. Yeni ekranlar bunu korumalı.
- **Gizlilik**: telemetri anonim (kimlik/IP yok); aktif oda sohbeti dışında arşiv yok.

## Tasarım sistemi

- Tokenlar: **`src/styles/_variables.scss`** (SCSS) → **`src/styles/_reset.scss`**
  runtime CSS değişkenleri (`--text`, `--accent`, `--correct`…). Bileşenler `var(--…)` kullanır.
- Temalar: `<html data-theme="dark|light">`, renk körü `data-contrast="high"`, mağaza
  derileri `data-skin="…"` (yalnız `--accent`). Oyun durumu renkleri WCAG ölçülü — dokunma.
- **Claude Design sistemi**: `design-system/` klasörü panele senkronlanır (bkz.
  `docs/tasarim-sistemi.md`). Her önizlemenin ilk satırı `<!-- @dsCard group="…" -->`.
- Yeni ekran/bileşen: **sıfırdan uydurma — sistemden türet.** Önce `frontend-design`
  becerisiyle yön belirle, sonra token'larla uygula.

## Kod stili

- Prettier zorunlu (`npm run format`; CI `format:check`). 2 boşluk, tek tırnak.
- Yorumlar **neden**i anlatır (ne değil). Türkçe.
- Test kültürü güçlü: saf çekirdek + servisler için birim test; sunucu için `.test.mjs`.

## Sık komutlar

```bash
npm run build            # üretim derlemesi
npm test -- --watch=false# Angular birim testleri (vitest via ng)
npm run check:i18n       # dil parity
npm run check:rooms      # oda sunucusu güvenlik kontrolleri
npm run format           # prettier
node rooms-server/*.test.mjs   # sunucu birim testleri
npm run build:german     # Almanca veriyi yeniden üret (indirilmiş kaynaklarla)
```

## Deploy (kullanıcı onayıyla)

- App: `npm run build` → `dist/kelimebaz/browser/*` sunucuya `scp` → whitelist'li
  `sudo -n /usr/bin/bash /home/berk/kb-deploy/kb-deploy.sh`.
- rooms-server: dosyalar `/home/berk/rooms-server/`'a `scp` — **restart Berk'te**
  (`sudo systemctl restart berk-rooms`, whitelist'te değil).
- Deploy/commit/push YALNIZ kullanıcı isteyince. Ana dalda çalışıyorsan önce dallan.

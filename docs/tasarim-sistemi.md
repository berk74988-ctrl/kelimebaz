# Kelimebaz Tasarım Sistemi — Ekip Notu

Bundan sonra ekran/bileşen tasarımı **"sıfırdan uydur" değil, "sistemden türet."**
Ortak kaynak iki yerde yaşar:

## 1. Tek doğru kaynak: tokenlar (kodda)

- **`src/styles/_variables.scss`** — SCSS tokenları (renk, boşluk, yarıçap, tipografi).
- **`src/styles/_reset.scss`** — runtime CSS değişkenleri (`--text`, `--accent`,
  `--correct`…) + tema/renk-körü/deri varyantları. Bileşenler **her zaman `var(--…)`**
  kullanır, sabit hex yazmaz.
- Temalar: `<html data-theme="dark|light">`, renk körü `data-contrast="high"`,
  mağaza derileri `data-skin="…"` (yalnız `--accent`). **Oyun durumu renkleri
  (correct/present/absent) WCAG ile ölçülü — değiştirme.**

## 2. Görünür pano: Claude Design

- Proje: **claude.ai/design → "Kelimebaz Design System"** (tip: *design system*,
  değişmez). Ekip aynı karta bakar: Renkler, Tipografi, Boşluk & Yarıçap, Butonlar,
  Kartlar, Oyun (kutular/klavye/tahta), Bileşenler.
- Yerel kaynak: **`design-system/`** klasörü (`tokens/*.html`, `components/*.html`).
  Her dosya kendi kendine yeten bir önizlemedir (tokenları inline içerir → panelde
  doğru render olur).

### Yeni bileşen/kart nasıl eklenir

1. `design-system/components/<ad>.html` oluştur — kendi kendine yeten, **tokenları
   inline `:root`** ile ver (panelde app CSS'i yoktur).
2. **İlk satıra** kart işaretini koy:
   ```html
   <!-- @dsCard group="Butonlar" -->
   ```
   Panel kart dizinini bu işaretten çıkarır (`_ds_manifest.json` otomatik derlenir);
   ayrıca elle kayıt gerekmez. `group` mevcut gruplardan biri olsun (yenisi de olur).
3. Tema varyantını **ayrı dosya/ayrı kart** yap (ör. `tile-dark`, `tile-light`,
   `tile-colorblind`) — panelde ayrı ayrı görünsünler.

### Panele senkron (Claude Code içinde)

`/design-sync` ile **artımlı** (bileşen bileşen — toptan değiştirme YOK):

- Araç `DesignSync`: `list_files` → `finalize_plan` (yazılacak yolları kilitle) →
  `write_files` (diskten okur, yükler). Ardından `list_files`/`get_file` ile doğrula.
- Proje id: `4c1d5066-92f0-447b-850e-15a9c86c18ac`.
- **Not:** Normal projeye push onu tasarım sistemine ÇEVİRMEZ; tip oluşturmada
  sabitlenir. Bizimki zaten *design system* tipinde.

## Yeni ekran tasarlarken (frontend-design yaklaşımı)

Önce **görsel yön** belirle, sonra uygula — "şunu güzelleştir" deme, önce karar ver:

- **Şablon görünümünden kaç:** jenerik emoji + tek renk kart yerine oyunun kendi
  dilini kullan (harf kutuları, marka şeridi, doğru semantik renk).
- **Semantik renk:** accent = nötr/birincil eylem; correct/present/absent yalnız
  oyun durumu; danger yalnız yıkıcı eylem.
- **Erişilebilirliği koru:** `role`, `aria-live`, tam klavye, renk körü modu,
  hareket azaltma. Yeni ekran bunları bozmamalı.
- Örnek elden geçirme: **hata ekranı** — bkz. `docs/design/error-before.png` →
  `docs/design/error-after.png` (jenerik 😕 + yeşil buton → marka + kutu satırı +
  accent buton). Gerçek bileşen: `src/app/components/error-screen/`.

## Özet

| İş | Yer |
| --- | --- |
| Token değeri değiştir | `src/styles/_variables.scss` (+ `_reset.scss` varyant) |
| Panele kart ekle | `design-system/**` + `@dsCard` işareti → `/design-sync` |
| Yön belirle / ekran elden geçir | `frontend-design` becerisi, sonra tokenlarla uygula |
| Proje bağlamı (her oturum) | `.claude/CLAUDE.md` |

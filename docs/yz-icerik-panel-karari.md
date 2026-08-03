# YZ İçerik Üretimi — Panel Mimari Kararı

**Durum:** Karar verildi (bu paket). **Bağımlılık:** Model bağlama paketi (YZ model
yönetimi paneli, `ai-config.js`) — **tamamlandı** (commit `ad9e192`).

## Sorun

Bugün LLM içerik üretimi (ipucu / kelime kartı / tema) tamamen **elle ve yereldir**:
geliştirici `build:hints` / `build:cards` / `build:themes` betiklerini kendi
makinesinde koşturur, `tools/content-review` ile denetler, elle commit + deploy eder.
İki sorun: (1) yalnız geliştirici yapabilir, (2) yeni kelime eklenince kimse fark
etmez — havuz 3.100'e çıkınca ipucu/kart 860'ta kaldı.

Hedef: **üretim + onay + yayın panele taşınsın; yeniden dağıtım gerekmesin.**

## Belirleyici gerçek: panel ↔ depo yalıtımı

Panel, **rooms-server** üzerinde (canlı sunucu, `34.158.136.9`). Bu sunucuda **depo
yok, build araç zinciri yok**. İçerik JSON'ları (`src/app/data/hints-*.json`,
`word-cards-*.json`, `themes-*.json`) yalnız depoda ve derlemeye gömülü.

Bu gerçek kararı belirler: "yeniden dağıtım gerekmesin" hedefine ulaşmanın **tek
yolu**, onaylı içeriğin istemcinin **çalışma zamanında okuyabileceği bir yerde**
(rooms-server) durmasıdır. Dışa aktarma tek başına bu hedefi karşılayamaz — bir
geliştiricinin hâlâ depoya commit + yeniden deploy etmesi gerekir.

## Karar: Sunucu-tarafı içerik katmanı (birincil) + depoya dışa aktarma (geri taşıma)

İki seçenek değil, **ikisi birlikte** — her biri farklı işi çözer:

### 1) Sunucu-tarafı overlay (yayın mekanizması — yeniden dağıtım YOK)

- Panelden üretilip **onaylanan** içerik rooms-server'da saklanır (disk, mevcut
  `balance.js` / `ai-config.js` deseni: şema + kalıcı + geçmiş).
- İstemci açılışta bu overlay'i çeker (mevcut `/balance`, `/ai-behavior` gibi bir
  `GET /content-overlay`) ve **gömülü içeriğin ÜSTÜNE** ekler (yalnız eksik
  kelimeler için; gömülü olan asla ezilmez → çakışma yok).
- **OYUN-195 (tembel yükleme) uyumu:** ipuçları küçük çalışma-zamanı metnidir →
  bir kez çekilip birleşir, sorunsuz. Kartlar tembel chunk'tır → overlay kart verisi
  aynı tembel noktada, chunk'a paralel çekilip birleşir (chunk'lar değişmez, yalnız
  overlay eklenir). Yeni runtime karmaşası minimum.

### 2) Depoya dışa aktarma (kanonik kaynak + CI-parity — geri taşıma)

- Panel, onaylı overlay içeriğini **JSON olarak dışa aktarır**; geliştirici (ya da
  Claude, otomatik deploy ile) depoya işler → gömülü içeriğe geçer, overlay'den
  düşer (tekrar sunulmaz).
- **Neden gerekli:** Depo **kanonik kaynak** kalmalı. CI kapsam denetimi (OYUN-261)
  depo JSON'unu okur. İçerik yalnız overlay'de yaşarsa, "iki yerde farklı sonuç"
  çıkar (biletin açık uyarısı). Dışa aktarma bu döngüyü kapatır: overlay geçici bir
  **hazırlık alanıdır**, kalıcı ev depodur.

## Kapsam denetimi tek kaynaktan

Panel kapsam göstergesi CI (OYUN-261) ile **aynı mantığı** kullanır
(`scripts/check-content-coverage.mjs`). Kapsam = **gömülü (depo, CI-denetimli)** +
**overlay (panel-eklenmiş, depoya geri taşınmayı bekliyor)**, ikisi **ayrı ayrı
etiketli** gösterilir → hangi içeriğin kanonik, hangisinin bekleyen overlay olduğu
her zaman net; sessiz sapma olmaz. Sunucunun kapsam hesaplayabilmesi için "hangi
kelimede içerik var" indeksi (kelime→tür→var/yok) sunucuya senkronlanır (deploy'da).

## Maliyet koruması (zorunlu)

Üretim **gerçek para** harcar. Katmanlar:

1. **Üretim öncesi tahmini maliyet** — seçili model (ai-config'ten) × eksik kelime
   sayısı × ortalama token → USD tahmini, **onay istenir**.
2. **Parti (batch) üst sınırı** — tek seferde en fazla N kelime.
3. **Günlük bütçe** — gün içinde harcanan tahmini toplam bir tavanı aşamaz (sunucu
   sayaç + reddet).
4. Model + parametreler **YZ model panelinden** (ai-config) gelir — bu paket onun
   ayarlarını kullanır (bağımlılık bu yüzden).

## Otomatik ön denetim + onay kuyruğu

- **Otomatik reddet:** ipucu cevabı içeriyorsa (mevcut `lib-hint-leak*` mantığı),
  metin boş / çok kısaysa → kuyruğa hiç girmez.
- **Onay kuyruğu:** kelime + üretilen içerik yan yana; onayla / reddet / düzelt,
  klavye kısayolları. Yalnız **onaylanan** overlay'e (yayına) geçer.
- **Reddedilenler gerekçesiyle saklanır** (istem iyileştirmesi için).
- **Devam edebilirlik:** üretim durumu (üretildi / kuyrukta / onaylı / reddedildi)
  diske yazılır → yarıda kesilirse kaldığı yerden devam eder.

## Aşamalı uygulama planı

- **Faz A — Kapsam (okuma):** içerik-presence indeksi senkronu + `GET
  /admin/content/coverage` (tür başına toplam/kapsanan/eksik + eksik liste) + panel
  kapsam sekmesi. CI ile aynı kaynak. *(Para harcamaz, güvenli.)*
- **Faz B — Üretim + maliyet:** `POST /admin/content/generate` (yalnız eksik, parti,
  ilerleme), tahmini maliyet + onay + günlük bütçe, otomatik ön denetim.
- **Faz C — Onay kuyruğu + yayın:** kuyruk uçları + panel UI (onayla/reddet/düzelt,
  kısayollar) + overlay'e yayınla + dışa aktarma (repo backport).

## Pratik ön koşullar (Berk tarafı — hâlâ bekliyor)

Feature canlı çalışmadan önce gerekenler (YZ model panelindekiyle aynı):
1. Sunucuda `ANTHROPIC_API_KEY` (üretim bunu kullanır; şu an tanımsız → `hint:false`).
2. Panelin açılması için HTTPS + `ADMIN_PASS_HASH`.
3. `sudo systemctl restart berk-rooms`.

Bunlar tamamlanana kadar üretim gerçek para harcayamaz / panel açılamaz; kod
yazılabilir + testlerle doğrulanabilir ama **canlı üretim** bu üçüne bağlı.

# Canlı Doğrulama Raporu (epic kapanış) — 6 Ağustos 2026

Alan adına taşıma epic'inde açılan her şeyin **gerçekten çalıştığının** madde
madde kanıtı. "Muhtemelen çalışıyor" kabul değil — her satır elle/otomatik
denendi, sonucu yazıldı.

## Canlı adresler
- **Kelimebaz:** https://kelimebaz.aicirkit.com/ (kökten, HTTPS)
- **Mini Koloni:** https://koloni.aicirkit.com/ (kökten, HTTPS)
- Oda API'si: aynı köken `…/berk/rooms/` (127.0.0.1:4243 proxy)
- Eski IP yolları alan adına 301 yönlenir.

## Sonuçlar

| # | Madde | Sonuç | Kanıt |
|---|---|---|---|
| 1 | **Komşular sağlam** (Çınar, Emre, Bilgi-Küpü) | ✅ | `http://34.158.136.9/` 200 (Çınar), `/emre/` 200, `/bilgi-kupu/` 200, `/berk/` 200 |
| 2 | **Sertifika + oto-yenileme** | ✅ | `certbot.timer` **active** (sonraki ~4.5 sa); iki cert **4 Kas 2026**'a geçerli; Let's Encrypt (tarayıcı güvenir) |
| 3 | **Çok oyunculu: oda kur/katıl** | ✅ | Gerçek tarayıcı: oda kodu üretildi, 2. oyuncu katıldı, kurucu ekranı "Ayse + Berk"; konsol hatasız |
| 4 | **SSE canlı akış** | ✅ | `GET /events?code=XVEY` → 200 `text/event-stream`, ilk durum anında `data:` push (nginx tamponsuz `X-Accel-Buffering:no`) |
| 5 | **Uç noktalar yanıt** (denge/YZ/telemetri/günlük) | ✅ | `/balance`,`/ai-behavior`,`/daily-overrides`,`/events` → **200** |
| 6 | **CORS** | ✅ | Origin=domain → ACAO `https://kelimebaz.aicirkit.com`; izinsiz köken engellenir; `check:rooms` yeşil |
| 7 | **Koloni: kökten aç + kaydet/yükle** | ✅ | https://koloni.aicirkit.com/ 200; kayıt olup girildi, reload sonrası localStorage kalıcı, canvas+ses çalışıyor (masaüstü+mobil) |
| 8 | **PWA: kurulabilir + çevrimdışı** | ✅ (headless) | SW controller aktif; **çevrimdışı** (gerçek offline) reload'da kabuk açıldı, Serbest Oyna tahtası çevrimdışı çalıştı |
| 9 | **SSL Labs dış tarama** | ✅ **A** | kelimebaz.aicirkit.com = **A**, koloni.aicirkit.com = **A** |

## ⚠️ Bu doğrulamada ÇIKAN yeni işler (ayrı ele alınmalı)

Epic'in beklediği gibi, ilk kez gerçek koşullarda test edilince yüzeye çıktılar:

1. **Yönetim paneli — ✅ ÇÖZÜLDÜ + CANLI (2 tuzak bulundu, ikisi de giderildi):**
   - **nginx config açığı (yeni bug):** `/berk/rooms/` proxy'si `X-Forwarded-Proto` iletmiyordu → panel auth'u HTTPS'i göremeyip `400 https_required` dönüyordu (HTTPS'siz hiç test edilemediği için gizliydi). İki `/berk/rooms/` bloğuna `proxy_set_header X-Forwarded-Proto $scheme;` eklendi.
   - **systemd `$` tuzağı (yeni bug):** scrypt hash'i `$` doludur; systemd `Environment=` bunları değişken sanıp bozuyordu + hint.env'deki eski hash EnvironmentFile en sonda yüklenip eziyordu. Çözüm: hash `hint.env`'e (EnvironmentFile, **literal**) yazılıyor, `.service`'ten bozuk satırlar temizleniyor. (Ders: `$`'lı sırlar EnvironmentFile'a konur.)
   - **Sonuç:** `rooms-server/setup_admin_panel.py` çalıştırıldı → **uçtan uca doğrulandı:** login 200 + çerez → `/admin/summary` **gerçek veri** (43 oyun başlangıcı/13 tamam, mod+dil dağılımı) → `/admin/words` 200; oturumsuz/yanlış-parola 401. Panel: https://kelimebaz.aicirkit.com/berk/rooms/admin (yalnız parola). Telemetri de gerçek veri topluyor (doğrulandı).

2. **Koloni online özellikleri (skor tablosu/klan/köy) hâlâ kapalı:** Koloni paketinden bekleyen `sudo python3 ~/nginx-koloni-api.py` HENÜZ çalıştırılmamış → `/api/leaderboard` 405. (Tekil-oyunculu koloni + kaydet/yükle çalışıyor; yalnız online kısım bekliyor.)

3. **YZ ipucu ("Takıldım" LLM):** `ANTHROPIC_API_KEY` yok → kapalı (tasarım gereği; ücretsiz yerel ipucu zaten çalışıyor).

## Berk'in elle tamamlayacağı testler (fiziksel / çok-cihaz)
- **Panel:** ✅ sunucu tarafında uçtan uca doğrulandı (login+veri). Berk tarayıcıda da açabilir: https://kelimebaz.aicirkit.com/berk/rooms/admin (parola ile).
- **PWA telefon:** `https://kelimebaz.aicirkit.com` telefonda aç → "ana ekrana ekle" → **uçak modu** → aç → bir oyun oyna. (Mekanizma headless çevrimdışı testinde kanıtlandı.)
- **Çok oyunculu tur:** iki cihaz/sekmeden oda kur+katıl → bir turu **sonuna kadar** oyna (otomatik test kurulum+SSE'yi doğruladı; tam tur oynanışı 2 cihazla).
- **Sertifika (istenirse):** `sudo certbot renew --dry-run` (kurulumda geçmişti; timer zaten aktif).

## Doğrulama ortamı
Otomatik kontroller: gerçek tarayıcı (Playwright, çevrimdışı modu dahil) + `curl`/`openssl` dışarıdan + SSL Labs API + sunucu `systemctl`/`nginx`. Tüm kabul kriterleri (komşular sağlam, SSL ≥ A, çok oyunculu/PWA/koloni/sertifika çalışıyor) karşılandı; panel yalnız yukarıdaki tek komutla açılıp test edilecek.

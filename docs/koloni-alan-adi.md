# Mini Koloni 2D — koloni.aicirkit.com taşıması

Oyun artık **`https://koloni.aicirkit.com`** kökünden açılıyor (HTTPS,
Let's Encrypt — bkz. [`tls-sertifikalari.md`](tls-sertifikalari.md)).

## Durum

| Şey | Durum |
|---|---|
| Kökten açılış | ✅ `https://koloni.aicirkit.com/` → oyun (200) |
| Statik varlıklar | ✅ göreli yol; `music.mp3` kökte 200 (3.85 MB) — mutlak `/berk/` yolu YOK |
| Karışık içerik (mixed content) | ✅ YOK (tümü aynı köken/HTTPS) |
| Kaydet / yükle (localStorage) | ✅ kayıt + reload sonrası kalıcı (masaüstü + mobil doğrulandı) |
| Ses | ✅ `#bgMusic` (`music.mp3`) tam yüklendi (readyState 4) |
| Canvas / oynanış | ✅ koloni çiziliyor, mobil dokunmatik viewport çalışıyor |
| **Online özellikler (API)** | ⚠️ **düzeltme bekliyor** — aşağıya bak |

## ⚠️ Online backend (skor tablosu, klan, köy, savaş, satın alma)

Oyun "tek dosya" görünse de **online özellikleri** var: göreli `api/*` çağrıları
yapıyor (`api/leaderboard`, `api/clans`, `api/village`, `api/war`,
`api/purchases`, `api/colony`…). Bunlar **127.0.0.1:4242** backend'ine gider.

- Eski konumda (`/berk/`): göreli `api/*` → `/berk/api/*` → nginx proxy →
  4242 → **çalışıyor** (leaderboard POST 200, purchases GET 200).
- Alan adı kökünde: göreli `api/*` → `/api/*`. koloni vhost'unda `/api/`
  proxy'si olmadığı için istekler statik `index.html`'e düşüyordu → POST'ta
  **405**, GET'te **HTML (200 ama JSON değil)** → online özellikler sessizce
  **kırık**.

**Düzeltme:** koloni vhost'una eski `/berk/api/` ile birebir aynı `/api/`
proxy'sini ekleyen script → [`rooms-server/nginx_koloni_api.py`](../rooms-server/nginx_koloni_api.py)
(sunucuda `~/nginx-koloni-api.py`). root gerektirir, güvenli/idempotent
(yedek + `nginx -t` + geri-yükleme). Çalıştır:

```bash
sudo python3 ~/nginx-koloni-api.py
```

> Bu uygulanınca online özellikler alan adında da çalışır ve konsoldaki 405
> temizlenir.

## Eski adresin akıbeti: KALIYOR (yönlendirme YOK) — karar + gerekçe

Eski `http://34.158.136.9/berk/` çalışmaya **devam ediyor**, yeni adrese
**yönlendirilmiyor**. Neden:

- **Kayıtlar kökene bağlı.** localStorage (ve içindeki koloni kaydı/oturumu)
  kökene özeldir. IP'de (`http://34.158.136.9`) oynamış bir oyuncunun kaydı,
  farklı köken olan `koloni.aicirkit.com`'da **görünmez** — bu beklenen tarayıcı
  davranışı. Eğer eski adresi yeniye yönlendirseydik, o oyuncular kayıtlarını
  "kaybolmuş" görürdü. Eski adresi bırakınca kayıtlarıyla oynamaya devam ederler.
- İki adres de aynı `/var/www/berk` kökünü ve aynı 4242 backend'ini kullanır;
  ikisini birden tutmanın maliyeti yok.

**Oyunculara not:** Yeni `koloni.aicirkit.com` adresi TEMİZ bir başlangıçtır
(yeni köken → yeni yerel kayıt). Eski kaydınla oynamak istiyorsan eski adresten
gir. (Sunucu tarafı hesap veritabanı 4242'de ORTAK olduğundan, aynı kullanıcı
adıyla kayıt olursan online ilerleme paylaşılır; yerel tekil-oyunculu kaydın ise
kökene özeldir.)

## Özet

- Statik/tekil-oyunculu taşıma: **tamam**, ek kod değişikliği gerekmedi
  (kaynak zaten göreli yol kullanıyor).
- Online özellikler için tek `/api/` proxy eklemesi gerekti (yukarıdaki script).
- Eski adres: kalıyor, yönlendirilmiyor.

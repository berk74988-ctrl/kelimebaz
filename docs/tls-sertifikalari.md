# TLS Sertifikaları (HTTPS) — kelimebaz.aicirkit.com · koloni.aicirkit.com

İki alan adı için **Let's Encrypt** ücretsiz TLS sertifikaları. Tarayıcılar
güvenir; 90 günde bir **kendiliğinden yenilenir** (elle iş yok).

## Özet

| Alan adı | Sertifika | Yenileme |
|---|---|---|
| `kelimebaz.aicirkit.com` | Let's Encrypt (ayrı sertifika) | otomatik (`certbot.timer`) |
| `koloni.aicirkit.com` | Let's Encrypt (ayrı sertifika) | otomatik (`certbot.timer`) |

Ayrı sertifika alındı (tek birleşik değil): birini taşırsan/silersen diğeri
etkilenmez.

## Nerede saklanıyor (sunucu: `berk@34.158.136.9`)

- **Sertifikalar:** `/etc/letsencrypt/live/<alan-adı>/` (`fullchain.pem`,
  `privkey.pem`). Bu dizini elle DÜZENLEME — certbot yönetir.
- **Yenileme yapılandırması:** `/etc/letsencrypt/renewal/<alan-adı>.conf`.
- **nginx:** `certbot --nginx` her alan adının `server_name` bloğuna
  `listen 443 ssl` + `ssl_certificate*` satırlarını ve 80→443 kalıcı
  yönlendirmesini ekledi. Yapılandırma: `/etc/nginx/sites-available/cinar`
  (kurulumdan önce `*.bak.tls.*` olarak yedeklendi).

## Otomatik yenileme mekanizması

- **`certbot.timer`** (systemd) günde 2 kez çalışır; bir sertifikanın bitişine
  **30 günden az** kalınca sessizce yeniler. Kontrol:
  ```bash
  systemctl list-timers | grep certbot
  ```
- Yenilenince nginx yeni sertifikayı alsın diye iki güvence var:
  1. `certbot --nginx` eklentisinin kendi reload'u,
  2. genel **deploy-hook**: `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`
     → `systemctl reload nginx`.
- Yenilemenin gerçekten çalıştığı **prova** ile doğrulandı:
  ```bash
  sudo certbot renew --dry-run   # başarılı çıkmalı
  ```

## Bitiş tarihi / durum nasıl görülür

```bash
sudo certbot certificates
```
Her sertifikanın alan adlarını, **bitiş tarihini** (Expiry Date, ~90 gün) ve
dosya yolunu listeler. Bitişe 30 günden az kalınca timer otomatik yeniler;
kural olarak elle bir şey yapılması gerekmez.

## Kurulum / yeniden kurulum

Tek script her şeyi yapar (kur → prova → gerçek sertifika → timer → yenileme
provası): [`rooms-server/certbot_setup.sh`](../rooms-server/certbot_setup.sh).
Sunucuda `~/certbot-setup.sh` olarak durur. root gerekir:

```bash
sudo bash ~/certbot-setup.sh
```

Güvenli ve tekrar çalıştırılabilir: nginx yapılandırmasını (3 site paylaşır)
önce yedekler, `nginx -t` ile doğrular, geçmezse yeniden yüklemez; Let's
Encrypt'in haftalık 5 sertifika sınırını bosa harcamamak için önce `--dry-run`
prova yapar, geçerli sertifika varsa yeniden almaz (`--keep-until-expiring`).

## Bitiş tarihleri (kurulumdan sonra doldurulacak)

> Kurulum çalıştırıldığında `sudo certbot certificates` çıktısından gerçek
> tarihler buraya yazılacak. (İlk kurulum: _bekleniyor_.)

- `kelimebaz.aicirkit.com` → bitiş: _—_
- `koloni.aicirkit.com` → bitiş: _—_

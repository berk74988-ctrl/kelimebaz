#!/usr/bin/env bash
#
# kelimebaz.aicirkit.com + koloni.aicirkit.com icin Let's Encrypt TLS
# sertifikasi kurar ve 90 gunde bir OTOMATIK yenilenmesini garanti eder.
#
# ON KOSUL (onceki paket): nginx'te bu iki alan adi icin server_name bloklari
# EKLI olmali (kelimebaz.aicirkit.com + koloni.aicirkit.com). certbot --nginx
# yapilandirmayi server_name'den okur; 443 dinleyicisini certbot'un kendisi ekler.
#
# GUVENLI: nginx yapilandirmasi 3 stajyerin sitesini paylasiyor → dokunmadan once
# YEDEK alir; certbot degisiklikten sonra `nginx -t` ile dogrular, gecmezse
# yeniden yuklemez. Once --dry-run ile PROVA eder (Let's Encrypt haftalik 5
# sertifika sinirini bosa harcamamak icin); prova gecmezse GERCEK sertifikaya
# hic gecmez. Tekrar calistirilabilir: gecerli sertifika varsa yeniden almaz
# (--keep-until-expiring).
#
# CALISTIR (root gerekir):
#     sudo bash certbot_setup.sh
#
set -euo pipefail

# Let's Encrypt hesabi + sona-erme uyarilari icin e-posta (degistirmek serbest).
EMAIL="aicirkitstaj@gmail.com"
DOMAINS=(kelimebaz.aicirkit.com koloni.aicirkit.com)
NGINX_CFG="/etc/nginx/sites-available/cinar"

log() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mHATA: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root gerekiyor → 'sudo bash certbot_setup.sh' ile calistir."

# ── 1) certbot + nginx eklentisi ─────────────────────────────────────────────
log "1/6  certbot + python3-certbot-nginx kuruluyor"
if ! command -v certbot >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
fi
certbot --version || die "certbot kurulamadi."
# nginx eklentisi geldi mi?
certbot plugins 2>/dev/null | grep -q nginx || die "nginx eklentisi YOK (python3-certbot-nginx eksik)."
echo "  ✓ certbot + nginx eklentisi hazir"

# ── 2) nginx yapilandirmasini YEDEKLE (3 site paylasiyor) ────────────────────
log "2/6  nginx yapilandirmasi yedekleniyor"
BAK="${NGINX_CFG}.bak.tls.$(date +%Y%m%d-%H%M%S)"
cp -a "$NGINX_CFG" "$BAK"
echo "  ✓ yedek: $BAK"
nginx -t || die "nginx yapilandirmasi ZATEN bozuk — certbot'a girmeden duruyorum."

# ── 3) Her alan adi icin ONCE prova, sonra gercek sertifika ──────────────────
# Ayri ayri aliyoruz (ticket onerisi): birini tasirsan digeri etkilenmez.
for d in "${DOMAINS[@]}"; do
  log "3/6  $d — once --dry-run PROVA"
  certbot certonly --nginx -d "$d" --dry-run \
    --non-interactive --agree-tos -m "$EMAIL" \
    || die "$d icin PROVA basarisiz — gercek sertifika HARCANMADI. Once bunu coz (DNS/80 erisimi?)."
  echo "  ✓ $d prova gecti"

  log "3/6  $d — GERCEK sertifika + nginx'e kur + 80→443 yonlendirme"
  certbot --nginx -d "$d" --redirect --keep-until-expiring \
    --non-interactive --agree-tos -m "$EMAIL" \
    || die "$d icin gercek sertifika/kurulum basarisiz."
  echo "  ✓ $d icin sertifika alindi ve nginx'e kuruldu"
done

# ── 4) nginx dogrula + yeniden yukle ─────────────────────────────────────────
log "4/6  nginx dogrulama + yeniden yukleme"
nginx -t || { cp -a "$BAK" "$NGINX_CFG"; die "certbot sonrasi nginx -t BASARISIZ → yedek geri yuklendi."; }
systemctl reload nginx
echo "  ✓ nginx yeniden yuklendi"

# ── 5) Otomatik yenileme: timer aktif + yenileme provasi ─────────────────────
log "5/6  otomatik yenileme kuruldu mu?"
# Debian certbot paketi systemd timer kurar; garanti icin etkinlestir.
systemctl enable --now certbot.timer 2>/dev/null || true
# Yenileme sonrasi nginx yeniden yuklensin diye deploy-hook (nginx eklentisi de
# yapar; bu ek guvence — tum sertifikalar icin gecerli genel kanca).
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/usr/bin/env bash
# Sertifika yenilenince nginx'i yeniden yukle (yeni sertifikayi al).
systemctl reload nginx
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

echo "  --- systemctl list-timers | grep certbot ---"
systemctl list-timers 2>/dev/null | grep -i certbot || echo "  (timer listede gorunmedi — asagidaki renew --dry-run yine de gecmeli)"

log "5/6  YENILEME PROVASI (certbot renew --dry-run)"
certbot renew --dry-run || die "renew --dry-run BASARISIZ — otomatik yenileme guvenli degil, coz."
echo "  ✓ yenileme provasi gecti → 90 gunde bir kendiliginden yenilenecek"

# ── 6) Ozet ──────────────────────────────────────────────────────────────────
log "6/6  Kurulu sertifikalar"
certbot certificates 2>/dev/null | grep -E "Certificate Name|Domains|Expiry Date|Certificate Path" || true

echo ""
printf '\033[1;32m✅ BITTI. Artik https://%s ve https://%s tarayicida uyarisiz acilmali.\033[0m\n' "${DOMAINS[0]}" "${DOMAINS[1]}"
echo "   Yenileme: certbot.timer (gunde 2x kontrol, <30 gun kalinca yeniler) + deploy-hook nginx reload."
echo "   nginx yedegi: $BAK"

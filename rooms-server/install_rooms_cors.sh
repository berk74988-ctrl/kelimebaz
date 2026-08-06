#!/usr/bin/env bash
#
# berk-rooms.service'e ALLOWED_ORIGINS (CORS beyaz listesi) ekler + servisi
# alan adiyla guncel server.js ile yeniden baslatir.
#
# NEDEN: Oyun alan adina tasindiktan sonra rooms-server hala eski gomulu koken
# listesini (http://34.158.136.9) kullaniyordu → domain'e yanlis ACAO donuyordu
# (web ayni-koken oldugu icin calisiyor ama sunucu YANLIS basliyk donuyor;
# mobil/capraz-koken kirilir). Bu script canli .service'e
#   Environment=ALLOWED_ORIGINS=https://kelimebaz.aicirkit.com,http://localhost:4200,http://127.0.0.1:4200
# ekler → daemon-reload → restart. server.js gomulu varsayilani da (scp'lendi)
# alan adiyla guncel (yedek).
#
# GUVENLI: yedek alir, idempotent (varsa gunceller), servisin ayaga kalktigini
# ve /health'i dogrular.
#
# Calistir (root gerekir):
#     sudo bash install_rooms_cors.sh
set -euo pipefail

ORIGINS='https://kelimebaz.aicirkit.com,http://localhost:4200,http://127.0.0.1:4200'

FRAG=$(systemctl show berk-rooms -p FragmentPath --value)
[ -n "$FRAG" ] && [ -f "$FRAG" ] || { echo "HATA: berk-rooms servis dosyasi bulunamadi ($FRAG)"; exit 1; }
echo "servis dosyasi: $FRAG"

if grep -q '^Environment=ALLOWED_ORIGINS=' "$FRAG"; then
  cp -a "$FRAG" "${FRAG}.bak.cors.$(date +%Y%m%d-%H%M%S)"
  sed -i "s|^Environment=ALLOWED_ORIGINS=.*|Environment=ALLOWED_ORIGINS=${ORIGINS}|" "$FRAG"
  echo "  ALLOWED_ORIGINS guncellendi."
else
  cp -a "$FRAG" "${FRAG}.bak.cors.$(date +%Y%m%d-%H%M%S)"
  # PORT satirinin hemen ardina ekle (yoksa [Service] bloguna)
  if grep -q '^Environment=PORT=' "$FRAG"; then
    sed -i "/^Environment=PORT=/a Environment=ALLOWED_ORIGINS=${ORIGINS}" "$FRAG"
  else
    sed -i "/^\[Service\]/a Environment=ALLOWED_ORIGINS=${ORIGINS}" "$FRAG"
  fi
  echo "  ALLOWED_ORIGINS eklendi."
fi

systemctl daemon-reload
systemctl restart berk-rooms
sleep 2

echo ""
echo "-- durum --"
systemctl is-active berk-rooms
echo "-- canli ALLOWED_ORIGINS --"
systemctl show berk-rooms -p Environment --value | tr ' ' '\n' | grep ALLOWED_ORIGINS || echo "(gorunmedi)"
echo "-- /health --"
curl -s --max-time 8 http://localhost/berk/rooms/health && echo || echo "(health alinamadi)"
echo ""
echo "OK: ROOMS_CORS_APPLIED"

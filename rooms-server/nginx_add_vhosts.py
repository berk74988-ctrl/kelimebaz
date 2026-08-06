#!/usr/bin/env python3
"""
cinar nginx'e kelimebaz.aicirkit.com + koloni.aicirkit.com icin AYRI server
bloklari GUVENLE ekler (server_name bazli sanal host).

MEVCUT DEFAULT BLOK DEGISMEZ -> IP uzerinden cinar (/), emre (/emre/), berk
(/berk/*), bilgi-kupu yollari AYNEN calismaya devam eder. Yalnizca iki yeni blok
EKLENIR; geri donus = bu iki blogu silmek (yedekten geri yukle).

Guvenlik (rooms-server/nginx_add_rooms.py ile ayni desen):
  - Tarihli YEDEK alir (cinar.bak.vhost.YYYYMMDD-HHMMSS).
  - Ekler, sonra `nginx -t` ile DOGRULAR.
  - Test BASARISIZSA yedekten GERI YUKLER ve durur (3 stajyerin sitesi ayni
    dosyada; asla bozulmamali).
  - Idempotent: bloklar zaten varsa hic dokunmaz.
  - Basarili ise `systemctl reload nginx` (restart DEGIL — kesintisiz).

Calistir (root gerekir):
    sudo python3 nginx_add_vhosts.py
"""
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'

# Kelimebaz build'i base-href="/berk/kelimebaz/" kullanir -> root /var/www ile o
# yolu kok olarak servis et + rooms/api backend'lerini proxy'le.
# Koloni (Mini Koloni 2D) goreli yol kullanir (base-href yok) -> root /var/www/berk yeter.
BLOCKS = """
# ===== kelimebaz.aicirkit.com (server_name bazli vhost) =====
server {
    listen 80;
    listen [::]:80;
    server_name kelimebaz.aicirkit.com;

    root /var/www;
    index index.html;

    # Kok -> Kelimebaz SPA (build base-href /berk/kelimebaz/ ile uyumlu)
    location = / {
        add_header Cache-Control "no-cache, must-revalidate" always;
        try_files /berk/kelimebaz/index.html =404;
    }

    # Rooms-server API (oda + ipucu) -- kelimebaz backend
    location /berk/rooms/ {
        proxy_pass http://127.0.0.1:4243/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /berk/api/ {
        proxy_pass http://127.0.0.1:4242/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    # Varliklar (/berk/kelimebaz/*) + SPA yollar
    location / {
        try_files $uri $uri/ /berk/kelimebaz/index.html;
    }
}

# ===== koloni.aicirkit.com (Mini Koloni 2D) =====
server {
    listen 80;
    listen [::]:80;
    server_name koloni.aicirkit.com;

    root /var/www/berk;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
"""


def main():
    with open(CFG) as f:
        txt = f.read()

    if 'kelimebaz.aicirkit.com' in txt or 'koloni.aicirkit.com' in txt:
        print('ALREADY_PRESENT (bloklar zaten var, dokunulmadi)')
        return 0

    bak = CFG + '.bak.vhost.' + time.strftime('%Y%m%d-%H%M%S')
    shutil.copy2(CFG, bak)

    with open(CFG, 'w') as f:
        f.write(txt.rstrip('\n') + '\n' + BLOCKS)

    test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    if test.returncode != 0:
        shutil.copy2(bak, CFG)  # 3 siteyi koru: aynen geri yukle
        print('NGINX_TEST_FAILED_RESTORED -> hicbir sey degismedi.')
        print('yedek: ' + bak)
        print(test.stderr[-600:])
        return 3

    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    print('OK: VHOSTS_ADDED_AND_RELOADED')
    print('yedek: ' + bak)
    return 0


if __name__ == '__main__':
    sys.exit(main())

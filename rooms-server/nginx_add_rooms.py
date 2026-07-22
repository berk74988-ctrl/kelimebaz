#!/usr/bin/env python3
"""
cinar nginx yapılandırmasına /berk/rooms/ -> :4243 proxy yolunu GÜVENLE ekler.

Güvenlik: yedek alır, ekler, `nginx -t` ile doğrular; test başarısızsa yedekten
GERİ YÜKLER (paylaşılan sunucu — cinar'ın sitesi asla bozulmamalı). Dosya
içeriğini yazdırmaz; yalnızca durum ve (yalnız hata halinde) nginx test çıktısı.
Idempotent: yol zaten varsa dokunmaz.
"""
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'

BLOCK = (
    "    location /berk/rooms/ {\n"
    "        proxy_pass http://127.0.0.1:4243/;\n"
    "        proxy_http_version 1.1;\n"
    "        proxy_set_header Host $host;\n"
    "        proxy_set_header X-Real-IP $remote_addr;\n"
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n"
    "    }\n\n"
)

with open(CFG) as f:
    txt = f.read()

if 'berk/rooms' in txt:
    print('ALREADY_PRESENT')
    sys.exit(0)

anchor = txt.find('location /berk/api/')
if anchor == -1:
    print('ANCHOR_NOT_FOUND')
    sys.exit(2)

line_start = txt.rfind('\n', 0, anchor) + 1  # api location satırının başı
bak = CFG + '.bak.rooms.' + time.strftime('%Y%m%d-%H%M%S')
shutil.copy2(CFG, bak)

new_txt = txt[:line_start] + BLOCK + txt[line_start:]
with open(CFG, 'w') as f:
    f.write(new_txt)

test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
if test.returncode != 0:
    shutil.copy2(bak, CFG)  # cinar'ı koru: geri yükle
    print('NGINX_TEST_FAILED_RESTORED')
    print(test.stderr[-400:])
    sys.exit(3)

subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
print('ROOMS_LOCATION_ADDED_AND_RELOADED (yedek: ' + bak + ')')

#!/usr/bin/env python3
"""
koloni.aicirkit.com vhost'una ONLINE BACKEND proxy'si (/api/) ekler.

NEDEN: Mini Koloni 2D "tek dosya" sanilsa da online ozellikleri var (skor
tablosu, klan, koy, savas, satin alma). Oyun KOKTEN goreli "api/*" cagirir →
alan adinda "/api/*" olur. Eski konumda (/berk/) bu "/berk/api/" → 127.0.0.1:4242
backend'ine gidip CALISIYOR; ama koloni.aicirkit.com vhost'unda "/api/" proxy'si
YOK → istekler statik "/index.html"e dusuyor (POST'ta 405, GET'te HTML donuyor)
→ online ozellikler KIRIK. Bu script ayni backend'e "/api/" proxy'si ekleyerek
duzeltir (eski "/berk/api/" ile birebir ayni: proxy_pass .../4242/).

GUVENLI (nginx_add_vhosts.py ile ayni desen):
  - Tarihli YEDEK alir; ekler; `nginx -t` ile DOGRULAR; gecmezse GERI YUKLER.
  - Idempotent: "koloni-api-proxy" imi varsa hic dokunmaz.
  - Basarili ise `systemctl reload nginx` (kesintisiz).
  - Yalnizca koloni.aicirkit.com'un icerik (443) blogundaki tek yere dokunur;
    diger 3 site (cinar/emre/berk IP + kelimebaz) etkilenmez.

Calistir (root gerekir):
    sudo python3 nginx_koloni_api.py
"""
import re
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'
MARKER = 'koloni-api-proxy'

API_BLOCK = """
    # --- {marker} --- Mini Koloni online backend (skor/klan/koy/savas/satin alma).
    # Oyun kokten goreli "api/*" cagirir; eski /berk/api/ ile AYNI backend (4242).
    location /api/ {{
        proxy_pass http://127.0.0.1:4242/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 30s;
    }}
""".format(marker=MARKER)

# koloni icerik blogunun IMZASI: root /var/www/berk + index + location / (try_files
# .../index.html). Bu dizi YALNIZ koloni blogunda var (kelimebaz root /var/www +
# /berk/kelimebaz/index.html kullanir) → yanlis bloga dokunmayiz.
ANCHOR_RE = re.compile(
    r'(root\s+/var/www/berk;\s*\n\s*index\s+index\.html;\s*\n)'
    r'(\s*location\s*/\s*\{)'
)


def main():
    with open(CFG) as f:
        txt = f.read()

    if MARKER in txt:
        print('ALREADY_PRESENT (koloni /api/ proxy zaten var, dokunulmadi)')
        return 0

    m = ANCHOR_RE.search(txt)
    if not m:
        print('ANCHOR_NOT_FOUND — koloni icerik blogu beklenen bicimde degil.')
        print('Elle eklenmeli; hicbir sey degistirilmedi.')
        return 2

    new_txt = txt[:m.end(1)] + API_BLOCK + '\n' + txt[m.start(2):]

    bak = CFG + '.bak.koloniapi.' + time.strftime('%Y%m%d-%H%M%S')
    shutil.copy2(CFG, bak)
    with open(CFG, 'w') as f:
        f.write(new_txt)

    test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
    if test.returncode != 0:
        shutil.copy2(bak, CFG)  # 4 siteyi koru: aynen geri yukle
        print('NGINX_TEST_FAILED_RESTORED -> hicbir sey degismedi.')
        print('yedek: ' + bak)
        print(test.stderr[-600:])
        return 3

    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    print('OK: KOLONI_API_PROXY_ADDED_AND_RELOADED')
    print('yedek: ' + bak)
    return 0


if __name__ == '__main__':
    sys.exit(main())

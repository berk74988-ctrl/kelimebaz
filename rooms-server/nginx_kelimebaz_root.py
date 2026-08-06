#!/usr/bin/env python3
"""
Kelimebaz'i kokten (base-href "/") yayina alir: nginx kelimebaz.aicirkit.com
vhost kokunu build dizinine ceker + eski IP yolunu alan adina 301 yonlendirir +
YENI build'i deploy eder. Hepsi TEK, GUVENLI, geri-alinabilir adimda.

NE YAPAR (sirayla):
  1) nginx cfg YEDEK.
  2) kelimebaz.aicirkit.com vhost:
       root /var/www  ->  root /var/www/berk/kelimebaz   (base-href "/" varliklari
       kokten cozer)  ·  ozel "location = /" blogu kaldirilir  ·  SPA fallback
       /berk/kelimebaz/index.html -> /index.html.  /berk/rooms/ + /berk/api/
       proxy'leri AYNEN kalir (oyun bunlari mutlak yolla cagirir).
  3) default (IP) vhost'a: /berk/kelimebaz/ -> https://kelimebaz.aicirkit.com/$1
       kalici (301) yonlendirme (alt yol korunur → bookmark + Kelimebaz.apk).
  4) nginx -t → GECMEZSE yedekten GERI YUKLE ve dur (4 site paylasiyor).
  5) YENI build'i deploy et (kb-deploy.sh — ~/kb-deploy'da hazir olmali).
  6) systemctl reload nginx.

GUVENLI: exact-string degisim; herhangi bir capa bulunmazsa HIC dokunmadan durur
(kismi duzenleme yok). Idempotent: kok zaten degismisse yeniden yapmaz.

ON KOSUL: yeni build (base-href "/") ~/kb-deploy'a scp'lenmis olmali.

Calistir (root gerekir):
    sudo python3 nginx_kelimebaz_root.py
"""
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'
KB_DEPLOY = '/home/berk/kb-deploy/kb-deploy.sh'

# (capa, yeni) — capa cfg'de TAM olarak 1 kez gecmeli.
R1_OLD = """    root /var/www;
    index index.html;

    # Kok -> Kelimebaz SPA (build base-href /berk/kelimebaz/ ile uyumlu)
    location = / {
        add_header Cache-Control "no-cache, must-revalidate" always;
        try_files /berk/kelimebaz/index.html =404;
    }"""
R1_NEW = """    root /var/www/berk/kelimebaz;
    index index.html;

    # Kok'ten Kelimebaz SPA'yi dogrudan servis et (build base-href "/")."""

R2_OLD = """    # Varliklar (/berk/kelimebaz/*) + SPA yollar
    location / {
        try_files $uri $uri/ /berk/kelimebaz/index.html;
    }"""
R2_NEW = """    # Varliklar (kokten) + SPA yollar
    location / {
        try_files $uri $uri/ /index.html;
    }"""

R3_OLD = """    location /berk/ {
        root /var/www;
        index index.html;
        try_files $uri $uri/ /berk/index.html;
    }"""
R3_NEW = """    # kelimebaz-ip-redirect: eski IP yolu -> alan adina 301 (alt yol korunur)
    location /berk/kelimebaz/ {
        rewrite ^/berk/kelimebaz/(.*)$ https://kelimebaz.aicirkit.com/$1 permanent;
    }
    location /berk/ {
        root /var/www;
        index index.html;
        try_files $uri $uri/ /berk/index.html;
    }"""

REPLACEMENTS = [('R1 kok', R1_OLD, R1_NEW), ('R2 SPA fallback', R2_OLD, R2_NEW),
                ('R3 IP redirect', R3_OLD, R3_NEW)]


def main():
    with open(CFG) as f:
        txt = f.read()

    if 'root /var/www/berk/kelimebaz;' in txt and 'kelimebaz-ip-redirect' in txt:
        print('ALREADY_APPLIED (kok + yonlendirme zaten var). Yalnizca deploy + reload.')
    else:
        for name, old, new in REPLACEMENTS:
            n = txt.count(old)
            if n != 1:
                print('ANCHOR_ERROR: %s capasi %d kez bulundu (1 olmali). Hicbir sey degismedi.' % (name, n))
                return 2
        for _name, old, new in REPLACEMENTS:
            txt = txt.replace(old, new, 1)

        bak = CFG + '.bak.kbroot.' + time.strftime('%Y%m%d-%H%M%S')
        shutil.copy2(CFG, bak)
        with open(CFG, 'w') as f:
            f.write(txt)

        test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if test.returncode != 0:
            shutil.copy2(bak, CFG)  # 4 siteyi koru
            print('NGINX_TEST_FAILED_RESTORED -> hicbir sey degismedi.')
            print('yedek: ' + bak)
            print(test.stderr[-800:])
            return 3
        print('OK: nginx cfg guncellendi + dogrulandi. yedek: ' + bak)

    # Yeni build'i deploy et (kb-deploy ~/kb-deploy'dan /var/www/berk/kelimebaz'a).
    print('\n-- kb-deploy.sh (yeni base-href "/" build) --')
    dep = subprocess.run(['bash', KB_DEPLOY], capture_output=True, text=True)
    sys.stdout.write(dep.stdout[-1500:])
    if dep.returncode != 0:
        sys.stderr.write(dep.stderr[-800:])
        print('\nDEPLOY_FAILED (nginx cfg guncel ama build eski olabilir). Cikti yukarida.')
        return 4

    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    print('\nOK: KELIMEBAZ_ROOT_LIVE — https://kelimebaz.aicirkit.com/ kokten yayinda.')
    return 0


if __name__ == '__main__':
    sys.exit(main())

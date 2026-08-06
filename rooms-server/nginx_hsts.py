#!/usr/bin/env python3
"""
HSTS'i TUTARLI ve KISA (max-age=300 sn) yapar — hem statik oyun/koloni
sayfalarina (nginx) hem panele (server.js).

NEDEN kisa: HSTS uzun max-age ile acilip bir sorun cikarsa tarayicilar aylarca
HTTPS dayatir, geri donus cok zor. Once 300 sn (5 dk) ile basla; her sey
oturunca uzat (1 yil + includeSubDomains + preload). Onceden panel (server.js)
YANLISLIKLA max-age=31536000 (1 yil) gonderiyordu → server.js 300'e indirildi;
bu script statik sayfalara da ayni 300'u ekler → her yer tutarli.

NE YAPAR:
  1) nginx: iki alan adinin (kelimebaz + koloni) `location /` bloguna
     `add_header Strict-Transport-Security "max-age=300" always;` ekler.
     (Yalniz statik icerik; /berk/rooms/ ayri location → panel kendi 300'unu yollar,
      cift baslik olmaz.)
  2) berk-rooms restart → server.js'in yeni 300 sn HSTS'i devreye girer.
  3) nginx -t + reload.

GUVENLI: yedek + nginx -t (gecmezse geri yukle) + idempotent.

Calistir (root gerekir):
    sudo python3 nginx_hsts.py
"""
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'

OLD = """    location / {
        try_files $uri $uri/ /index.html;
    }"""
NEW = """    location / {
        # HSTS — KISA max-age (300 sn); her sey oturunca uzat (geri donus zor).
        add_header Strict-Transport-Security "max-age=300" always;
        try_files $uri $uri/ /index.html;
    }"""


def main():
    with open(CFG) as f:
        cfg = f.read()

    if 'Strict-Transport-Security' in cfg:
        print('nginx: HSTS zaten ekli (dokunulmadi).')
    else:
        n = cfg.count(OLD)
        if n != 2:
            print('ANCHOR_ERROR: statik `location /` blogu %d bulundu (2 beklenir). Degismedi.' % n)
            return 2
        bak = CFG + '.bak.hsts.' + time.strftime('%Y%m%d-%H%M%S')
        shutil.copy2(CFG, bak)
        with open(CFG, 'w') as f:
            f.write(cfg.replace(OLD, NEW))
        test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if test.returncode != 0:
            shutil.copy2(bak, CFG)
            print('NGINX_TEST_FAILED_RESTORED -> hicbir sey degismedi.\n' + test.stderr[-500:])
            return 3
        print('nginx: HSTS (max-age=300) 2 statik bloga eklendi. yedek: ' + bak)

    # server.js'in 300 sn HSTS'i icin restart (panel 1 yil -> 300 sn)
    subprocess.run(['systemctl', 'restart', 'berk-rooms'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    time.sleep(2)

    print('\n-- dogrulama --')
    for url in ['https://kelimebaz.aicirkit.com/', 'https://koloni.aicirkit.com/',
                'https://kelimebaz.aicirkit.com/berk/rooms/admin']:
        r = subprocess.run(['curl', '-s', '-D', '-', '-o', '/dev/null', '--max-time', '8', url],
                           capture_output=True, text=True).stdout
        hsts = next((ln.strip() for ln in r.splitlines() if ln.lower().startswith('strict-transport')), '(HSTS YOK)')
        print('  %-52s %s' % (url, hsts))
    print('\nOK: HSTS_300_APPLIED')
    return 0


if __name__ == '__main__':
    sys.exit(main())

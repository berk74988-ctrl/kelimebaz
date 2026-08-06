#!/usr/bin/env python3
"""
YONETIM PANELINI CANLIDA ACAR (HTTPS artik var → panelin on kosulu tamam).

Iki eksigi giderir:
  1) nginx /berk/rooms/ proxy'si X-Forwarded-Proto ILETMIYORDU → panel auth'u
     "https_required" (400) donuyordu. Iki /berk/rooms/ bloguna da
     `proxy_set_header X-Forwarded-Proto $scheme;` ekler.
  2) ADMIN_PASS_HASH (scrypt karmasi) + ADMIN_SESSION_SECRET servise eklenmemisti
     → panel 503 (guvenle kapali). Verdigin PAROLADAN karma uretip servise ekler.

Sonra: nginx -t (gecmezse geri yukle) → daemon-reload → restart berk-rooms →
reload nginx → panel durumunu dogrular.

GUVENLI: nginx + servis dosyalarinin YEDEGINI alir; idempotent (varsa gunceller).
Parola DUZ METIN saklanmaz (yalniz scrypt karmasi env'e girer). Not: paroladan
gecmisde gorunmemesi icin, komut gecmisini sonra temizleyebilirsin.

Calistir (root gerekir):
    sudo python3 setup_admin_panel.py 'PANEL_PAROLAN'
"""
import os
import re
import sys
import shutil
import subprocess
import time

CFG = '/etc/nginx/sites-available/cinar'
HASH_TOOL = '/home/berk/rooms-server/admin-hash.mjs'


def die(msg):
    print('HATA: ' + msg, file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        die("kullanim: sudo python3 setup_admin_panel.py 'PAROLA'")
    pw = sys.argv[1]

    # --- 1) karma + oturum sirri uret ---
    try:
        h = subprocess.run(['node', HASH_TOOL, pw], capture_output=True, text=True, check=True)
        pass_hash = h.stdout.strip()
    except Exception as e:
        die('karma uretilemedi: ' + str(e))
    if not pass_hash.startswith('scrypt$'):
        die('beklenmeyen karma bicimi: ' + pass_hash[:20])
    secret = subprocess.run(['openssl', 'rand', '-hex', '32'], capture_output=True, text=True).stdout.strip()

    # --- 2) servis dosyasi: ADMIN_PASS_HASH + ADMIN_SESSION_SECRET ---
    frag = subprocess.run(['systemctl', 'show', 'berk-rooms', '-p', 'FragmentPath', '--value'],
                          capture_output=True, text=True).stdout.strip()
    if not frag or not os.path.isfile(frag):
        die('berk-rooms servis dosyasi bulunamadi: ' + frag)
    shutil.copy2(frag, frag + '.bak.admin.' + time.strftime('%Y%m%d-%H%M%S'))
    with open(frag) as f:
        svc = f.read()

    def set_env(text, key, val):
        line = 'Environment=%s=%s' % (key, val)
        if re.search(r'(?m)^Environment=%s=' % re.escape(key), text):
            return re.sub(r'(?m)^Environment=%s=.*$' % re.escape(key), line, text)
        # PORT satirinin ardina ekle
        return re.sub(r'(?m)^(Environment=PORT=.*)$', r'\1\n' + line, text, count=1)

    svc = set_env(svc, 'ADMIN_PASS_HASH', pass_hash)
    # SESSION_SECRET yalniz YOKSA ekle (mevcut oturumlar bozulmasin)
    if not re.search(r'(?m)^Environment=ADMIN_SESSION_SECRET=', svc):
        svc = set_env(svc, 'ADMIN_SESSION_SECRET', secret)
    with open(frag, 'w') as f:
        f.write(svc)
    print('  servise ADMIN_PASS_HASH (+ gerekiyorsa SESSION_SECRET) yazildi.')

    # --- 3) nginx: her /berk/rooms/ bloguna X-Forwarded-Proto ekle ---
    with open(CFG) as f:
        cfg = f.read()
    bak = CFG + '.bak.adminproto.' + time.strftime('%Y%m%d-%H%M%S')

    def add_proto(m):
        blk = m.group(0)
        if 'X-Forwarded-Proto' in blk:
            return blk
        return blk.replace(
            'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
            'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n'
            '        proxy_set_header X-Forwarded-Proto $scheme;',
        )

    new_cfg, n = re.subn(r'location /berk/rooms/ \{.*?\n    \}', add_proto, cfg, flags=re.DOTALL)
    if n == 0:
        die('/berk/rooms/ blogu bulunamadi (nginx degismedi).')
    if new_cfg != cfg:
        shutil.copy2(CFG, bak)
        with open(CFG, 'w') as f:
            f.write(new_cfg)
        test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if test.returncode != 0:
            shutil.copy2(bak, CFG)
            die('nginx -t BASARISIZ → geri yuklendi. ' + test.stderr[-400:])
        print('  nginx %d /berk/rooms/ bloguna X-Forwarded-Proto eklendi. yedek: %s' % (n, bak))
    else:
        print('  nginx: X-Forwarded-Proto zaten var.')

    # --- 4) uygula ---
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'restart', 'berk-rooms'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    time.sleep(2)

    # --- 5) dogrula ---
    code = subprocess.run(
        ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8',
         'https://kelimebaz.aicirkit.com/berk/rooms/admin'],
        capture_output=True, text=True).stdout.strip()
    active = subprocess.run(['systemctl', 'is-active', 'berk-rooms'], capture_output=True, text=True).stdout.strip()
    print('\n  berk-rooms: %s' % active)
    print('  GET /berk/rooms/admin → HTTP %s  (401/302/200 = panel ACIK; 400/503 = hala kapali)' % code)
    print('\nOK: ADMIN_PANEL_SETUP_DONE')
    print('Panel: https://kelimebaz.aicirkit.com/berk/rooms/admin  (kullanici alani yok; parolan)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

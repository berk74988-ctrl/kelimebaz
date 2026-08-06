#!/usr/bin/env python3
"""
YONETIM PANELINI CANLIDA ACAR (HTTPS artik var → panelin on kosulu tamam).

Uc eksigi giderir:
  1) nginx /berk/rooms/ proxy'si X-Forwarded-Proto ILETMIYORDU → panel auth'u
     "https_required" (400) donuyordu. Iki /berk/rooms/ bloguna da
     `proxy_set_header X-Forwarded-Proto $scheme;` ekler.
  2) ADMIN_PASS_HASH (scrypt karmasi) verdigin PAROLADAN uretilip **hint.env**'e
     (EnvironmentFile) yazilir. NEDEN hint.env: scrypt karmasi `$` DOLUDUR
     (scrypt$16384$8$1$...); systemd `Environment=` satirinda `$`'i degisken
     sanip BOZAR. EnvironmentFile degerleri LITERAL okunur → dogru. Ayrica
     `.service`'teki (varsa) bozuk Environment=ADMIN_PASS_HASH/SESSION_SECRET
     satirlari TEMIZLENIR.
  3) ADMIN_SESSION_SECRET (rastgele hex) da hint.env'e yazilir (yoksa).

hint.env EnvironmentFile en sonda yuklendigi icin dogru degerler kesin gecerli
olur. Sonra: nginx -t (gecmezse geri yukle) → daemon-reload → restart → reload
nginx → panel durumunu dogrular.

GUVENLI: nginx + servis + hint.env YEDEGI; idempotent. Parola DUZ METIN
saklanmaz (yalniz scrypt karmasi). Not: paroladan komut gecmisinde gorunmesin
diye sonra `history -c` yapabilirsin.

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
HINT_ENV = '/home/berk/rooms-server/hint.env'


def die(msg):
    print('HATA: ' + msg, file=sys.stderr)
    sys.exit(1)


def upsert(txt, key, val):
    line = '%s=%s' % (key, val)
    if re.search(r'(?m)^%s=' % re.escape(key), txt):
        return re.sub(r'(?m)^%s=.*$' % re.escape(key), lambda _m: line, txt)
    return (txt.rstrip('\n') + '\n' if txt.strip() else '') + line + '\n'


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        die("kullanim: sudo python3 setup_admin_panel.py 'PAROLA'")
    pw = sys.argv[1]
    ts = time.strftime('%Y%m%d-%H%M%S')

    # --- 1) karma + oturum sirri ---
    try:
        h = subprocess.run(['node', HASH_TOOL, pw], capture_output=True, text=True, check=True)
        pass_hash = h.stdout.strip()
    except Exception as e:
        die('karma uretilemedi: ' + str(e))
    if not pass_hash.startswith('scrypt$'):
        die('beklenmeyen karma bicimi: ' + pass_hash[:20])
    secret = subprocess.run(['openssl', 'rand', '-hex', '32'], capture_output=True, text=True).stdout.strip()

    # --- 2) hint.env'e ADMIN_PASS_HASH + SESSION_SECRET (LITERAL) ---
    env_txt = ''
    if os.path.isfile(HINT_ENV):
        shutil.copy2(HINT_ENV, HINT_ENV + '.bak.admin.' + ts)
        with open(HINT_ENV) as f:
            env_txt = f.read()
    env_txt = upsert(env_txt, 'ADMIN_PASS_HASH', pass_hash)
    if not re.search(r'(?m)^ADMIN_SESSION_SECRET=', env_txt):
        env_txt = upsert(env_txt, 'ADMIN_SESSION_SECRET', secret)
    with open(HINT_ENV, 'w') as f:
        f.write(env_txt)
    subprocess.run(['chown', 'berk:berk', HINT_ENV])
    os.chmod(HINT_ENV, 0o600)
    print('  hint.env yazildi (ADMIN_PASS_HASH + SESSION_SECRET, literal).')

    # --- 3) .service'ten BOZUK Environment=ADMIN_* satirlarini temizle ---
    frag = subprocess.run(['systemctl', 'show', 'berk-rooms', '-p', 'FragmentPath', '--value'],
                          capture_output=True, text=True).stdout.strip()
    if frag and os.path.isfile(frag):
        with open(frag) as f:
            svc = f.read()
        cleaned = re.sub(r'(?m)^Environment=ADMIN_PASS_HASH=.*\n?', '', svc)
        cleaned = re.sub(r'(?m)^Environment=ADMIN_SESSION_SECRET=.*\n?', '', cleaned)
        if cleaned != svc:
            shutil.copy2(frag, frag + '.bak.admin.' + ts)
            with open(frag, 'w') as f:
                f.write(cleaned)
            print('  .service temizlendi (bozuk Environment=ADMIN_* satirlari kaldirildi).')

    # --- 4) nginx: her /berk/rooms/ bloguna X-Forwarded-Proto ---
    with open(CFG) as f:
        cfg = f.read()

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
        shutil.copy2(CFG, CFG + '.bak.adminproto.' + ts)
        with open(CFG, 'w') as f:
            f.write(new_cfg)
        test = subprocess.run(['nginx', '-t'], capture_output=True, text=True)
        if test.returncode != 0:
            shutil.copy2(CFG + '.bak.adminproto.' + ts, CFG)
            die('nginx -t BASARISIZ → geri yuklendi. ' + test.stderr[-400:])
        print('  nginx X-Forwarded-Proto eklendi (%d blok).' % n)
    else:
        print('  nginx: X-Forwarded-Proto zaten var.')

    # --- 5) uygula ---
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', 'restart', 'berk-rooms'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    time.sleep(2)

    # --- 6) dogrula (login denemesi) ---
    login = subprocess.run(
        ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8',
         '-X', 'POST', '-H', 'Content-Type: application/json',
         '-d', '{"password":"__PWCHECK__"}'.replace('__PWCHECK__', pw.replace('"', '\\"')),
         'https://kelimebaz.aicirkit.com/berk/rooms/admin/login'],
        capture_output=True, text=True).stdout.strip()
    active = subprocess.run(['systemctl', 'is-active', 'berk-rooms'], capture_output=True, text=True).stdout.strip()
    print('\n  berk-rooms: %s' % active)
    print('  POST /admin/login (senin parolanla) → HTTP %s   (200 = GIRIS BASARILI!)' % login)
    print('\nOK: ADMIN_PANEL_SETUP_DONE')
    print('Panel: https://kelimebaz.aicirkit.com/berk/rooms/admin')
    return 0


if __name__ == '__main__':
    sys.exit(main())

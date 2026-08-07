# Güvenlik — sır rotasyonu ve geçmiş temizliği (6 Ağustos 2026)

## Olay
Yönetim paneli parolası (`verifyPassword('…')`) bir kez **düz metin olarak bir
commit mesajına** yazıldı (commit `a135f2c`) ve depo GitHub'da **herkese açık**
olduğundan geçmişe sızdı. Parola, systemd `$`-bozması tuzağı düzeltilirken kanıt
olarak yazılmıştı — değeri yerine "doğrulandı" demek yeterliydi.

## Alınan aksiyonlar

1. **Parola döndürüldü.** Yeni parola **rastgele + güçlü** (24 karakter) üretildi;
   yalnız sunucudaki `hint.env`'de (scrypt karması olarak) tutulur. Yeni parola
   hiçbir commit'e, koda, belgeye veya sohbete yazılmadı — kurulum scripti onu
   üretip **terminalde bir kez** gösterir (`setup_admin_panel.py --rotate`).
   Eski sızan parola zaten pasifti; yeni değerle kesin olarak geçersiz.

2. **Oturum sırrı (`ADMIN_SESSION_SECRET`) döndürüldü** — aynı script `--rotate`
   modunda onu da yeniler; mevcut panel çerezleri geçersizleşir (sorun değil).

3. **Git geçmişi temizlendi.** `git filter-branch --msg-filter` ile sızan parola
   TÜM commit mesajlarından `[REDACTED]` ile değiştirildi, ardından zorla push
   edildi. Öncesinde depo yedeği alındı (`git bundle`). Tek dal + tek geliştirici
   olduğu için geçmiş yeniden yazımı güvenli.

4. **Tekrarı engellendi.** `scripts/git-hooks/commit-msg` (→ `.git/hooks/`,
   `scripts/install-git-hooks.sh` ile kurulur): commit mesajında **sır DEĞERİ**
   kalıbı (gerçek anahtar `sk-ant-…`, `scrypt$…` karması, `ADMIN_PASS_HASH=…`
   /`ANTHROPIC_API_KEY=…` ataması, `verifyPassword('…')`, `password: …`) varsa
   commit'i reddeder. "parola/password/secret" gibi **kelimeler** serbesttir
   (yanlış pozitif yok — test edildi). Bilerek geçmek: `git commit --no-verify`.

## Geriye dönük tarama (tüm geçmiş)
`git log --all -p | grep -iE "password|parola|secret|sk-ant|ADMIN_PASS|scrypt$"`:
- **Tek gerçek sır:** panel parolası, yalnız `a135f2c` **mesajında** (temizlendi).
- **`sk-ant-…` / `sk-ant-api03-xxxx…`** → belge/skill içinde **örnek yer tutucular**,
  gerçek Anthropic anahtarı **değil**.
- **`scrypt$…` / `ADMIN_PASS_HASH=…`** → yorum/örnek şablonlar; gerçek karma değeri
  depoda **yok** (`hint.env` depoda değildir).
- Mevcut aktif parola git geçmişinde **hiç yer almadı**.
Sonuç: başka sızıntı yok.

## Depo görünürlüğü — KARAR
Depo **açık (public) kalıyor** — staj/portfolyo projesi + CI rozetleri için makul.
Şart: **"sunucuya ait hiçbir sır (parola/hash/anahtar/oturum sırrı) depoya veya
commit mesajına girmez"** kuralı artık commit-msg kancasıyla teknik olarak
zorlanıyor. Sırlar yalnız sunucuda (`hint.env`, `.service`) yaşar; bunlar
gitignore/repo-dışıdır. Berk isterse depoyu istediği an private yapabilir
(GitHub ayarı), ama açık kalması bu kuralla birlikte sorun değil.

## Ders
Bir sır bir kez yayınlandıysa **yanmıştır → döndürülür**. Kanıt/log yazarken sırrın
kendisi yerine "doğrulandı/eşleşti" yaz. Sırlar yalnız EnvironmentFile'da (literal),
asla commit mesajında/dosyada değil.

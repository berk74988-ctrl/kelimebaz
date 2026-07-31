# Sözlük denetimi — otomatik-üretim sahte kelimeleri

**Tarih:** 31 Temmuz 2026
**Kapsam:** Geçerli tahmin sözlüğü (`valid-words.json`) kalite cilası (OYUN düşük öncelik)

## Sorun

Geçerli tahmin sözlüğü üç katmanlı bir hatla (sözlük + Vikisözlük + korpus,
`turkish-morph.mjs` biçimbilim süzgeci) **otomatik** üretiliyor. Süzgeç
"dilbilgisel olarak türetilebilir mi?" der — ama dilbilgisel her şey gerçek bir
kelime değildir. Liste (100.410 kelime) insan gözü görmemişti; oyuncu uydurma
bir kelimeyi yazıp kabul edilince sözlüğe güveni sarsılabilir.

## Yöntem

Tüm listeyi denetlemek pahalı ve gereksiz. Bunun yerine **şüpheli alt küme**
ölçütlerle hedeflendi (`scripts/audit-dictionary.mjs`):

1. **Alışılmadık harf örüntüsü** — listenin geneline göre çok nadir üçlü-harf
   dizisi (trigram) içeren kelimeler (sözlüğün kendisi frekans referansı).
2. **Ünsüz kümesi** — Türkçe fonotaktiğine aykırı ardışık ünsüz yığılması.
3. **Uzunluk** — uzun türetilmiş biçimler daha sık uydurma.

Bir şüphe puanı hesaplanır; eşik ≥3 → **2.802 şüpheli**, en şüpheli 800'ü
incelemeye alındı. **Cevap havuzundaki (words.json) kelimeler şüpheli sayılmadı**
— onlar zaten küratörlü, dokunulmaz.

### LLM denetimi (anahtar bekliyor)

`audit-dictionary.mjs`, `ANTHROPIC_API_KEY` verilirse her şüpheliye "gerçek
Türkçe kelime mi?" sorup üç kovaya ayırır: **kesin-sil / şüpheli(elle) / tut**.
Anahtar gelince çalıştırılıp `remove` listesi kara listeye eklenir.

## Kara liste katmanı

Şüpheli liste **karışıktır**: gerçek-sahte (DVDLER, DOSTMUŞ, ÇNRA) ile
gerçek-ama-nadir (HENTBOL, JONGLÖR, PORTFÖY, AÇIKGÖZ, AYÇİÇEK, HAYROLA) bir
arada. **Yanlış silme, sahte tutmaktan kötüdür** (oyuncuyu daha çok kızdırır).

Bu yüzden v1 kara listesi (`src/app/data/blacklist-tr.json`) yalnızca **sıfır-
şüphe, yapısal olarak kelime OLMAYAN** biçimleri içerir:

- **Çekimli akronimler:** DVDLER, DVDLERE, DVDLERİ, VTRLERE, VTRLERİ
- **Kopula/cümle-parçası çöpü:** isim+imiş (DOSTMUŞ, RENKMİŞ, FİLMMİŞ, ÇİFTMİŞ,
  AŞKMIŞ), isim+sın (PUŞTSUN, NÖRDSÜN, FAKRSIN, BOSSSUN, KİLSSİN, SIDKSIN)
- **Fonotaktiğe aykırı çöp:** ÇNRA, AHZÜİTA, DIGIDIK, AYNCA, İRAELER, KEDDYİ,
  ÇIKINYI, DAŞDLAR, HAHNYUM

Kara liste iki yerde uygulanır:
- `build-dictionary.mjs` — kalıcı final katman (tam yeniden üretimde de çıkarır).
- `scripts/apply-blacklist.mjs` — ağsız, mevcut `valid-words.json`'a anında
  uygular. **Güvenlik:** kara liste cevap havuzuyla kesişirse HATA verir.

## Öncesi / sonrası

| | Kelime |
| --- | --- |
| **Önce** | 100.410 |
| **Sonra** | 100.385 |
| **Çıkarılan** | **25** (hepsi sıfır-şüphe sahte) |

**Örnek doğrulama:** Çıkarılan 25 kelimenin hepsi tek tek gözden geçirildi;
gerçek-ama-nadir olup şüpheli çıkan kelimeler (HENTBOL, JONGLÖR, PORTFÖY,
AÇIKGÖZ, AYÇİÇEK, HAYROLA, ALTKÜME, KÖŞEGEN…) **bilinçli olarak korundu**. Cevap
havuzundan hiçbir kelime silinmedi (betik bunu doğrular).

## İngilizce değerlendirmesi

EN sözlük (19.538) için de aynı ölçüt koşuldu (2.680 şüpheli). Ama İngilizce
**eklemeli değildir** → Türkçedeki morfolojik aşırı-üretim sorunu yoktur. En
şüpheliler neredeyse tamamı **gerçek kelime** (ABYSMAL, PLYWOOD, TWELFTH,
ANALYZE, ZEPHYR…) + özel ad + birkaç kısaltma (RSVP, BRRR). Bu yüzden **EN için
v1 kara listesi gerekmedi**; hat destekliyor, ileride LLM denetimiyle
değerlendirilebilir.

## Sonraki adım

Anahtar hazır olunca `node scripts/audit-dictionary.mjs tr` ile 800 şüpheli LLM
tarafından denetlenip `remove` kovası `blacklist-tr.json`'a eklenir (örneklemle
doğrulanarak). Altyapı hazır.

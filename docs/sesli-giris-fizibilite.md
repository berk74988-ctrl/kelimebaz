# Sesli giriş — fizibilite ve karar

**Tarih:** 1 Ağustos 2026
**Kapsam:** Web Speech API ile sesle tahmin girişi (deneysel, isteğe bağlı erişilebilirlik)

## Fizibilite: ölçüm neden CI'da yapılamadı (dürüst kısıt)

Bilet, "en az 50 kelime, 3 tarayıcı" ile Türkçe tek kelime tanıma doğruluğunun
ölçülmesini istiyor. Bu ölçümü **otomatik/CI ortamında yapamam**, çünkü:

- Gerçek bir **mikrofon** ve **insan sesi** gerekiyor (headless tarayıcıda yok).
- Web Speech API tanıma motoru **headless Chromium'da çalışmaz** — gerçek ses
  aygıtı + (çoğu tarayıcıda) Google'ın sunucusu gerekir.
- **Safari/iOS ve Firefox** bu Windows makinesinde yok; üç tarayıcı karşılaştırması
  ancak gerçek cihazlarda yapılabilir.

Bu, uydurulacak bir sayı değil. Bu yüzden ölçümü **Berk'in kendi cihazlarında**
çalıştıracağı bir araç yaptım.

### Ölçüm aracı — `tools/voice-feasibility.html`

Tek dosya, kurulum yok. Chrome / Safari / Firefox'ta aç, mikrofon izni ver:

1. Tarayıcı/cihaz etiketi yaz, dil (TR/EN) ve **söyleme biçimi** seç:
   **kelime** ("KALEM") veya **harf harf** ("K A L E M").
2. 50 hedef kelime tek tek gösterilir; her birini oku.
3. Araç, tanınan sesi oyunun harflerine indirger (uygulamayla **aynı** normalize:
   boşluk/noktalama atılır, büyük harfe çevrilir) ve hedefle **birebir** eşleşmeyi
   sayar. Recognizer'a adil olmak için 3 alternatiften herhangi biri tutarsa doğru.
4. Sonunda **%doğruluk** + kelime kelime döküm + kopyalanabilir rapor verir.

**Yapılacak:** aynı ölçümü her tarayıcıda ve **iki biçimde** (kelime / harf harf)
tekrarla; hangisinin daha güvenilir olduğunu sayı belirler. Raporları bu dosyaya
ekleyeceğiz.

### Bulgular (Berk'in cihaz ölçümleri buraya)

| Tarayıcı / cihaz | Dil | Biçim | Doğruluk |
| --- | --- | --- | --- |
| _(bekliyor)_ | tr-TR | kelime | _%_ |
| _(bekliyor)_ | tr-TR | harf harf | _%_ |

## Karar: özellik neden yine de eklendi (güvenli-tasarım)

Bilet "doğruluk yetersizse dur" diyor. Bu kural, tanınan kelimeyi **doğrudan
gönderen** bir tasarım için kritiktir. Bizim tasarımımız öyle **değil**:

> Duyulan kelime **tahtaya yazılır, GÖNDERİLMEZ.** Oyuncu görür; Enter'la onaylar
> ya da klav-/dokunmatikle düzeltir.

Bu tek karar, doğruluk riskini ortadan kaldırır: tanıma %60 bile olsa, yanlış
sonuç oyuncuyu yalnızca "düzelt/yeniden söyle"ye yönlendirir — asla geçersiz bir
tahmin göndermez, mevcut akışı bozmaz. Yani özellik **her doğrulukta güvenli** ve
**tamamen isteğe bağlı**. Bu yüzden ölçüm sonucunu beklemeden, tüm korumalarla
eklendi; ölçüm, ileride biçim (kelime/harf) varsayılanını ayarlamak için kullanılır.

Kelime ve harf-harf söyleme **ikisi de** desteklenir: normalize boşlukları
attığı için "KALEM" de "K A L E M" de aynı sonuca (KALEM) iner — oyuncu hangisini
doğal bulursa onu kullanır.

## Uygulanan korumalar (kabul kriterleri)

- **Desteklenmeyen tarayıcı:** `SpeechRecognition` yoksa buton **hiç render
  edilmez** (`VoiceInputService.supported`).
- **İzin reddi:** `not-allowed`/`service-not-allowed` → `denied` = true → buton
  **sessizce gizlenir**.
- **Onaydan önce yaz:** tanınan kelime `GameService.setCurrent` ile tahtaya
  yazılır; `submit()` çağrılmaz — oyuncu onaylar.
- **Gizlilik:** ilk kullanımda, sesin tarayıcıca işlendiğini ve sunucuya
  gönderilebileceğini açıkça söyleyen bir bilgilendirme çıkar; onaylanmadan
  dinleme başlamaz (`kelimebaz:voice-notice` ile bir kez).
- **Dil:** tanıma dili aktif oyun diline bağlı (`tr-TR` / `en-US`).
- **Anlaşılmayan sonuç:** boş/geçersiz tanımada "Anlaşılamadı, tekrar dene"
  (ekran okuyucuya da duyurulur).
- **Mevcut akış:** klavye ve dokunmatik giriş **hiç değişmedi** — sesli giriş
  ek bir yoldur, `type/backspace/submit` zinciri aynı.

## Dosyalar

- `src/app/core/voice.ts` — saf `voiceToLetters` (metin→harf), testli.
- `src/app/services/voice-input.service.ts` — Web Speech API sarmalayıcı.
- `src/app/components/game/game.*` — mikrofon butonu + gizlilik uyarısı.
- `tools/voice-feasibility.html` — cihazda çalışan ölçüm aracı.

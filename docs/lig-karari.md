# Karar: "Lig" → "Ustalık Yolu" (kişisel ilerleme)

**Tarih:** 31 Temmuz 2026
**Durum:** Kabul edildi ve uygulandı
**Karar veren:** Berk (ürün sahibi) — öneri üzerine

## Bağlam

Lig sistemi teknik olarak temiz (LP, kademeler, sezon süresi, sezon sonu
ödülleri, yumuşak LP sıfırlaması, Bronz koruması). Ama **gerçek bir lig değil**:
tüm veri istemcide (`kelimebaz:league`, localStorage). Sonuç olarak:

- **Rakip yok** — kimseyle yarışılmıyor, yalnızca kişinin kendi LP'si değişiyor.
- **Sıralama tablosu yok** — "Altın lig"desin ama kaçıncı sıradasın belirsiz.
- **Doğrulanabilir değil** — veri tarayıcıda; isteyen değiştirebilir.

"Lig" ve "Sezon" kelimeleri rekabet vaat ediyor; sistemse tek kişilik bir
ilerleme çubuğu. Bu boşluk fark edildiğinde güven kaybı yaratır.

## Değerlendirilen seçenekler

**Seçenek 1 — Dürüst konumlandırma (SEÇİLDİ):** "Lig/Sezon" dilini kişisel
ilerleme diline ("Ustalık Yolu") çevir. Sistem aynı kalır, vaat gerçeğe uyar.

**Seçenek 2 — Gerçek sunucu ligi (REDDEDİLDİ):** LP'yi sunucuya taşı, kalıcı
veri deposu + oyuncu kimliği + sıralama tablosu ekle.

## Karar ve gerekçe

**Seçenek 1 seçildi.** Gerekçe:

1. **Seçenek 2 kapsam dışı bir hesap sistemi gerektirir.** Projede bilinçli
   olarak hesap/kimlik doğrulama yok (backend, gizlilik nedenleriyle — bkz.
   veri dışa/içe aktarma kararı). rooms-server bellekte çalışır, kalıcı veri
   deposu yoktur.
2. **Kimlik olmadan sıralama tablosu yine doğrulanamaz.** Oyuncu kimliği
   olmadan herkes istediği isimle istediği LP'yi POST edebilir → "doğrulanamaz"
   sorunu çözülmez, yalnızca sunucuya taşınır. Gerçekten doğrulanabilir olması
   için kimlik doğrulama = kapsam dışı hesap sistemi şart.
3. **Sistem zaten kişisel bir ilerleme çubuğu.** Dürüst adlandırma, vaadi
   gerçeğe uydurarak güven boşluğunu kapatır — biletin asıl amacı budur.
4. **Ucuz, risksiz, veri kaybı yok.** Yalnızca etiketler değişir; LP hesabı,
   yumuşak sıfırlama, ödül akışı ve tüm mantık aynen kalır.
5. **İleriye açık.** Proje ileride hesap sistemi eklerse gerçek lig o zaman
   kurulabilir; bu karar onu engellemez.

## Uygulama

Kullanıcıya görünen dil değişti (tr + en), mantık değişmedi:

| Önce | Sonra (tr) | Sonra (en) |
| --- | --- | --- |
| Lig | Ustalık Yolu / Ustalık | Mastery Path / Mastery |
| Sezon {n} | {n}. Dönem | Chapter {n} |
| {lp} LP | {lp} puan | {lp} pts |
| Ligler (merdiven) | Ustalık kademeleri | Mastery ranks |
| Lig rozeti/madalyası (ödül) | Ustalık rozeti/madalyası | Mastery badge/medal |

- **Kademeler (Bronz → Usta) aynı kaldı** — zaten bir ustalık merdiveni gibi
  okunuyor, "Usta" ile zirveye çıkıyor.
- **Rekabet/sıralama ima eden dil kaldırıldı**; kişinin kendi merdivendeki
  konumu ("buradasın") korundu.

## Mevcut oyuncu verisi

**Kayıpsız korundu.** `kelimebaz:league` verisinin yapısı değişmedi (yalnızca
etiketler). Kademe/ödül `id`'leri (`badge.league`, `theme.champion` vb.)
**bilinçli olarak korundu** — envanterdeki (`kelimebaz:inv:owned`) sahip olunan
öğeler bozulmasın diye yalnızca görünen adlar güncellendi. Taşıma/sıfırlama
gerekmedi.

## Sezon sonu ödül akışı

Değişmedi, yalnızca yeniden çerçevelendi: 14 günlük "dönem" dolunca ulaşılan
kademeye göre ödül (`league.pending()` → `claim()`), sonra yumuşak sıfırlamayla
yeni dönem. Ödül modalı "Dönem tamamlandı → Ödülü Al · Yeni Döneme Başla" dilini
kullanır. Ödül içerikleri (altın + üst kademelerde tema/rozet) aynı.

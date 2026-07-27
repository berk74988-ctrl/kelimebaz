# YZ Zorluk Kalibrasyonu — Ölçüm Raporu

Yapay zekâ rakibinin zorluğu **oyun gücü** olarak ifade edilir: bot her zorlukta
**yalnız ipuçlarıyla tutarlı** (havuzdaki geçerli) kelime tahmin eder — asla
anlamsız/çelişen tahmin yapmaz. Zayıflık, entropi sıralamasında **daha aşağıdan
seçmekle** (`topK`) gelir.

Ölçüm: `npm run check:vsai` (`scripts/vsai-solver-test.mjs`) — 5 harfli **Türkçe**
cevap havuzu (230 kelime), her zorluk için **500 maç**, tohumlanmış rastgele cevaplar.

## Sonuç

| Zorluk | topK | Ort. tahmin | Hedef | Kazanma % | Dağılım (1–6 tahmin) |
|--------|------|-------------|-------|-----------|----------------------|
| Kolay  | 140  | **3.12**    | 3.15  | %100      | 4 · 122 · 208 · 143 · 22 · 1 |
| Orta   | 8    | **2.95**    | 2.90  | %100      | 1 · 132 · 266 · 91 · 10 · 0 |
| Zor    | 1    | **2.72**    | 2.75  | %100      | 5 · 172 · 283 · 40 · 0 · 0 |

- **Kolay–Zor farkı:** 0.40 tahmin · **Sıralama:** Kolay > Orta > Zor ✓
- **Her zorluk hedef ±0.3 bandında** ✓
- **En kötü tek tur düşünme süresi:** ~4 ms (< 100 ms) ✓
- **Çözümsüz kalma:** yok (havuz içi kelimelerde %100) ✓

## Neden hedefler 4.2 / ≥1.2 değil?

Ölçümler (500+ maç) şunu kanıtladı: **yalnız-tutarlı** oyunda bu havuzda
ulaşılabilir ortalama aralığı **~2.75 (hep en iyi) – ~3.3 (rastgele tutarlı aday)**.
Maksimum ayrışma ~0.5 tahmindir.

"Kolay ≈ 4.2 / fark ≥ 1.2" ancak bot **ipuçlarını boşa harcayan** (havuzu ele­meyen,
hatta çelişen) tahminler yaparsa mümkün olurdu — ki bu tam da düzeltmenin kaldırmak
istediği "gerçekçi olmayan aptallık"tır ve botun bazı maçları çözememesine yol açar.
Bu yüzden zorluk, **ulaşılabilir tutarlı aralığa** kalibre edildi; algılanan fark
ayrıca **düşünme temposuyla** (Kolay yavaş, Zor hızlı) desteklenir.

## `topK` nasıl çalışır?

Her tur adaylar entropiye (havuzu ne kadar eler) göre sıralanır; bot ilk `topK`
arasından rastgele birini seçer. `topK 1` → hep en iyi (Zor). Büyük `topK` → daha
zayıf ama **hâlâ geçerli ve tutarlı** tahmin (Kolay). Açılış kelimesi de derleme
zamanında **sıralı** hesaplanır (`scripts/build-ai-openers.mjs` → `core/ai-openers.ts`),
böylece ilk tur çalışma zamanında 0 maliyetlidir ve zorluk açılışa da yansır.

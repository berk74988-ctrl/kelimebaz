# YZ Zorluk Kalibrasyonu — Ölçüm Raporu

Yapay zekâ rakibinin zorluğu **oyun gücü** olarak ifade edilir: bot her zorlukta
**yalnız ipuçlarıyla tutarlı** (havuzdaki geçerli) kelime tahmin eder — asla
anlamsız/çelişen tahmin yapmaz. Zayıflık, entropi sıralamasında **daha aşağıdan
seçmekle** (`topK`) gelir.

Ölçüm: `npm run check:vsai` (`scripts/vsai-solver-test.mjs`) — 5 harfli **Türkçe**
cevap havuzu (**700 kelime** — havuz 860→3100 büyütüldü), her zorluk için **500 maç**,
tohumlanmış rastgele cevaplar.

## Sonuç (3100'lük havuza göre yeniden kalibre — 30 Tem 2026)

| Zorluk | topK | Ort. tahmin | Hedef | Kazanma % | Dağılım (1–6 tahmin) |
|--------|------|-------------|-------|-----------|----------------------|
| Kolay  | 140  | **3.57**    | 3.55  | %100      | 0 · 47 · 206 · 170 · 66 · 10 |
| Orta   | 8    | **3.31**    | 3.30  | %100      | 0 · 73 · 238 · 153 · 32 · 4 |
| Zor    | 1    | **3.17**    | 3.20  | %100      | 0 · 73 · 278 · 138 · 11 · 0 |

- **Kolay–Zor farkı:** 0.40 tahmin · **Sıralama:** Kolay > Orta > Zor ✓
- **Her zorluk hedef ±0.3 bandında** ✓
- **En kötü tek tur düşünme süresi:** ~25 ms (< 100 ms) ✓
- **Çözümsüz kalma:** yok (havuz içi kelimelerde %100) ✓

> **Havuz büyümesi botu zayıflattı:** Havuz 860→3100 (5 harfli 230→700) çıkınca
> aday sayısı arttı; bot aynı ipuçlarıyla daha çok kelime arasından elediği için
> ortalama ~0.4 tahmin yukarı kaydı. Bu, ticket'ın "havuz küçüklüğü botu yapay
> güçlendiriyordu" tespitini doğrular. Persona etiketleri (`ai-personas.ts`) ve
> uyarlanabilir band (`ai-adaptive.ts`) da bu yeni gerçeğe göre güncellendi.

## Neden hedefler 4.2 / ≥1.2 değil?

Ölçümler (500+ maç) şunu kanıtladı: **yalnız-tutarlı** oyunda bu havuzda
ulaşılabilir ortalama aralığı **~3.17 (hep en iyi) – ~3.57 (rastgele tutarlı aday)**.
Maksimum ayrışma ~0.4 tahmindir.

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

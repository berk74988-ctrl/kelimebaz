/**
 * KELİMEBAZ — Türkçe biçimbilim (morfoloji) süzgeci.
 *
 * ---------------------------------------------------------------------------
 * NEDEN VAR?
 *
 * Kök sözlükleri "GEL", "OL", "BABA" gibi kökleri içerir; ama oyuncu tahtaya
 * "GELDİ", "OLSUN", "BABAM" yazar. Bu çekimli biçimler hiçbir kök sözlüğünde
 * yoktur — dolayısıyla oyun onları haksız yere reddeder.
 *
 * Altyazı korpusu (OpenSubtitles frekans listesi) bu çekimli biçimlerin
 * hepsini içerir, AMA içi çöple doludur:
 *
 *     FROST, ANGEL, MİKEY, VOLVO   → İngilizce/özel ad
 *     ALDİM, HAKLİ, DEGİL, ADİNİ   → altyazı yazım hatası
 *
 * Bu modül, korpustan gelen bir adayı ancak GERÇEKTEN çözümlenebiliyorsa
 * kabul eder: kelime = (bilinen kök) + (geçerli ek) ve bu birleşme Türkçenin
 * ses kurallarına uyuyorsa.
 *
 *     GELDİ  → GEL + -DI   ✅ (ünlü uyumu: e → i)
 *     ALDİM  → AL + -DI+m  ❌ (uyum bozuk: a → ı olmalıydı, ALDIM)
 *     FROST  → çözümlenemez ❌
 *
 * Yani korpus ADAY üretir, biçimbilim KARAR verir. Yüksek isabet, düşük çöp.
 * ---------------------------------------------------------------------------
 */

const VOWELS = new Set('AEIİOÖUÜ');
const BACK = new Set('AIOU'); // kalın ünlüler
const ROUND = new Set('OÖUÜ'); // yuvarlak ünlüler

/** "Fıstıkçı Şahap" — sert (ötümsüz) ünsüzler. Ek başındaki d→t, c→ç yapar. */
const VOICELESS = new Set('FSTKÇŞHP');

/** Yumuşama: KİTAP+ı → KİTABI. Yüzeydeki B'yi köke (P) geri çeviririz. */
const SOFTENED = { B: 'P', C: 'Ç', D: 'T', Ğ: ['K', 'G'], G: 'K' };

/**
 * İNCE UYUM İSTİSNALARI.
 *
 * Kalın ünlüyle bitmelerine rağmen İNCE ek alan alıntı kelimeler:
 *
 *     HAL  + -de  →  HALDE   (kurala göre HALDA olmalıydı)
 *     SAAT + -e   →  SAATE   (kurala göre SAATA olmalıydı)
 *     ROL  + -ü   →  ROLÜ,   GOL + -ü → GOLÜ
 *
 * Bunlar dilin gerçek istisnaları; kuralla türetilemezler, sayılırlar.
 * Liste dar tutuldu — geniş tutmak uyum denetimini zayıflatır ve çöp sızdırır.
 */
const FRONT_HARMONY_EXCEPTIONS = new Set([
  'HAL', 'SAAT', 'ROL', 'GOL', 'KALP', 'HARF', 'USUL', 'HAYAL', 'MİSAL',
  'İHTİMAL', 'İSTİKLAL', 'ŞEFKAT', 'DİKKAT', 'HAKİKAT', 'KABUL', 'MEŞGUL',
  'ALKOL', 'PETROL', 'FUTBOL', 'KONTROL', 'SUAL', 'EMSAL', 'MEŞAL', 'İDRAK',
  'İTTİFAK', 'ZİRAAT', 'SANAT', 'İNŞAAT', 'CEVAP', 'HARAP', 'İTİBAR',
]);

/**
 * SORU EKİ BİÇİMLERİ.
 *
 * TDK'ye göre soru eki AYRI yazılır ("geliyor musun"), yani "MUSUN" başlı
 * başına bir kelimedir. Kurallı çözümlemeye girmez çünkü kökü bir ektir —
 * kapalı bir küme olduğu için doğrudan sayıyoruz. (MUSUN korpusta 382 bin kez
 * geçiyor; oyuncunun yazıp reddedilmesi kabul edilemez.)
 */
export const PARTICLES = new Set([
  'MIYIM', 'MİYİM', 'MUYUM', 'MÜYÜM',
  'MISIN', 'MİSİN', 'MUSUN', 'MÜSÜN',
  'MIYIZ', 'MİYİZ', 'MUYUZ', 'MÜYÜZ',
  'MIYDI', 'MİYDİ', 'MUYDU', 'MÜYDÜ',
]);

const chars = (s) => [...s];
const isVowel = (c) => VOWELS.has(c);

/** Kökün son ünlüsü — ek uyumunu bu belirler. */
function lastVowel(stem) {
  const cs = chars(stem);
  for (let i = cs.length - 1; i >= 0; i--) if (isVowel(cs[i])) return cs[i];
  return null;
}

/**
 * Ek şablonunu köke göre somutlaştırır.
 *
 * Şablon işaretleri (Türk alfabesinde olmayan karakterler — çakışma olmaz):
 *   2 → iki yönlü ünlü uyumu:  a / e
 *   4 → dört yönlü ünlü uyumu: ı / i / u / ü
 *   D → benzeşme: sert ünsüzden sonra t, yoksa d
 *   C → benzeşme: sert ünsüzden sonra ç, yoksa c
 *
 * Örn. şablon 'D4M' + kök 'GEL' → 'DİM'  (GELDİM)
 *      şablon 'D4M' + kök 'YAP' → 'TIM'  (YAPTIM)
 */
function realize(tpl, stem, forceFront = false) {
  const lv = lastVowel(stem);
  if (!lv) return null; // ünlüsüz kök → çekimlenemez

  const back = forceFront ? false : BACK.has(lv);
  const round = ROUND.has(lv);

  const two = back ? 'A' : 'E';
  const four = back ? (round ? 'U' : 'I') : round ? 'Ü' : 'İ';

  const last = chars(stem).at(-1);
  const hard = VOICELESS.has(last);

  let out = '';
  for (const c of tpl) {
    if (c === '2') out += two;
    else if (c === '4') out += four;
    else if (c === 'D') out += hard ? 'T' : 'D';
    else if (c === 'C') out += hard ? 'Ç' : 'C';
    else out += c;
  }
  return out;
}

/**
 * Ek listesi.
 *
 * `end` — ekin hangi sesle biten kökten sonra gelebileceği:
 *   'C' → ünsüzle biten kök   (KİTAP+ım)
 *   'V' → ünlüyle biten kök   (ARABA+m, ARABA+yı — kaynaştırma harfi şablonda)
 *   '*' → ikisi de            (KİTAP+ta, ARABA+da)
 *
 * `pos` — ekin hangi TÜRDEN köke gelebileceği:
 *   'N' → yalnızca isim/sıfat    'V' → yalnızca fiil    '*' → ikisi de
 *
 * Bu alan kritik:
 *
 *   MOR + -an  →  "MORAN"  ✗   -an sıfat-fiil ekidir, sadece FİİLE gelir.
 *   JET + -er  →  "JETER"  ✗   -er geniş zaman ekidir, sadece FİİLE gelir.
 *   GEL + -en  →  "GELEN"  ✓
 *
 * Tür etiketi olmasaydı korpustaki her özel ad rastgele bir isim köküne
 * fiil eki yapıştırarak sözlüğe sızardı.
 *
 * AMA dikkat: EK-FİİL (koşaç) ekleri isme DE gelir — YOK+tu → YOKTU,
 * ZOR+du → ZORDU, BEN+se → BENSE. Bunlar '*' işaretli. Buna karşılık geniş
 * zaman, sıfat-fiil, mastar ve olumsuzluk ekleri gerçekten fiile özgüdür.
 *
 * Liste bilerek DAR tutuldu: ek sayısı arttıkça "FROST"un kazara
 * çözümlenme riski artar. Sadece 5 harfe sığan yaygın ekler var.
 *
 * `slot` — ekin çekim sırasındaki YERİ. Türkçede ek sırası sabittir:
 *
 *       KÖK → çoğul → iyelik → hâl/koşaç
 *       EV  → -ler  → -im    → -de        (evlerimde)
 *
 * Bu sıra ihlal edilemez. Sırasız çözümleme şuna izin verirdi:
 *
 *       MOR + -a (yönelme) + -n (iyelik) → "MORAN"  ✗
 *
 * Hâl ekinden sonra iyelik gelemez; kelime hâl ekiyle biter. `order` alanı
 * bunu zorunlu kılar: ikinci ekin sırası birinciden büyük olmalı.
 *
 * Bazı ekler iki yuvaya birden uyar (-ı hem belirtme hâli hem 3. iyelik):
 * ikisini de listeleyip herhangi bir geçerli okuma varsa kabul ediyoruz.
 */
const SLOT = { deriv: 0, plural: 1, poss: 2, case: 3, copula: 3, verb: 3 };

const SUFFIXES = [
  // ---- İsim çekimi ----
  { tpl: '4', end: 'C', pos: 'N', slots: ['poss', 'case'] }, // KİTAP+ı (onun kitabı / kitabı gördüm)
  { tpl: 'Y4', end: 'V', pos: 'N', slots: ['case'] }, //        ARABA+yı
  { tpl: '2', end: 'C', pos: 'N', slots: ['case'] }, //         OKUL+a  → OKULA
  { tpl: 'Y2', end: 'V', pos: 'N', slots: ['case'] }, //        ARABA+ya
  { tpl: 'D2', end: '*', pos: 'N', slots: ['case'] }, //        YER+de  → YERDE
  { tpl: 'D2N', end: '*', pos: 'N', slots: ['case'] }, //       EV+den  → EVDEN
  { tpl: '4N', end: 'C', pos: 'N', slots: ['poss', 'case'] }, //SENİN (tamlayan) / EV+in (senin evin)
  { tpl: 'N4N', end: 'V', pos: 'N', slots: ['case'] }, //       ARABA+nın
  { tpl: 'L2', end: '*', pos: 'N', slots: ['case'] }, //        EL+le (ile)
  { tpl: 'L2R', end: '*', pos: 'N', slots: ['plural'] }, //     EV+ler
  { tpl: 'M', end: 'V', pos: 'N', slots: ['poss'] }, //         BABA+m → BABAM
  { tpl: '4M', end: 'C', pos: 'N', slots: ['poss'] }, //        ÜST+üm → ÜSTÜM
  { tpl: 'N', end: 'V', pos: 'N', slots: ['poss'] }, //         BABA+n
  { tpl: 'S4', end: 'V', pos: 'N', slots: ['poss'] }, //        MASA+sı
  { tpl: 'L4', end: '*', pos: 'N', slots: ['deriv'] }, //       TUZ+lu
  { tpl: 'S4Z', end: '*', pos: 'N', slots: ['deriv'] }, //      TUZ+suz
  { tpl: 'C4', end: '*', pos: 'N', slots: ['deriv'] }, //       YOL+cu
  { tpl: 'C2', end: '*', pos: 'N', slots: ['deriv'] }, //       TÜRK+çe
  { tpl: 'C4K', end: '*', pos: 'N', slots: ['deriv'] }, //      AZ+ıcık

  // ---- Zamir n'si — İYELİKTEN SONRA gelen hâl ekleri (ikinci katman) ----
  //      ADI + nı → ADINI,  ÖNÜ + ne → ÖNÜNE
  { tpl: 'N4', end: 'V', pos: 'N', slots: ['case'] },
  { tpl: 'N2', end: 'V', pos: 'N', slots: ['case'] },
  { tpl: 'ND2', end: 'V', pos: 'N', slots: ['case'] },
  { tpl: 'ND2N', end: 'V', pos: 'N', slots: ['case'] },

  // ---- EK-FİİL / koşaç — hem isme hem fiile gelir ----
  { tpl: 'D4', end: '*', pos: '*', slots: ['copula'] }, //  GEL+di → GELDİ · YOK+tu → YOKTU
  { tpl: 'D4M', end: '*', pos: '*', slots: ['copula'] }, // EZ+dim → EZDİM
  { tpl: 'D4N', end: '*', pos: '*', slots: ['copula'] }, // GEL+din
  { tpl: 'D4K', end: '*', pos: '*', slots: ['copula'] }, // YAP+tık
  { tpl: 'M4Ş', end: '*', pos: '*', slots: ['copula'] }, // OL+muş
  { tpl: 'S2', end: '*', pos: '*', slots: ['copula'] }, //  GEL+se · BEN+se → BENSE
  { tpl: 'S2M', end: '*', pos: '*', slots: ['copula'] }, // ET+sem → ETSEM
  { tpl: 'S2N', end: '*', pos: '*', slots: ['copula'] }, // AL+san
  { tpl: 'S4N', end: '*', pos: '*', slots: ['copula'] }, // OL+sun → OLSUN · YOK+sun
  { tpl: 'D4R', end: '*', pos: '*', slots: ['copula'] }, // VAR+dır
  { tpl: '4Z', end: 'C', pos: '*', slots: ['copula'] }, //  VAR+ız → VARIZ
  { tpl: 'Y4Z', end: 'V', pos: '*', slots: ['copula'] }, // İYİ+yiz

  // ---- Fiile ÖZGÜ çekim ----
  { tpl: '2R', end: 'C', pos: 'V', slots: ['verb'] }, //   SAT+ar → SATAR
  { tpl: '4R', end: 'C', pos: 'V', slots: ['verb'] }, //   GEL+ir
  { tpl: 'R', end: 'V', pos: 'V', slots: ['verb'] }, //    BÜYÜ+r → BÜYÜR
  { tpl: 'M2', end: '*', pos: 'V', slots: ['deriv'] }, //  GEL+me (ad-fiil → ek alabilir: GELMEM)
  { tpl: 'M2M', end: '*', pos: 'V', slots: ['verb'] }, //  ÖL+mem → ÖLMEM
  { tpl: 'M2Z', end: '*', pos: 'V', slots: ['verb'] }, //  GEL+mez
  { tpl: 'M2K', end: '*', pos: 'V', slots: ['deriv'] }, // GEL+mek (mastar → ad gibi)
  { tpl: '2N', end: 'C', pos: 'V', slots: ['verb'] }, //   GEL+en
  { tpl: 'Y2N', end: 'V', pos: 'V', slots: ['verb'] }, //  BEKLE+yen
  { tpl: '4Ş', end: 'C', pos: 'V', slots: ['deriv'] }, //  GEL+iş (iş adı → ad gibi)
];

/**
 * Yüzeydeki gövdeden olası KÖKLERİ üretir (ses olaylarını geriye sarar).
 *
 * Bu üç olay yüzünden gövde ile kök birebir aynı olmayabilir:
 *
 *   1. Ünsüz yumuşaması   KİTAP + ı → KİTABI   (gövde KİTAB, kök KİTAP)
 *   2. Ünlü düşmesi       BURUN + u → BURNU    (gövde BURN,  kök BURUN)
 *   3. Ünsüz ikizleşmesi  HAK   + ı → HAKKI    (gövde HAKK,  kök HAK)
 *
 * Yalnızca ek ünlüyle başlıyorsa çalışır — bunlar zaten ünlü-öncesi olaylardır.
 */
function candidateRoots(stem, suffixStartsWithVowel) {
  const out = new Set([stem]);
  if (!suffixStartsWithVowel) return out;

  const cs = chars(stem);
  const last = cs.at(-1);

  // 1) Yumuşamayı geri al:  ...B → ...P
  const hardened = SOFTENED[last];
  if (hardened) {
    for (const h of [hardened].flat()) out.add(cs.slice(0, -1).join('') + h);
  }

  // 2) İkizleşmeyi geri al:  HAKK → HAK
  if (cs.length >= 3 && cs.at(-1) === cs.at(-2)) {
    out.add(cs.slice(0, -1).join(''));
  }

  // 3) Ünlü düşmesini geri al:  BURN → BURUN  (son iki ünsüz arasına ünlü koy)
  if (cs.length >= 3 && !isVowel(cs.at(-1)) && !isVowel(cs.at(-2))) {
    const lv = lastVowel(cs.slice(0, -1).join(''));
    if (lv) {
      const back = BACK.has(lv);
      const round = ROUND.has(lv);
      const four = back ? (round ? 'U' : 'I') : round ? 'Ü' : 'İ';
      // Hem uyumlu ünlüyü hem düz karşılığını dene (AĞIZ → AĞZ, GÖNÜL → GÖNL)
      for (const v of new Set([four, back ? 'A' : 'E'])) {
        out.add(cs.slice(0, -1).join('') + v + cs.at(-1));
      }
    }
  }

  return out;
}

/** Gövdenin, verilen kök türüyle eşleşen bir kök olup olmadığına bakar. */
function rootKinds(stem, roots, sufStartsVowel) {
  const found = [];
  for (const root of candidateRoots(stem, sufStartsVowel)) {
    const isNoun = roots.nouns.has(root);
    const isVerb = roots.verbs.has(root);
    if (isNoun || isVerb) found.push({ root, isNoun, isVerb });
  }
  return found;
}

/**
 * Bir gövdeyi tek ek soyarak çözümler. TÜM geçerli okumaları döndürür —
 * ikinci katman, birinci katmanın hangi yuvayı doldurduğunu bilmek zorunda
 * (KİTABI: iyelik mi belirtme mi? İkinci ek ancak iyelik okumasıyla gelebilir).
 *
 * @returns {Array<{root: string, suffix: string, pos: string, slots: string[]}>}
 */
function peel(word, roots) {
  const cs = chars(word);
  const out = [];

  // Gövde en az 2 harf olsun — "F+ROST" gibi saçmalıkları baştan keser
  for (let k = cs.length - 1; k >= 2; k--) {
    const stem = cs.slice(0, k).join('');
    const surface = cs.slice(k).join('');
    const stemEndsVowel = isVowel(chars(stem).at(-1));
    const sufStartsVowel = isVowel(chars(surface)[0]);

    for (const { root, isNoun, isVerb } of rootKinds(stem, roots, sufStartsVowel)) {
      // Alıntı kelimelerde ince uyum istisnası (HAL → HALDE)
      const front = FRONT_HARMONY_EXCEPTIONS.has(root);

      for (const { tpl, end, pos, slots } of SUFFIXES) {
        if (end === 'C' && stemEndsVowel) continue;
        if (end === 'V' && !stemEndsVowel) continue;

        // Tür uyuşmalı: fiile özgü ek isim köküne gelemez (MOR + -an ✗)
        if (pos === 'N' && !isNoun) continue;
        if (pos === 'V' && !isVerb) continue;

        // Ek, KÖKE değil YÜZEYDEKİ GÖVDEYE göre uyum sağlar:
        // KİTAP → KİTAB + ı  (sertlik gövdenin son harfine bakar), bu yüzden
        // realize()'a root değil stem veriyoruz.
        const match =
          realize(tpl, stem) === surface || (front && realize(tpl, stem, true) === surface);

        if (match) out.push({ root, suffix: surface, pos, slots });
      }
    }
  }

  return out;
}

/**
 * Kelime, bilinen bir kökten geçerli eklerle türetilebiliyor mu?
 *
 * İKİ KATMAN soyar. Türkçede ekler zincirlenir ve çok yaygın 5 harfli
 * biçimler iki ek taşır:
 *
 *     ADINI  = AD  + ı  + nı     (iyelik + belirtme)
 *     ÖNÜNE  = ÖN  + ü  + ne     (iyelik + yönelme)
 *     EVİME  = EV  + im + e      (iyelik + yönelme)
 *     ODAMA  = ODA + m  + a
 *
 * Tek katman bunları reddederdi. İkinci katmanda gövde artık bir isim gibi
 * davranır (iyelik almış ad), o yüzden ikinci ek isim eki olarak aranır.
 *
 * @param {string} word  BÜYÜK HARFLİ kelime
 * @param {{nouns: Set<string>, verbs: Set<string>}} roots
 * @returns {{root: string, suffix: string, pos: string} | null}
 */
export function analyze(word, roots) {
  // 0) Soru eki biçimleri — kapalı küme, kuralla türetilmez
  if (PARTICLES.has(word)) return { root: word, suffix: '', pos: 'P' };

  // 1) Kelimenin kendisi kök mü? (KİTAP = isim, GEL = emir kipi — ikisi de kelime)
  if (roots.nouns.has(word)) return { root: word, suffix: '', pos: 'N' };
  if (roots.verbs.has(word)) return { root: word, suffix: '', pos: 'V' };

  // 2) Tek ek
  const one = peel(word, roots);
  if (one.length) {
    const { root, suffix, pos } = one[0];
    return { root, suffix, pos };
  }

  // 3) İki ek: içteki eki soyup kalan gövdeyi tekrar çözümle.
  //    Ara gövde en az 3 harf olmalı — aksi hâlde her şey iki parçaya bölünür
  //    ve süzgeç anlamını yitirir.
  const cs = chars(word);
  for (let k = cs.length - 1; k >= 3; k--) {
    const inner = cs.slice(0, k).join('');
    const surface = cs.slice(k).join('');

    const bases = peel(inner, roots);
    if (!bases.length) continue;

    const innerEndsVowel = isVowel(chars(inner).at(-1));

    for (const base of bases) {
      const innerOrder = Math.min(...base.slots.map((s) => SLOT[s]));

      for (const { tpl, end, pos, slots } of SUFFIXES) {
        if (pos === 'V') continue; // gövde artık çekimlenmiş bir ad; fiil eki almaz
        if (end === 'C' && innerEndsVowel) continue;
        if (end === 'V' && !innerEndsVowel) continue;

        // EK SIRASI: ikinci ek, birincinin yuvasından SONRA gelmeli.
        // MOR + -a(hâl) + -n(iyelik) → hâlden sonra iyelik olmaz, elenir.
        const outerOrder = Math.max(...slots.map((s) => SLOT[s]));
        if (outerOrder <= innerOrder) continue;

        if (realize(tpl, inner) === surface) {
          return { root: base.root, suffix: `${base.suffix}+${surface}`, pos: 'N' };
        }
      }
    }
  }

  return null;
}

/*
 * NOT — İLERİ YÖNDE ÜRETİM DENENDİ VE REDDEDİLDİ.
 *
 * Kuralları ters çevirip her kökten her eki türetmek cazip görünüyordu: korpusta
 * geçmeyen geçerli biçimleri de yakalardı. Ölçtüm, olmuyor:
 *
 *   - Kök listelerinde AB, ÖF, PO, OO, RNA, AFP gibi gerçek kelime olmayan
 *     parçalar var; üreteç onlardan ABIYI, ÖFSÜZ, POMDA, RNANI üretiyor.
 *     (ŞİMDİ'nin yazım hatası SİMDİ bile "Sİ+M+Dİ" diye üretiliyordu.)
 *   - Kökü korpus frekansıyla kanıtlamak da yetmedi: eşik 200'de bile sızıyor.
 *   - Ek-fiil (-di / -se / -iz) HER isme gelebildiği için JELDİ, ÇÖLÜZ, YÖNDÜ
 *     gibi dilbilgisel ama kimsenin kullanmadığı biçimler patlıyor.
 *
 * İsabet %60-70'te tavan yaptı — "uydurma kelime kabul etme" şartını
 * karşılamıyor. Bu yüzden sözlük yalnızca İNSAN ELİYLE YAZILMIŞ kaynaklardan
 * ve KORPUSTA KANITLANMIŞ biçimlerden kuruluyor; kelime uydurulmuyor.
 */

/**
 * Kök havuzunu sözcük türüne göre ayırarak kurar.
 *
 * Türkçe sözlükler fiilleri MASTAR hâlinde tutar (GELMEK, ALMAK) — çünkü
 * sözlük maddesi budur. Ama çekim çıplak köke yapılır (GEL+di, AL+dı).
 * Mastarı soyarak fiil kökünü çıkarıyoruz; geri kalan her şey isim/sıfat.
 *
 * Bu ayrım süzgecin belkemiği: fiile özgü ekler (‑an, ‑er, ‑mek) yalnızca
 * bu kümedeki köklere gelebilir. Olmasaydı "MOR+an", "JET+er" geçerdi.
 *
 * @param {string[]} words  tüm sözlük girdileri (her uzunlukta)
 */
export function buildRoots(words) {
  const nouns = new Set();
  const verbs = new Set();

  for (const w of words) {
    if (w.endsWith('MEK') || w.endsWith('MAK')) {
      const stem = chars(w).slice(0, -3).join('');
      if (chars(stem).length >= 2) verbs.add(stem);
    }
    nouns.add(w);
  }

  return { nouns, verbs };
}

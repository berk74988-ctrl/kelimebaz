/**
 * TEST TOHUMU (yan etkili modül) — birim testlerde çağrılır.
 *
 * WordService ve HintService veriyi TEMBEL (dinamik import) yükler. Bu modülü bir
 * spec import ettiğinde, o dosyanın modül grafiğinde servis havuzlarını/haritalarını
 * SENKRON tohumlar → testler async beklemeden çalışır. Üretim bundle'ına GİRMEZ
 * (yalnızca *.spec.ts tarafından import edilir).
 *
 * Kullanım: spec dosyasının başına `import '../test-seed';` (yola göre) ekle.
 */
import hintsTr from './data/hints-tr.json';
import hintsTrNative from './data/hints-tr-native.json';
import validWordsEn from './data/valid-words-en.json';
import validWords from './data/valid-words.json';
import wordsEn from './data/words-en.json';
import words from './data/words.json';
import { Hint, HintService } from './services/hint.service';
import { WordService } from './services/word.service';

WordService.seedForTest({
  tr: { answers: words.words as string[], validText: validWords.words as string },
  en: { answers: wordsEn.words as string[], validText: validWordsEn.words as string },
});

HintService.seedForTest({
  tr: hintsTrNative as unknown as Record<string, Hint>,
  en: hintsTr as unknown as Record<string, Hint>,
});

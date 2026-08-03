/**
 * MÜZİK OPTİMİZE EDİCİ — kaynak parçayı arka plan müziği için küçük, döngüye
 * uygun dosyalara yeniden kodlar (ffmpeg-static ile; sistem ffmpeg gerekmez).
 *
 * KAYNAK: audio-src/music-source.mp3 (4.2 MB). GİT'TE TAKİP EDİLMEZ (.gitignore) —
 * yayına gitmez ve her klonlayana yük olmasın. Çalışma ağacında audio-src/ altında
 * durur; bu depo OneDrive'da (C:\Users\berk8\OneDrive\Belgeler\GitHub\kelimebaz)
 * olduğundan kaynak OneDrive ile buluta yedeklidir. Taze bir klonda dosya OLMAZ →
 * bu betiği çalıştırmadan önce kaynağı OneDrive'dan audio-src/ altına koy.
 * Çıktı (public/, yayına gider):
 *   music.ogg  → Opus 96k (birincil; Chrome/Firefox/Edge/Android)
 *   music.mp3  → MP3 96k  (yedek; Safari/iOS — Opus oynatamayan her yer)
 *
 * DÖNGÜ İÇİN: kaynağın sonundaki ~4 sn outro fade + ~1 sn sessizlik kırpılır
 * (fade tek seferlik bitişler içindir, döngüde dip/boşluk yaratır). Kesim
 * noktasında tık sesini önlemek için çok kısa (in 60ms / out 100ms) fade.
 *
 * Yeniden çalıştır: npm run build:music
 */
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const SRC = fileURLToPath(new URL('audio-src/music-source.mp3', root));
const OUT_OGG = fileURLToPath(new URL('public/music.ogg', root));
const OUT_MP3 = fileURLToPath(new URL('public/music.mp3', root));

// Kaynak git'te takip edilmez → taze klonda yoktur. Ham ENOENT yerine ANLAŞILIR hata:
if (!existsSync(SRC)) {
  console.error(
    'HATA: Kaynak müzik dosyası bulunamadı:\n' +
      `  ${SRC}\n\n` +
      'Bu dosya depoya DAHİL DEĞİLDİR (4.2 MB, yayına gitmez → .gitignore). Yalnızca\n' +
      'müziği yeniden kodlamak için gerekir; sıkıştırılmış çıktılar (public/music.mp3\n' +
      've public/music.ogg) zaten depoda ve yayında.\n\n' +
      'ÇÖZÜM: Kaynağı OneDrive yedeğinden (repo OneDrive altında senkronludur) audio-src/\n' +
      'klasörüne "music-source.mp3" adıyla koy, sonra tekrar çalıştır: npm run build:music',
  );
  process.exit(1);
}

const TRIM = '128'; // saniye — outro fade + sondaki sessizlik atılır (döngü için)
const FADE = 'afade=t=in:st=0:d=0.06,afade=t=out:st=127.9:d=0.1'; // seam tık koruması
const LIMIT = 1.5 * 1048576; // kabul ölçütü: < 1.5 MB
const MB = (b) => (b / 1048576).toFixed(2);
const name = (p) => p.split(/[\\/]/).pop();

function encode(out, codecArgs, label) {
  execFileSync(ffmpegPath, ['-y', '-t', TRIM, '-i', SRC, '-af', FADE, ...codecArgs, out], {
    stdio: 'ignore',
  });
  console.log(`✓ ${label}: ${MB(statSync(out).size)} MB → ${name(out)}`);
}

const before = statSync(SRC).size;
console.log(`kaynak (${name(SRC)}): ${MB(before)} MB · yayına gitmez\n`);

encode(OUT_OGG, ['-c:a', 'libopus', '-b:a', '96k', '-vn'], 'Opus 96k (birincil)');
encode(OUT_MP3, ['-c:a', 'libmp3lame', '-b:a', '96k', '-vn'], 'MP3 96k (yedek)');

const ogg = statSync(OUT_OGG).size;
const mp3 = statSync(OUT_MP3).size;
console.log(`\nÖNCESİ:  ${MB(before)} MB`);
console.log(
  `SONRASI: opus ${MB(ogg)} MB (%${(100 * (1 - ogg / before)).toFixed(0)} küçük) · mp3 ${MB(mp3)} MB (%${(100 * (1 - mp3 / before)).toFixed(0)} küçük)`,
);

if (ogg > LIMIT || mp3 > LIMIT) {
  console.error(`\n❌ 1.5 MB sınırı aşıldı — bit hızını düşür.`);
  process.exit(1);
}
console.log('✅ ikisi de 1.5 MB sınırının altında');

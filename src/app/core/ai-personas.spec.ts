import { AiSolver, aiOpeners } from './ai-opponent';
import { PERSONAS, persona } from './ai-personas';
import enI18n from '../../i18n/en.json';
import trI18n from '../../i18n/tr.json';
import wordsTr from '../data/words.json';

const TR = trI18n as Record<string, string>;
const EN = enI18n as Record<string, string>;

/**
 * Bot karakterleri — kayıt defteri sözleşmesi + gerçekten farklı oynamaları.
 */
describe('Bot karakterleri (personas)', () => {
  const pool = (wordsTr.words as string[])
    .map((w) => w.toLocaleUpperCase('tr'))
    .filter((w) => [...w].length === 5);
  const openers = aiOpeners('tr', 5);

  function seeded(s = 12345) {
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  it('en az 4 karakter var; her birinin adı/açıklaması/avatarı/ölçülen ortalaması var', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(4);
    for (const p of PERSONAS) {
      expect(p.avatar.length).toBeGreaterThan(0);
      expect(p.nameKey).toMatch(/^persona\./);
      expect(p.descKey).toMatch(/^persona\./);
      expect(p.avgGuesses).toBeGreaterThan(0);
      expect(['easy', 'medium', 'hard']).toContain(p.tier);
    }
  });

  it('kimlikler BENZERSİZ', () => {
    const ids = PERSONAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('persona(id) doğru karakteri, bilinmeyen id ilk karakteri döndürür', () => {
    expect(persona('kumarbaz').id).toBe('kumarbaz');
    expect(persona('yok' as never)).toBe(PERSONAS[0]);
  });

  it('karakterler GERÇEKTEN farklı oynuyor — aynı havuzda farklı açılış yapıyorlar', () => {
    const firstOpeners = new Set<string>();
    for (const p of PERSONAS) {
      const s = new AiSolver('KALEM', pool, p.config, 6, seeded(), openers);
      s.step(); // ilk tur = açılış
      firstOpeners.add(s.guesses[0].word);
    }
    // En az iki farklı açılış → strateji farkı gerçek (aynı botun kopyası değiller).
    expect(firstOpeners.size).toBeGreaterThanOrEqual(2);
  });

  it('her karakter havuz-içi kelimeyi 6 hakta çözebiliyor', () => {
    for (const p of PERSONAS) {
      const s = new AiSolver('KALEM', pool, p.config, 6, seeded(7), openers);
      while (!s.done) s.step();
      expect(s.solved).toBe(true);
    }
  });

  it('her karakterin laf atma metinleri TR ve EN olarak tanımlı (ilk yeşil · son tur · yakın maç)', () => {
    for (const p of PERSONAS) {
      for (const trigger of ['firstGreen', 'lastTurn', 'close']) {
        const key = `persona.${p.id}.${trigger}`;
        expect(TR[key], key + '.tr').toBeTruthy();
        expect(EN[key], key + '.en').toBeTruthy();
      }
      // isim + açıklama da iki dilde
      for (const k of [p.nameKey, p.descKey]) {
        expect(TR[k]?.length).toBeGreaterThan(0);
        expect(EN[k]?.length).toBeGreaterThan(0);
      }
    }
  });
});

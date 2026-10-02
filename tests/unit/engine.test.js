import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tokenizeLine,
  codeKey,
  parseLine,
  parseProgram,
  createCodeDictionary,
  tokenCategory,
  occurrenceKey,
  tokenAt,
} from '../../src/engine/index.js';
import { ISO_BASE_CODES } from '../../src/data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from '../../src/data/codes/fanuc-turning.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { FANUC_TURNING_DEMO } from '../../src/data/samples/fanuc-turning-demo.js';

const types = (line) => tokenizeLine(line).map((t) => `${t.type}:${t.text}`);

test('codeKey normalise les zéros et décimales', () => {
  assert.equal(codeKey('G', '01'), 'G1');
  assert.equal(codeKey('g', '00'), 'G0');
  assert.equal(codeKey('M', '030'), 'M30');
  assert.equal(codeKey('G', '12.10'), 'G12.1');
});

test('bloc de tournage classique', () => {
  assert.deepEqual(types('N10 G01 X25. Z-30.5 F0.15 (FINITION)'), [
    'word:N10',
    'word:G01',
    'word:X25.',
    'word:Z-30.5',
    'word:F0.15',
    'comment:(FINITION)',
  ]);
  const [, g, x, z] = tokenizeLine('N10 G01 X25. Z-30.5');
  assert.equal(g.code, 'G1');
  assert.equal(x.value, 25);
  assert.equal(x.hasDecimal, true);
  assert.equal(z.value, -30.5);
});

test('mots collés, sans espaces, minuscules', () => {
  assert.deepEqual(types('G0X52.Z2.M8'), ['word:G0', 'word:X52.', 'word:Z2.', 'word:M8']);
  const [g] = tokenizeLine('g1 x10');
  assert.equal(g.letter, 'G');
  assert.equal(g.code, 'G1');
});

test('espace entre lettre et valeur toléré, valeur manquante détectée', () => {
  assert.deepEqual(types('X 25.'), ['word:X 25.']);
  const [x, z] = tokenizeLine('X Z5');
  assert.equal(x.valueKind, 'missing');
  assert.equal(z.value, 5);
});

test('%, ;, saut de bloc, numéro de programme', () => {
  assert.deepEqual(types('%'), ['percent:%']);
  assert.deepEqual(types('/N20 M1;'), ['blockDelete:/', 'word:N20', 'word:M1', 'eob:;']);
  assert.equal(tokenizeLine('/2 G0 X0')[0].level, 2);
  assert.deepEqual(types(':1000'), ['word::1000']);
  assert.equal(tokenizeLine(':1000')[0].letter, 'O');
  assert.equal(tokenizeLine('X5 / 2')[1].type, 'operator', 'pas un saut de bloc hors début de ligne');
});

test('commentaires : fermé, non fermé, parenthèse orpheline', () => {
  assert.equal(tokenizeLine('G0 (ouvert')[1].unclosed, true);
  assert.equal(tokenizeLine('G0 )')[1].type, 'unknown');
});

test('macros : affectation, expression, mots-clés, fonctions', () => {
  assert.deepEqual(types('#901 = 25. (COTE)'), ['variable:#901', 'operator:=', 'number:25.', 'comment:(COTE)']);
  assert.deepEqual(types('IF [#1 GT 10] GOTO 100'), [
    'keyword:IF',
    'operator:[',
    'variable:#1',
    'keyword:GT',
    'number:10',
    'operator:]',
    'keyword:GOTO',
    'number:100',
  ]);
  assert.deepEqual(types('WHILE[#2LE5]DO1'), ['keyword:WHILE', 'operator:[', 'variable:#2', 'keyword:LE', 'number:5', 'operator:]', 'keyword:DO', 'number:1']);
  assert.deepEqual(types('#3=SQRT[#1*#1]'), ['variable:#3', 'operator:=', 'function:SQRT', 'operator:[', 'variable:#1', 'operator:*', 'variable:#1', 'operator:]']);
  assert.equal(tokenizeLine('#[#1+1]=0')[0].indirect, true);
});

test('D0 (correcteur) et DO (mot-clé) ne se confondent pas', () => {
  assert.deepEqual(types('D01'), ['word:D01']);
  assert.deepEqual(types('DO1'), ['keyword:DO', 'number:1']);
  assert.deepEqual(types('END1'), ['keyword:END', 'number:1']);
});

test('mot à valeur expression : X#901, Z-[#1+2.]', () => {
  const tokens = tokenizeLine('G1 X#901 Z-[#1+2.]');
  assert.deepEqual(tokens.map((t) => `${t.type}:${t.text}`), [
    'word:G1',
    'word:X',
    'variable:#901',
    'word:Z-',
    'operator:[',
    'variable:#1',
    'operator:+',
    'number:2.',
    'operator:]',
  ]);
  assert.equal(tokens[1].valueKind, 'expr');
  assert.equal(tokens[3].exprTo, 'G1 X#901 Z-[#1+2.]'.length);
});

test('chanfrein / congé automatique ,C ,R', () => {
  const tokens = tokenizeLine('G1 X30. ,C1. Z-20. ,R2.');
  assert.deepEqual(tokens.map((t) => t.text), ['G1', 'X30.', ',C1.', 'Z-20.', ',R2.']);
  assert.equal(tokens[2].letter, ',C');
});

test('caractère inconnu signalé', () => {
  assert.equal(tokenizeLine('G1 @')[1].type, 'unknown');
});

test('parseLine : bloc structuré et cache', () => {
  const { block } = parseLine('N130 G1 X#901 Z-25. (EPAULEMENT)');
  assert.equal(block.blockNumber, 130);
  assert.deepEqual(block.codes.map((w) => w.code), ['G1']);
  assert.equal(block.words.find((w) => w.letter === 'X').expr, '#901');
  assert.deepEqual(block.variables.map((v) => [v.name, v.assigned]), [['#901', false]]);
  assert.deepEqual(block.comments, ['EPAULEMENT']);
  assert.equal(parseLine('N130 G1 X#901 Z-25. (EPAULEMENT)'), parseLine('N130 G1 X#901 Z-25. (EPAULEMENT)'));

  assert.equal(parseLine('N5 #901=25.').block.variables[0].assigned, true);
  assert.equal(parseLine('(seul)').block.isEmpty, true);
  assert.equal(parseLine('O1000').block.programNumber, 1000);
  assert.equal(parseLine('%').block.percent, true);
});

test('parseProgram : positions des lignes, CRLF', () => {
  const { lines } = parseProgram('%\r\nO1\nG0 X0\n');
  assert.equal(lines.length, 4);
  assert.equal(lines[1].text, 'O1');
  assert.equal(lines[2].from, 6); // '%\r\n' (3) + 'O1\n' (3)
});

test('le programme d’exemple s’analyse sans jeton invalide ni code inconnu', () => {
  const dictionary = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
  for (const line of parseProgram(FANUC_TURNING_DEMO.content).lines) {
    for (const token of line.tokens) {
      const category = tokenCategory(token, dictionary);
      assert.notEqual(category, 'invalid', `ligne ${line.number} : ${token.text}`);
      assert.notEqual(category, 'unknown', `ligne ${line.number} : ${token.text}`);
    }
  }
});

test('dictionnaire : superposition, redéfinition, retrait', () => {
  const dictionary = createCodeDictionary([ISO_BASE_CODES]);
  assert.equal(dictionary.lookup('G90').category, 'mode');
  let changed = 0;
  dictionary.onChange(() => changed++);
  dictionary.setLayers([ISO_BASE_CODES, FANUC_TURNING_CODES]);
  assert.equal(changed, 1);
  assert.equal(dictionary.lookup('G90').category, 'cycle');
  assert.equal(dictionary.lookup('G90').source, 'fanuc-turning');
  assert.equal(dictionary.lookup('G43'), undefined);
  assert.equal(dictionary.lookup('G1').source, 'iso-base');
});

test('catégories : codes G0-G3 identiques, toutes les catégories des données existent', () => {
  const dictionary = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);
  const cat = (text) => tokenCategory(tokenizeLine(text)[0], dictionary);
  assert.deepEqual(['G0', 'G01', 'G2', 'G03'].map(cat), ['motion', 'motion', 'motion', 'motion']);
  assert.equal(cat('G71'), 'cycle');
  assert.equal(cat('M8'), 'mcode');
  assert.equal(cat('M98'), 'program');
  assert.equal(cat('T0101'), 'tool');
  assert.equal(cat('G42'), 'tool');
  assert.equal(cat('N10'), 'blockNumber');
  assert.equal(cat('X5.'), 'address');
  assert.equal(cat('G123'), 'unknown');
  assert.equal(cat('#5'), 'macro');
  assert.equal(cat('IF'), 'macroKeyword');

  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const layer of [ISO_BASE_CODES, FANUC_TURNING_CODES]) {
    for (const [key, def] of Object.entries(layer.codes)) {
      if (def) assert.ok(ids.has(def.category), `${key} : catégorie ${def.category}`);
    }
  }
});

test('occurrences : variables, codes, valeurs (point décimal significatif)', () => {
  const key = (text) => occurrenceKey(tokenizeLine(text)[0]);
  assert.equal(key('#901'), 'var:901');
  assert.equal(key('G01'), key('G1'));
  assert.equal(key('X25.'), key('X25.0'));
  assert.notEqual(key('X25.'), key('X25'));
  assert.notEqual(key('X25.'), key('Z25.'));
  assert.equal(key('(commentaire)'), null);
  assert.equal(key('X'), null);
});

test('tokenAt : jeton sous le curseur ou juste avant', () => {
  const tokens = tokenizeLine('G1 X25.');
  assert.equal(tokenAt(tokens, 0).text, 'G1');
  assert.equal(tokenAt(tokens, 2).text, 'G1');
  assert.equal(tokenAt(tokens, 3).text, 'X25.');
  assert.equal(tokenAt(tokens, 7).text, 'X25.');
  assert.equal(tokenAt([], 0), null);
});

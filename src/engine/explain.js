import { MACRO_KEYWORDS, MACRO_FUNCTIONS } from '../data/macro-language.js';

/**
 * Explication d'un jeton, dans le contexte de son bloc. Fonction pure (sans DOM) : l'interface
 * se contente d'afficher l'objet renvoyé.
 *
 *   {
 *     kind: 'code' | 'unknownCode' | 'address' | 'variable' | 'keyword' | 'function' | 'syntax',
 *     title: 'G71', subtitle: 'Cycle d’ébauche…', category: 'cycle',
 *     source: 'FANUC tournage', redefined: [{ sourceLabel, name }],
 *     description, syntax, notes: [], example,
 *     params: [{ letter, text, value }],    paramètres du code (value : valeur dans ce bloc)
 *     details: [ 'texte' ],                 informations calculées pour ce bloc
 *   }
 */

const COORDINATE_LETTERS = new Set(['X', 'Y', 'Z', 'U', 'V', 'W', 'I', 'J', 'K', 'R', ',C', ',R']);

/** Lettres présentes dans le bloc. */
const blockLetters = (block) => new Set(block.words.map((word) => word.letter));

/** Paramètres applicables d'une définition pour ce bloc (variante `forms` sélectionnée). */
export function paramsFor(definition, block) {
  if (definition.forms) {
    const letters = blockLetters(block);
    const form = definition.forms.find((f) => (f.when ?? []).every((letter) => letters.has(letter))) ?? definition.forms.at(-1);
    return { params: form.params ?? {}, form };
  }
  return { params: definition.params ?? {}, form: null };
}

const pad = (number, width) => String(number).padStart(width, '0');

/** Décodages propres à certaines valeurs (T0101, M98 P…, G76 P…). */
function decodeValue(word, block, contextCode) {
  const details = [];
  const { letter, value, valueText, hasDecimal } = word;
  if (value == null) return details;

  if (letter === 'T' && /^\d{3,4}$/.test(valueText)) {
    const tool = Math.floor(value / 100);
    const offset = value % 100;
    details.push(`Outil ${pad(tool, 2)} · correcteur ${pad(offset, 2)}`);
    if (offset === 0) details.push('Correcteur 00 : la correction d’outil est annulée.');
  }

  if (contextCode === 'M98' && letter === 'P' && Number.isInteger(value)) {
    const repeat = value >= 10000 ? Math.floor(value / 10000) : 1;
    const program = value >= 10000 ? value % 10000 : value;
    details.push(`Appelle le programme O${pad(program, 4)}${repeat > 1 ? `, ${repeat} fois` : ''}.`);
  }

  if (contextCode === 'G76' && letter === 'P' && !blockLetters(block).has('X') && /^\d{6}$/.test(valueText)) {
    const passes = Number(valueText.slice(0, 2));
    const chamfer = Number(valueText.slice(2, 4));
    const angle = Number(valueText.slice(4, 6));
    details.push(`${passes} passe${passes > 1 ? 's' : ''} de finition`);
    details.push(`Chanfrein de sortie : ${(chamfer / 10).toLocaleString('fr-FR')} × le pas`);
    details.push(`Angle de l’outil : ${angle}°`);
  }

  if (COORDINATE_LETTERS.has(letter) && !hasDecimal && value !== 0) {
    details.push(
      `Sans point décimal : sur une commande FANUC sans saisie « calculatrice », ${letter}${valueText} vaut ${(value / 1000).toLocaleString('fr-FR')} mm. Écrire ${letter}${valueText}. pour ${value.toLocaleString('fr-FR')} mm.`,
    );
  }
  return details;
}

function explainCode(token, block, dictionary) {
  const definition = dictionary.lookup(token.code);
  if (!definition) {
    return {
      kind: 'unknownCode',
      title: token.code,
      subtitle: 'Code inconnu du profil actif',
      category: 'unknown',
      description:
        'Ce code n’est défini ni dans l’ISO générique ni dans le profil machine actif. S’il est propre à votre machine, il pourra être ajouté à un profil machine (code propriétaire).',
      details: [],
      params: [],
    };
  }
  const { params } = paramsFor(definition, block);
  const values = new Map(block.words.map((word) => [word.letter, word]));
  return {
    kind: 'code',
    title: token.code,
    subtitle: definition.name,
    category: definition.category,
    source: definition.sourceLabel,
    redefined: definition.previous ?? [],
    modal: definition.modal,
    description: definition.description,
    syntax: definition.syntax,
    notes: definition.notes ?? [],
    example: definition.example,
    params: Object.entries(params).map(([letter, text]) => {
      const word = values.get(letter);
      return { letter, text, value: word ? `${letter}${word.valueText ?? word.expr ?? ''}` : null };
    }),
    details: [],
  };
}

/** Code du bloc dont les paramètres expliquent la lettre (G71 pour le U de « G71 U2. R0.5 »). */
function contextFor(letter, block, dictionary) {
  for (const word of block.codes) {
    const definition = dictionary.lookup(word.code);
    if (!definition) continue;
    const { params } = paramsFor(definition, block);
    if (params[letter]) return { code: word.code, definition, text: params[letter] };
  }
  return null;
}

function explainAddress(token, block, dictionary) {
  const word = block.words.find((w) => w.token.from === token.from) ?? {
    letter: token.letter,
    value: token.value,
    valueText: token.valueText,
    hasDecimal: token.hasDecimal,
  };
  const context = contextFor(token.letter, block, dictionary);
  const general = dictionary.address(token.letter);
  const valueLabel = token.valueKind === 'number' ? token.valueText : token.valueKind === 'expr' ? (word.expr ?? '') : '';
  const details = [];
  if (context) details.push(`Paramètre de ${context.code} (${context.definition.name}).`);
  if (token.valueKind === 'expr') details.push(`Valeur calculée : ${word.expr}`);
  if (token.valueKind === 'missing') details.push('Valeur manquante après la lettre.');
  details.push(...decodeValue(word, block, context?.code ?? block.codes[0]?.code));

  return {
    kind: 'address',
    title: `${token.letter}${valueLabel}`,
    subtitle: context?.text ?? general?.text ?? `Adresse ${token.letter}`,
    category: token.letter === 'N' ? 'blockNumber' : token.letter === 'O' ? 'program' : ['T', 'D', 'H'].includes(token.letter) ? 'tool' : 'address',
    source: context ? context.definition.sourceLabel : general?.sourceLabel,
    description: context && general ? `En général : ${general.text}.` : null,
    details,
    params: [],
    notes: [],
  };
}

function explainVariable(token, dictionary, findAssignments, variableInfo) {
  if (token.indirect) {
    return {
      kind: 'variable',
      title: '#[…]',
      subtitle: 'Variable indirecte',
      category: 'macro',
      description: 'Le numéro de la variable est calculé par l’expression entre crochets : #[#1+100] désigne #101 si #1 vaut 1.',
      details: [],
      params: [],
      notes: [],
    };
  }
  const range = dictionary.variableRange(token.index);
  const info = variableInfo?.(token.index) ?? {};
  const assignments = findAssignments?.(token.index) ?? [];
  const details = assignments.length
    ? assignments.slice(0, 5).map((a) => `Affectée ligne ${a.line} : ${a.text.trim()}`)
    : ['Aucune affectation dans ce programme : valeur fournie par la machine, un autre programme ou un argument.'];
  if (assignments.length > 5) details.push(`… et ${assignments.length - 5} autre(s) affectation(s).`);
  if (range && info.name) details.push(`${range.name} : ${range.description}`);
  return {
    kind: 'variable',
    title: token.name,
    subtitle: info.name || range?.name || 'Variable de macro',
    category: 'macro',
    description: info.description || (info.name ? null : (range?.description ?? null)),
    details,
    warnings: info.warnings ?? [],
    params: [],
    notes: [],
  };
}

const SYNTAX = {
  percent: ['%', 'Caractère de début / fin de programme', 'Marque le début et la fin du programme lors des transferts (bande, DNC, carte mémoire).'],
  eob: [';', 'Fin de bloc', 'Notation FANUC de la fin de bloc (EOB). Inutile dans un fichier texte : chaque ligne est un bloc.'],
  blockDelete: ['/', 'Saut de bloc optionnel', 'Ce bloc est ignoré quand l’interrupteur « saut de bloc » du pupitre est activé (/2 à /9 : niveaux supplémentaires selon la commande).'],
  unknown: ['?', 'Caractère non reconnu', 'Ce caractère n’appartient pas au langage ISO et sera refusé par la commande.'],
};

/**
 * @param token   jeton du moteur (tokenizeLine)
 * @param context { block, dictionary, findAssignments(index) → [{ line, text }],
 *                  variableInfo(index) → { name, description, warnings: [texte] } }
 * @returns explication, ou null pour un jeton sans explication (commentaire, nombre, opérateur)
 */
export function explainToken(token, { block, dictionary, findAssignments, variableInfo }) {
  if (!token) return null;
  switch (token.type) {
    case 'word':
      return token.code ? explainCode(token, block, dictionary) : explainAddress(token, block, dictionary);
    case 'variable':
      return explainVariable(token, dictionary, findAssignments, variableInfo);
    case 'keyword': {
      const entry = MACRO_KEYWORDS[token.keyword];
      return entry && { kind: 'keyword', title: token.keyword, subtitle: entry.name, category: 'macroKeyword', description: entry.description, syntax: entry.syntax, details: [], params: [], notes: [] };
    }
    case 'function': {
      const text = MACRO_FUNCTIONS[token.keyword];
      return text && { kind: 'function', title: token.keyword, subtitle: 'Fonction de macro', category: 'macroKeyword', description: text, details: [], params: [], notes: [] };
    }
    case 'percent':
    case 'eob':
    case 'blockDelete':
    case 'unknown': {
      const [title, subtitle, description] = SYNTAX[token.type];
      return { kind: 'syntax', title: token.type === 'unknown' ? token.text : title, subtitle, category: token.type === 'unknown' ? 'invalid' : 'program', description, details: [], params: [], notes: [] };
    }
    default:
      return null;
  }
}

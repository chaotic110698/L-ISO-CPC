// API publique du moteur d'analyse ISO (aucune dépendance au DOM ni à CodeMirror).
export { tokenizeLine, codeKey, KEYWORDS, FUNCTIONS } from './tokenizer.js';
export { parseLine, parseProgram } from './parser.js';
export { createCodeDictionary } from './code-dictionary.js';
export { tokenCategory } from './classify.js';
export { occurrenceKey, describeOccurrence, tokenAt } from './occurrences.js';
export { explainToken, paramsFor } from './explain.js';
export * as cutting from './cutting.js';
export { normalizeRanges, validateRange, inRanges, countInRanges, formatRanges, parseRanges, nextFreeVariable } from './macro-ranges.js';
export { analyzeMacros, assignedVariables, referencedVariables, variableWarnings, REPEATED_LETTERS } from './macros.js';
export { createModalState, applyBlock, modalStateAt } from './modal-state.js';
export { checkProgram, CHECKER_RULES, blockRefLetters } from './checker.js';
export { renumber, MAX_BLOCK_NUMBER } from './renumber.js';

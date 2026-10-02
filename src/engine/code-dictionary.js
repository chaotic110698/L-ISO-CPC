/**
 * Dictionnaire effectif : superposition de couches de définitions (ISO générique → FANUC
 * tournage → profils personnels à l'étape 4). Chaque couche :
 *
 *   {
 *     id, label,
 *     codes:     { 'G1': { category, name, description, … } | null },
 *     addresses: { 'X': 'signification', … },
 *     variables: [ { from, to, name, description } ]    plages de variables de macro
 *   }
 *
 * - Un code redéfini par une couche supérieure est entièrement remplacé ; les définitions
 *   remplacées restent consultables (`previous`), pour signaler un code « détourné ».
 * - `null` retire un code ; une adresse redéfinie remplace la précédente ; les plages de
 *   variables de la dernière couche qui en définit sont retenues.
 */
export function createCodeDictionary(layers = []) {
  let codes = new Map();
  let addresses = new Map();
  let variables = [];
  const listeners = new Set();

  function rebuild(newLayers) {
    codes = new Map();
    addresses = new Map();
    variables = [];
    for (const layer of newLayers) {
      for (const [key, definition] of Object.entries(layer.codes ?? {})) {
        const replaced = codes.get(key);
        const previous = replaced ? [...replaced.previous, { source: replaced.source, sourceLabel: replaced.sourceLabel, name: replaced.name, category: replaced.category }] : [];
        if (definition === null) codes.delete(key);
        else codes.set(key, { ...definition, key, source: layer.id, sourceLabel: layer.label ?? layer.id, previous });
      }
      for (const [letter, text] of Object.entries(layer.addresses ?? {})) {
        addresses.set(letter, { letter, text, source: layer.id, sourceLabel: layer.label ?? layer.id });
      }
      if (layer.variables?.length) variables = layer.variables;
    }
  }

  rebuild(layers);

  return {
    /** Définition d'un code normalisé ('G1', 'M30'), ou undefined. */
    lookup: (key) => codes.get(key),
    entries: () => [...codes.values()],
    /** Signification générale d'une adresse ('X', ',C'…), ou undefined. */
    address: (letter) => addresses.get(letter),
    /** Plage contenant la variable #index, ou undefined. */
    variableRange: (index) => variables.find((range) => index >= range.from && index <= range.to),
    setLayers(newLayers) {
      rebuild(newLayers);
      for (const listener of [...listeners]) listener();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

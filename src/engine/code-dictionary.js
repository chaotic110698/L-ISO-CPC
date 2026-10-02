/**
 * Dictionnaire des codes effectif : superposition de couches de définitions.
 * Chaque couche est { id, codes: { 'G1': { category, name, … } } } ; une couche plus haute
 * complète ou remplace les champs d'un code (G90 : « absolu » en ISO, « cycle de chariotage »
 * en tournage Fanuc système A), et `null` retire un code.
 *
 * Étape 4 : les couches viendront des profils machines actifs (ISO générique → Fanuc
 * tournage → profils personnels), avec notification des changements via onChange().
 */
export function createCodeDictionary(layers = []) {
  let merged = new Map();
  const listeners = new Set();

  function rebuild(newLayers) {
    merged = new Map();
    for (const layer of newLayers) {
      for (const [key, definition] of Object.entries(layer.codes ?? {})) {
        if (definition === null) merged.delete(key);
        else merged.set(key, { ...(merged.get(key) ?? {}), ...definition, key, source: layer.id });
      }
    }
  }

  rebuild(layers);

  return {
    /** Définition d'un code normalisé ('G1', 'M30'), ou undefined. */
    lookup: (key) => merged.get(key),
    entries: () => [...merged.values()],
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

/**
 * Bus d'événements minimal (publication / abonnement) pour découpler les services et les modules.
 *
 * Événements émis par le socle (voir README) :
 *   workspace:opened        { program }       un programme vient d'être chargé dans l'éditeur
 *   workspace:dirty         { dirty }         l'état « modifications non enregistrées » change
 *   workspace:changed       —                 le texte du programme courant a été modifié
 *   workspace:saving        { program }       un enregistrement commence
 *   workspace:saved         { program }       le programme courant vient d'être enregistré
 *   workspace:save-failed   { error }         l'enregistrement a échoué
 *   workspace:list-changed  —                 la liste des programmes a changé
 *   workspace:renamed       { program }       un programme a été renommé
 */
export class EventBus {
  #handlers = new Map();

  /** @returns {() => void} fonction de désabonnement */
  on(type, handler) {
    if (!this.#handlers.has(type)) this.#handlers.set(type, new Set());
    this.#handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    this.#handlers.get(type)?.delete(handler);
  }

  emit(type, payload) {
    const handlers = this.#handlers.get(type);
    if (!handlers) return;
    for (const handler of [...handlers]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`Erreur dans un gestionnaire de « ${type} »`, error);
      }
    }
  }
}

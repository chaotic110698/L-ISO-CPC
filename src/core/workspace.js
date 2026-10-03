import { FANUC_TURNING_DEMO, NEW_PROGRAM_TEMPLATE } from '../data/samples/fanuc-turning-demo.js';

const LAST_PROGRAM_KEY = 'lastProgramId';
const DRAFT_KEY = 'draft';

/**
 * Espace de travail : le programme ouvert dans l'éditeur et son cycle de vie
 * (ouverture, modification, enregistrement, renommage, suppression…).
 *
 * Indépendant de l'interface : l'éditeur lui fournit une source de texte (`setTextSource`)
 * et lui signale les modifications (`markDirty`) ; les autres parties de l'application
 * réagissent aux événements `workspace:*` publiés sur le bus.
 */
export class Workspace {
  #repo;
  #kv;
  #bus;
  #current = null;
  #getText = null;
  #revision = 0;
  #savedRevision = 0;
  #queue = Promise.resolve();

  /** Vrai quand un module d'enregistrement automatique est actif. */
  autosave = false;

  /** Vrai quand le module « Corbeille » est actif : une suppression est alors récupérable. */
  trashEnabled = false;

  constructor({ repo, kv, bus }) {
    this.#repo = repo;
    this.#kv = kv;
    this.#bus = bus;
  }

  /** Programme courant tel qu'enregistré (le texte en cours d'édition peut être plus récent). */
  get current() {
    return this.#current;
  }

  get dirty() {
    return this.#revision !== this.#savedRevision;
  }

  /** Fonction renvoyant le texte en cours d'édition (fournie par l'éditeur). */
  setTextSource(getText) {
    this.#getText = getText;
  }

  get text() {
    return this.#getText ? this.#getText() : (this.#current?.content ?? '');
  }

  /** Ouvre le dernier programme utilisé, ou crée l'exemple au tout premier lancement. */
  async init() {
    let program = null;
    const lastId = this.#kv.get(LAST_PROGRAM_KEY);
    if (lastId) program = await this.#repo.get(lastId);
    if (!program) program = (await this.#repo.list())[0] ?? null;
    if (!program) program = await this.#repo.create(FANUC_TURNING_DEMO);

    const recovered = await this.#recoverDraft();
    if (recovered && recovered.id === program.id) program = recovered;
    this.#setCurrent(program);
    return { recovered: Boolean(recovered) };
  }

  /**
   * Détache le programme courant sans rien enregistrer (avant l'effacement complet des
   * données) : les enregistrements et copies de secours suivants deviennent sans effet.
   */
  detach() {
    this.#current = null;
    this.#revision = 0;
    this.#savedRevision = 0;
  }

  /** Signale une modification du texte (appelé par l'éditeur à chaque frappe). */
  markDirty() {
    if (!this.#current) return;
    const wasDirty = this.dirty;
    this.#revision++;
    if (!wasDirty) this.#bus.emit('workspace:dirty', { dirty: true });
    this.#bus.emit('workspace:changed');
  }

  /** Enregistre le texte courant s'il a été modifié. Les enregistrements sont sérialisés. */
  save() {
    const task = this.#queue.then(() => this.#saveNow());
    this.#queue = task.catch(() => {});
    return task;
  }

  async #saveNow() {
    if (!this.#current || !this.dirty) return this.#current;
    const revision = this.#revision;
    const id = this.#current.id;
    this.#bus.emit('workspace:saving', { program: this.#current });
    try {
      const saved = await this.#repo.update(id, { content: this.text });
      if (this.#current?.id !== id) return saved;
      this.#current = saved;
      this.#savedRevision = revision;
      this.#kv.remove(DRAFT_KEY);
      this.#bus.emit('workspace:saved', { program: saved });
      if (!this.dirty) this.#bus.emit('workspace:dirty', { dirty: false });
      this.#bus.emit('workspace:list-changed');
      return saved;
    } catch (error) {
      this.#bus.emit('workspace:save-failed', { error });
      throw error;
    }
  }

  /**
   * Écrit immédiatement (de façon synchrone) le texte non enregistré dans le stockage local.
   * Filet de sécurité appelé à la fermeture de la page : récupéré au prochain démarrage.
   */
  writeDraft() {
    if (!this.#current || !this.dirty) return;
    this.#kv.set(DRAFT_KEY, { programId: this.#current.id, content: this.text, savedAt: Date.now() });
  }

  async #recoverDraft() {
    const draft = this.#kv.get(DRAFT_KEY);
    this.#kv.remove(DRAFT_KEY);
    if (!draft || typeof draft.content !== 'string') return null;
    const program = await this.#repo.get(draft.programId);
    if (!program || draft.savedAt <= program.updatedAt || draft.content === program.content) return null;
    return this.#repo.update(program.id, { content: draft.content });
  }

  #setCurrent(program) {
    this.#current = program;
    this.#revision = 0;
    this.#savedRevision = 0;
    this.#kv.set(LAST_PROGRAM_KEY, program.id);
    this.#bus.emit('workspace:opened', { program });
    this.#bus.emit('workspace:dirty', { dirty: false });
  }

  /**
   * Ouvre un programme. Par défaut, le programme courant est d'abord enregistré ;
   * `{ save: false }` abandonne ses modifications.
   */
  async open(id, { save = true } = {}) {
    if (save) await this.save();
    const program = await this.#repo.get(id);
    if (!program) throw new Error('Programme introuvable.');
    this.#setCurrent(program);
    return program;
  }

  async create({ name, content = NEW_PROGRAM_TEMPLATE, machineType, save = true } = {}) {
    if (save) await this.save();
    const program = await this.#repo.create({ name, content, machineType });
    this.#setCurrent(program);
    this.#bus.emit('workspace:list-changed');
    return program;
  }

  async rename(id, name) {
    const renamed = await this.#repo.update(id, { name });
    if (this.#current?.id === id) {
      this.#current = { ...this.#current, name: renamed.name, updatedAt: renamed.updatedAt };
    }
    this.#bus.emit('workspace:renamed', { program: renamed });
    this.#bus.emit('workspace:list-changed');
    return renamed;
  }

  async duplicate(id) {
    if (this.#current?.id === id) await this.save();
    const copy = await this.#repo.duplicate(id);
    this.#bus.emit('workspace:list-changed');
    return copy;
  }

  /**
   * Supprime un programme (à la corbeille si elle est active, sinon définitivement) ;
   * si c'était le programme ouvert, ouvre le plus récent restant.
   */
  async remove(id) {
    if (this.trashEnabled) await this.#repo.trash(id);
    else await this.#repo.remove(id);
    if (this.#current?.id === id) {
      this.#current = null;
      const next = (await this.#repo.list())[0];
      if (next) this.#setCurrent(next);
      else this.#setCurrent(await this.#repo.create({ name: 'Nouveau programme', content: NEW_PROGRAM_TEMPLATE }));
    }
    this.#bus.emit('workspace:list-changed');
  }

  list() {
    return this.#repo.list();
  }

  async setPinned(id, pinned) {
    const program = await this.#repo.setPinned(id, pinned);
    if (this.#current?.id === id) this.#current = { ...this.#current, pinned: program.pinned };
    this.#bus.emit('workspace:list-changed');
    return program;
  }

  listTrash() {
    return this.#repo.listTrash();
  }

  async restore(id) {
    const program = await this.#repo.restore(id);
    this.#bus.emit('workspace:list-changed');
    return program;
  }

  /** Suppression définitive d'un programme de la corbeille (ou de toute la corbeille). */
  async purge(id) {
    await this.#repo.remove(id);
    this.#bus.emit('workspace:list-changed');
  }

  async emptyTrash() {
    const trashed = await this.#repo.listTrash();
    for (const program of trashed) await this.#repo.remove(program.id);
    this.#bus.emit('workspace:list-changed');
    return trashed.length;
  }

  async purgeExpired(days) {
    const count = await this.#repo.purgeTrash(days);
    if (count) this.#bus.emit('workspace:list-changed');
    return count;
  }

  /** Recharge le programme courant depuis le stockage (après une restauration de sauvegarde). */
  async reload() {
    const id = this.#current?.id;
    const program = (id && (await this.#repo.get(id))) || (await this.#repo.list())[0];
    this.#setCurrent(program ?? (await this.#repo.create(FANUC_TURNING_DEMO)));
    this.#bus.emit('workspace:list-changed');
  }
}

import { EventBus } from './core/event-bus.js';
import { createModuleRegistry } from './core/module-registry.js';
import { createRouter } from './core/router.js';
import { Workspace } from './core/workspace.js';
import { createKv } from './storage/kv.js';
import { openDatabase } from './storage/database.js';
import { createProgramRepository } from './storage/programs.js';
import { createBackupService } from './storage/backup.js';
import { createSettingsStore } from './settings/settings-store.js';
import { CORE_SETTINGS } from './settings/schema.js';
import { applyTheme, applyEditorFontSize } from './ui/theme.js';
import { createShell } from './ui/shell.js';
import { createEditorPage } from './ui/pages/editor-page.js';
import { createSettingsPage } from './ui/pages/settings-page.js';
import { openProgramsDrawer } from './ui/programs-drawer.js';
import { renameProgram } from './ui/program-actions.js';
import { openDialog, actionSheet, confirmDialog, promptDialog } from './ui/dialogs.js';
import { toast } from './ui/toast.js';
import { MODULES } from './modules/index.js';
import { createCodeDictionary } from './engine/index.js';
import { ISO_BASE_CODES } from './data/codes/iso-base.js';
import { FANUC_TURNING_CODES } from './data/codes/fanuc-turning.js';
import { APP_VERSION } from './version.js';

/**
 * Démarrage de l'application : services (stockage, réglages, espace de travail),
 * interface (coque, pages), puis branchement des modules selon les réglages.
 */
export async function startApp(root) {
  // --- Réglages et thème (avant tout affichage) -------------------------------------------
  const kv = createKv();
  const settings = createSettingsStore({ kv, entries: CORE_SETTINGS });
  applyTheme(settings.get('theme'));
  applyEditorFontSize(settings.get('editor.fontSize'));

  // --- Services ----------------------------------------------------------------------------
  const bus = new EventBus();
  const db = await openDatabase({
    kv,
    onVersionChange: () => toast('Le site a été mis à jour dans un autre onglet : rechargez cette page.', { type: 'error', timeout: 15000 }),
  });
  const programs = createProgramRepository(db);
  const workspace = new Workspace({ repo: programs, kv, bus });
  // Dictionnaire des codes ; à l'étape 4, ses couches viendront des profils machines actifs.
  const codes = createCodeDictionary([ISO_BASE_CODES, FANUC_TURNING_CODES]);

  const backup = createBackupService({ appVersion: APP_VERSION });
  backup.register('programmes', {
    label: 'Programmes',
    exportData: () => programs.list(),
    importData: (data, options) => programs.importMany(data, options),
    describe: (data) => `${Array.isArray(data) ? data.length : 0} programme(s)`,
  });
  backup.register('parametres', {
    label: 'Paramètres',
    exportData: async () => settings.exportValues(),
    importData: async (data, options) => settings.importValues(data, options),
    describe: (data) => `${Object.keys(data ?? {}).length} réglage(s) personnalisé(s)`,
  });

  // --- Interface ---------------------------------------------------------------------------
  const shell = createShell(root, {
    onMenu: () => openProgramsDrawer({ workspace, bus }),
    onRename: () => workspace.current && renameProgram(workspace, workspace.current),
    onToggleTheme: () => settings.set('theme', settings.get('theme') === 'dark' ? 'light' : 'dark'),
  });
  shell.setTheme(settings.get('theme'));

  const editorPage = createEditorPage({ settings });
  const { editor } = editorPage;

  settings.subscribe('theme', (theme) => {
    applyTheme(theme);
    shell.setTheme(theme);
    editor.setDark(theme === 'dark');
  });
  settings.subscribe('editor.fontSize', (size) => {
    applyEditorFontSize(size);
    editor.remeasure();
  });
  settings.subscribe('editor.lineWrapping', (enabled) => editor.setLineWrapping(enabled));

  // --- Liaison éditeur ↔ espace de travail -------------------------------------------------
  workspace.setTextSource(() => editor.getText());
  editor.onUpdate((update) => {
    if (update.docChanged) workspace.markDirty();
  });
  bus.on('workspace:opened', ({ program }) => {
    editor.setText(program.content);
    shell.setProgramName(program.name);
  });
  bus.on('workspace:renamed', ({ program }) => {
    if (program.id === workspace.current?.id) shell.setProgramName(program.name);
  });
  bus.on('workspace:dirty', ({ dirty }) => shell.setDirty(dirty));
  bus.on('workspace:save-failed', ({ error }) => toast(`Échec de l’enregistrement : ${error.message}`, { type: 'error' }));

  setupCoreEditorFeatures({ editorPage, workspace, bus });

  // Fermeture de la page avec des modifications non enregistrées (sauvegarde automatique coupée).
  window.addEventListener('beforeunload', (event) => {
    if (workspace.dirty && !workspace.autosave) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // --- Modules -----------------------------------------------------------------------------
  const ui = {
    toast,
    openDialog,
    actionSheet,
    confirm: confirmDialog,
    prompt: promptDialog,
  };
  const registry = createModuleRegistry({
    settings,
    createContext: (def, scope) => ({
      id: def.id,
      signal: scope.signal,
      onDispose: (fn) => scope.add(fn),
      listen(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        scope.add(() => target.removeEventListener(type, handler, options));
      },
      settings: {
        get: settings.get,
        set: settings.set,
        subscribe: (key, listener) => scope.add(settings.subscribe(key, listener)),
      },
      bus: {
        emit: (type, payload) => bus.emit(type, payload),
        on: (type, handler) => scope.add(bus.on(type, handler)),
      },
      editor: editor.scoped(scope),
      codes,
      workspace,
      backup: { register: (id, section) => scope.add(backup.register(id, section)) },
      ui: {
        ...ui,
        toolbar: editorPage.toolbar.scoped(scope),
        statusbar: editorPage.statusbar.scoped(scope),
      },
    }),
    onError: (def, error) => {
      console.error(`Module « ${def.id} »`, error);
      toast(`La fonctionnalité « ${def.label} » n’a pas pu démarrer.`, { type: 'error' });
    },
  });
  for (const mod of MODULES) registry.register(mod);

  // --- Pages et navigation -----------------------------------------------------------------
  const router = createRouter({
    container: shell.pages,
    defaultPath: '/editeur',
    onChange: (path) => shell.setRoute(path),
  });
  router.register('/editeur', {
    title: 'Éditeur',
    mount: () => editorPage.element,
    onShow: () => editor.remeasure(),
  });
  router.register('/parametres', {
    title: 'Paramètres',
    mount: () => createSettingsPage({ settings, registry, backup, workspace, db }),
  });
  shell.addNavLink({ path: '/editeur', label: 'Éditeur', icon: 'code' });
  shell.addNavLink({ path: '/parametres', label: 'Paramètres', icon: 'settings' });

  const { recovered } = await workspace.init();
  registry.start();
  router.start();

  if (recovered) toast('Des modifications non enregistrées ont été récupérées.', { type: 'success' });
  if (!kv.available) toast('Stockage du navigateur indisponible : rien ne sera conservé après fermeture.', { type: 'error', timeout: 10000 });

  // Point d'accès pour le débogage et les tests de bout en bout.
  return { settings, bus, workspace, editor, registry, router, backup, db, codes };
}

/** Fonctions du socle toujours présentes : enregistrement manuel, position du curseur, état. */
function setupCoreEditorFeatures({ editorPage, workspace, bus }) {
  const { editor, toolbar, statusbar } = editorPage;

  const save = () => workspace.save().catch(() => {});
  toolbar.add({ id: 'save', icon: 'save', label: 'Enregistrer', title: 'Enregistrer (Ctrl+S)', order: 1, onClick: save });
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  const position = statusbar.add({ id: 'cursor', order: 10 });
  const refreshPosition = () => {
    const { line, column, lines } = editor.cursor;
    position.set(`Ligne ${line}, col. ${column}`, { title: `${lines} ligne${lines > 1 ? 's' : ''} au total` });
  };
  editor.onUpdate((update) => {
    if (update.selectionSet || update.docChanged) refreshPosition();
  });
  editor.onDocReplaced(refreshPosition);
  refreshPosition();

  const saveState = statusbar.add({ id: 'save-state', side: 'end', order: 10 });
  const showSaveState = (state) => {
    const states = {
      saved: ['Enregistré', ''],
      dirty: [workspace.autosave ? 'Modifié…' : 'Non enregistré', 'warning'],
      saving: ['Enregistrement…', ''],
      failed: ['Échec de l’enregistrement', 'error'],
    };
    const [text, tone] = states[state];
    saveState.set(text, { tone });
  };
  bus.on('workspace:dirty', ({ dirty }) => showSaveState(dirty ? 'dirty' : 'saved'));
  bus.on('workspace:saving', () => showSaveState('saving'));
  bus.on('workspace:saved', () => showSaveState(workspace.dirty ? 'dirty' : 'saved'));
  bus.on('workspace:save-failed', () => showSaveState('failed'));
  showSaveState('saved');
}

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
import { applyTheme, applyUiSize, applyEditorFontSize } from './ui/theme.js';
import { createShell } from './ui/shell.js';
import { createEditorPage } from './ui/pages/editor-page.js';
import { createSettingsPage } from './ui/pages/settings-page.js';
import { createHomePage } from './ui/pages/home-page.js';
import { openProgramsDrawer } from './ui/programs-drawer.js';
import { renameProgram } from './ui/program-actions.js';
import { openDialog, actionSheet, confirmDialog, promptDialog } from './ui/dialogs.js';
import { toast } from './ui/toast.js';
import { MODULES } from './modules/index.js';
import { createCodeDictionary } from './engine/index.js';
import { createProfileService } from './core/profiles.js';
import { createMacroService } from './core/macros.js';
import { createVersionService } from './core/versions.js';
import { createLibraryService } from './core/library.js';
import { createProfilesPage } from './ui/pages/profiles-page.js';
import { openCodeEditor } from './ui/code-editor.js';
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
  applyUiSize(settings.get('ui.size'));
  applyEditorFontSize(settings.get('editor.fontSize'));

  // --- Services ----------------------------------------------------------------------------
  const bus = new EventBus();
  const db = await openDatabase({
    kv,
    onVersionChange: () => toast('Le site a été mis à jour dans un autre onglet : rechargez cette page.', { type: 'error', timeout: 15000 }),
  });
  const programs = createProgramRepository(db);
  const workspace = new Workspace({ repo: programs, kv, bus });
  // Dictionnaire des codes : ses couches sont les profils machines activés, dans l'ordre.
  const codes = createCodeDictionary();
  const profiles = createProfileService({ db, dictionary: codes, bus });
  await profiles.init();
  const macros = createMacroService({ db, profiles, workspace, bus });
  await macros.init();
  const versions = createVersionService({ db });
  const library = createLibraryService({ db, bus });

  const backup = createBackupService({ appVersion: APP_VERSION });
  backup.register('programmes', {
    label: 'Programmes',
    exportData: () => programs.listAll(),
    importData: (data, options) => programs.importMany(data, options),
    describe: (data) => `${Array.isArray(data) ? data.filter((p) => !p.deletedAt).length : 0} programme(s)`,
  });
  backup.register('profils', {
    label: 'Profils machines',
    exportData: async () => profiles.exportAll(),
    importData: (data, options) => profiles.importAll(data, options),
    describe: (data) => `${Array.isArray(data) ? data.filter((p) => !p.builtin).length : 0} profil(s) personnel(s)`,
  });
  backup.register('macros', {
    label: 'Noms des variables de macro',
    exportData: async () => macros.exportAll(),
    importData: (data, options) => macros.importAll(data, options),
    describe: (data) => `${Array.isArray(data) ? data.length : 0} variable(s) nommée(s)`,
  });
  backup.register('bibliotheque', {
    label: 'Bibliothèque de sous-programmes',
    exportData: () => library.exportAll(),
    importData: (data, options) => library.importAll(data, options),
    describe: (data) => `${Array.isArray(data) ? data.length : 0} élément(s)`,
  });
  backup.register('versions', {
    label: 'Versions des programmes',
    exportData: () => versions.exportAll(),
    importData: (data, options) => versions.importAll(data, options),
    describe: (data) => `${Array.isArray(data) ? data.length : 0} version(s)`,
  });
  backup.register('parametres', {
    label: 'Paramètres',
    exportData: async () => settings.exportValues(),
    importData: async (data, options) => settings.importValues(data, options),
    describe: (data) => `${Object.keys(data ?? {}).length} réglage(s) personnalisé(s)`,
  });

  // --- Interface ---------------------------------------------------------------------------
  const openPrograms = () => openProgramsDrawer({ workspace, bus, kv });
  const shell = createShell(root, {
    collapsed: kv.get('navCollapsed', false) === true,
    onCollapsedChange: (collapsed) => kv.set('navCollapsed', collapsed),
    onRename: () => workspace.current && renameProgram(workspace, workspace.current),
    onToggleTheme: () => settings.set('theme', settings.get('theme') === 'dark' ? 'light' : 'dark'),
  });
  shell.setTheme(settings.get('theme'));

  const editorPage = createEditorPage({ settings, kv });
  const { editor } = editorPage;

  settings.subscribe('theme', (theme) => {
    applyTheme(theme);
    shell.setTheme(theme);
    editor.setDark(theme === 'dark');
  });
  settings.subscribe('ui.size', (size) => {
    applyUiSize(size);
    editor.remeasure();
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

  setupCoreEditorFeatures({ editorPage, workspace, bus, openPrograms });

  // Fermeture de la page avec des modifications non enregistrées (sauvegarde automatique coupée).
  window.addEventListener('beforeunload', (event) => {
    if (workspace.dirty && !workspace.autosave) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // --- Modules -----------------------------------------------------------------------------
  // Sources de la palette de commandes : chaque module peut y proposer ses entrées
  // (source : { id, label, order, entries() → [{ label, detail?, keywords?, icon?, suggested?, run }] }).
  const paletteSources = new Set();
  const addPaletteSource = (source) => {
    paletteSources.add(source);
    return () => paletteSources.delete(source);
  };
  const ui = {
    /** Ouvre l'édition d'un code dans un profil personnel (depuis une infobulle, par ex.). */
    editCode: (key) => {
      const current = codes.lookup(key);
      const { key: _k, source: _s, sourceLabel: _l, previous: _p, ...definition } = current ?? {};
      return openCodeEditor({ profiles, key, initial: current ? structuredClone(definition) : { name: '', category: key.startsWith('M') ? 'mcode' : 'mode' } });
    },
    toast,
    openDialog,
    actionSheet,
    confirm: confirmDialog,
    prompt: promptDialog,
  };
  const registry = createModuleRegistry({
    settings,
    batch: (fn) => editor.batch(fn),
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
      profiles,
      macros,
      versions,
      library,
      workspace,
      backup: { register: (id, section) => scope.add(backup.register(id, section)) },
      ui: {
        ...ui,
        toolbar: editorPage.toolbar.scoped(scope),
        statusbar: editorPage.statusbar.scoped(scope),
        panels: editorPage.panels.scoped(scope),
        /** Élément sous la zone d'édition (barre de touches…). */
        accessories: editorPage.accessories.scoped(scope),
        /** Palette de commandes : ajout d'une source d'entrées, liste des sources. */
        palette: {
          add: (source) => scope.add(addPaletteSource(source)),
          sources: () => [...paletteSources].sort((a, b) => (a.order ?? 50) - (b.order ?? 50)),
        },
        /** Entrées du menu latéral (pages et actions). */
        navItems: () => shell.listNavItems(),
        /** Affiche une page (« /editeur », « /cours/repere-du-tour »…). */
        navigate: (path) => router.navigate(path),
        /** Ouvre l'éditeur avec le panneau demandé (depuis le menu latéral, par ex.). */
        showPanel(id) {
          router.navigate('/editeur');
          editorPage.panels.open(id);
        },
        /** Entrée du menu latéral (remplace l'entrée « à venir » de même identifiant). */
        addNavItem: (item) => scope.add(shell.addNavItem(item)),
        /** Ajoute une page et son entrée de menu (retirées à la désactivation du module). */
        addPage({ id, path, label, icon, order, mount, onShow }) {
          const removeRoute = router.register(path, { title: label, mount, onShow });
          const removeNav = shell.addNavItem({ id, path, label, icon, order });
          scope.add(() => {
            removeNav();
            removeRoute();
          });
        },
      },
      kv,
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
    defaultPath: '/accueil',
    onChange: (path) => shell.setRoute(path),
  });
  router.register('/accueil', {
    title: 'Accueil',
    mount: () => createHomePage({ workspace, bus, registry }),
  });
  router.register('/editeur', {
    title: 'Éditeur',
    mount: () => editorPage.element,
    onShow: () => editor.remeasure(),
  });
  router.register('/parametres', {
    title: 'Paramètres',
    mount: () => createSettingsPage({ settings, registry, backup, workspace, db, kv, profiles, bus }),
  });
  router.register('/profils', {
    title: 'Profils machines',
    mount: () => createProfilesPage({ profiles, codes, bus }),
  });

  // Menu latéral. Les fonctions à venir y figurent grisées ; chaque module les remplacera
  // par une vraie entrée (avec sa page) lorsqu'il sera développé.
  shell.addNavItem({ id: 'accueil', path: '/accueil', label: 'Accueil', icon: 'home', order: 10 });
  shell.addNavItem({ id: 'editeur', path: '/editeur', label: 'Éditeur', icon: 'code', order: 20 });
  shell.addNavItem({
    id: 'programmes',
    label: 'Mes programmes',
    icon: 'folder',
    order: 30,
    onSelect: () => {
      router.navigate('/editeur');
      openPrograms();
    },
  });
  shell.addNavItem({ id: 'profils', path: '/profils', label: 'Profils machines', icon: 'machine', order: 35 });
  shell.addNavItem({ id: 'parametres', path: '/parametres', label: 'Paramètres', icon: 'settings', order: 90 });
  // Fonctions prévues (grisées). Les fonctionnalités existantes ajoutent leur propre entrée
  // depuis leur module : désactivées, elles disparaissent du menu.
  for (const item of [
    { id: 'cours', label: 'Cours d’ISO', icon: 'book' },
    { id: 'simulation', label: 'Simulation 2D', icon: 'simulation' },
  ]) {
    shell.addNavItem({ ...item, upcoming: true });
  }

  const { recovered } = await workspace.init();
  registry.start();
  router.start();

  if (recovered) toast('Des modifications non enregistrées ont été récupérées.', { type: 'success' });
  if (!kv.available) toast('Stockage du navigateur indisponible : rien ne sera conservé après fermeture.', { type: 'error', timeout: 10000 });

  // Point d'accès pour le débogage et les tests de bout en bout.
  return { settings, bus, workspace, editor, registry, router, backup, db, codes, profiles, macros, versions, library };
}

/** Fonctions du socle toujours présentes : enregistrement manuel, position du curseur, état. */
function setupCoreEditorFeatures({ editorPage, workspace, bus, openPrograms }) {
  const { editor, toolbar, statusbar } = editorPage;

  toolbar.add({ id: 'programs', icon: 'folder', label: 'Programmes', title: 'Mes programmes (ouvrir, créer, renommer…)', order: 0, onClick: openPrograms });

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

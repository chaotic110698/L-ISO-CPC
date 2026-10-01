import { h, pickFile, readTextFile } from '../core/dom.js';
import { openDialog, confirmDialog, promptDialog } from './dialogs.js';
import { toast } from './toast.js';

/**
 * Actions sur les programmes partagées par la barre du haut et le tiroir « Programmes ».
 * Elles gèrent les dialogues et les messages ; la logique reste dans le Workspace.
 */

/**
 * Avant de quitter le programme courant : si l'enregistrement automatique est coupé et qu'il
 * reste des modifications, demande quoi faire. Renvoie { save } ou null (annulation).
 */
async function leaveCurrent(workspace) {
  if (!workspace.dirty || workspace.autosave) return { save: true };
  const choice = await openDialog({
    title: 'Modifications non enregistrées',
    body: h('p', null, `« ${workspace.current?.name} » contient des modifications non enregistrées.`),
    actions: [
      { label: 'Enregistrer', value: 'save', primary: true },
      { label: 'Ne pas enregistrer', value: 'discard', danger: true },
      { label: 'Annuler' },
    ],
  });
  if (choice === 'save') return { save: true };
  if (choice === 'discard') return { save: false };
  return null;
}

function reportError(message, error) {
  console.error(message, error);
  toast(`${message} ${error?.message ?? ''}`.trim(), { type: 'error' });
}

export async function switchProgram(workspace, id) {
  if (workspace.current?.id === id) return true;
  const leave = await leaveCurrent(workspace);
  if (!leave) return false;
  try {
    await workspace.open(id, leave);
    return true;
  } catch (error) {
    reportError('Impossible d’ouvrir le programme.', error);
    return false;
  }
}

export async function newProgram(workspace) {
  const name = await promptDialog({ title: 'Nouveau programme', label: 'Nom du programme', value: 'Nouveau programme', confirmLabel: 'Créer' });
  if (name == null) return false;
  const leave = await leaveCurrent(workspace);
  if (!leave) return false;
  try {
    await workspace.create({ name, ...leave });
    return true;
  } catch (error) {
    reportError('Impossible de créer le programme.', error);
    return false;
  }
}

/** Importe un fichier .nc / .txt / .iso… comme nouveau programme. */
export async function openProgramFile(workspace) {
  const file = await pickFile();
  if (!file) return false;
  const leave = await leaveCurrent(workspace);
  if (!leave) return false;
  try {
    const content = await readTextFile(file);
    const name = file.name.replace(/\.[^.]+$/, '') || file.name;
    const program = await workspace.create({ name, content, ...leave });
    toast(`Fichier ouvert : ${program.name}`, { type: 'success' });
    return true;
  } catch (error) {
    reportError('Impossible de lire ce fichier.', error);
    return false;
  }
}

export async function renameProgram(workspace, program) {
  const name = await promptDialog({ title: 'Renommer le programme', label: 'Nom du programme', value: program.name, confirmLabel: 'Renommer' });
  if (name == null || name === program.name) return false;
  try {
    await workspace.rename(program.id, name);
    return true;
  } catch (error) {
    reportError('Impossible de renommer le programme.', error);
    return false;
  }
}

export async function duplicateProgram(workspace, program) {
  try {
    const copy = await workspace.duplicate(program.id);
    toast(`Copie créée : ${copy.name}`, { type: 'success' });
    return true;
  } catch (error) {
    reportError('Impossible de dupliquer le programme.', error);
    return false;
  }
}

export async function deleteProgram(workspace, program) {
  const ok = await confirmDialog({
    title: 'Supprimer le programme',
    message: `Supprimer définitivement « ${program.name} » ? Cette action est irréversible.`,
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return false;
  try {
    await workspace.remove(program.id);
    toast('Programme supprimé.');
    return true;
  } catch (error) {
    reportError('Impossible de supprimer le programme.', error);
    return false;
  }
}

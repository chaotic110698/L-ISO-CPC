import { downloadText } from '../../core/dom.js';
import { safeFileName } from '../../core/util.js';

export default {
  id: 'exportFile',
  label: 'Export en fichier .nc / .txt',
  description: 'Bouton « Télécharger » pour récupérer le programme sous forme de fichier, prêt pour la machine ou le logiciel de DNC.',
  group: 'fichiers',
  settings: [
    {
      key: 'exportFile.lineEnding',
      type: 'choice',
      label: 'Fins de ligne',
      description: 'CRLF (Windows) convient à la plupart des logiciels de transfert ; LF pour les systèmes Linux.',
      options: [
        { value: 'crlf', label: 'CRLF' },
        { value: 'lf', label: 'LF' },
      ],
      default: 'crlf',
    },
  ],
  activate(ctx) {
    ctx.ui.toolbar.add({
      id: 'download',
      icon: 'download',
      label: 'Télécharger',
      title: 'Télécharger le programme (.nc / .txt)',
      order: 90,
      menu: true,
      onClick: async () => {
        const extension = await ctx.ui.actionSheet({
          title: 'Télécharger le programme',
          actions: [
            { label: 'Fichier .nc', value: 'nc', icon: 'file', description: 'Format courant pour les commandes numériques' },
            { label: 'Fichier .txt', value: 'txt', icon: 'file', description: 'Texte brut, lisible partout' },
          ],
        });
        if (!extension) return;
        const eol = ctx.settings.get('exportFile.lineEnding') === 'crlf' ? '\r\n' : '\n';
        const text = ctx.workspace.text.replace(/\n/g, eol);
        downloadText(`${safeFileName(ctx.workspace.current?.name)}.${extension}`, text);
      },
    });
  },
};

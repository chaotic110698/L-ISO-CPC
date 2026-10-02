import { h, domId } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { createQuestionCard } from './quiz-view.js';
import { BOX_DAYS, REVIEW_SIZES, REVIEW_SOURCES, filterPool, reviewStats, selectSession } from './review.js';

/**
 * Écran de révision : accueil (compteurs, options), session question par question, bilan.
 * La session en cours est conservée tant que la page reste ouverte.
 *
 * buildPool() → toutes les questions ; record(id, ok) enregistre la réponse (répétition espacée).
 */
export function createReviewView({ progress, buildPool, ctx, record }) {
  const root = h('div', { class: 'review' });
  let session = null;

  const back = () => h('a', { class: 'course-back', href: '#/cours' }, icon('arrowLeft'), 'Tous les cours');
  const sourceLabel = (q) => (q.source === 'lesson' ? `Leçon ${q.lesson.number} · ${q.lesson.title}` : 'Codes de votre profil');

  function segmented(label, key, options) {
    const name = domId('review');
    return h(
      'div',
      { class: 'course-pref', dataset: { option: key } },
      h('p', { class: 'course-pref-label' }, label),
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': label },
        options.map((option) =>
          h(
            'label',
            { class: 'segment' },
            h('input', {
              type: 'radio',
              name,
              value: String(option.value),
              checked: progress.get().review.options[key] === option.value,
              // La page se redessine à chaque changement de progression (accueil à jour).
              onchange: () => progress.setReviewOption(key, option.value),
            }),
            h('span', null, option.label),
          ),
        ),
      ),
    );
  }

  function renderIntro() {
    const { items, options } = progress.get().review;
    const pool = filterPool(buildPool(), options.source);
    const stats = reviewStats(pool, items);
    const available = Math.min(options.size, stats.due + stats.fresh);
    const tile = (value, label, tone) => h('div', { class: `review-stat${tone ? ` is-${tone}` : ''}` }, h('strong', null, String(value)), h('span', null, label));

    root.replaceChildren(
      back(),
      h('h1', { class: 'page-title' }, 'Révision'),
      h(
        'p',
        { class: 'card-description' },
        'Des questions tirées des leçons et des codes de vos profils machines, codes personnels compris. Une question ratée revient dès la session suivante ; une question réussie revient de plus en plus tard (',
        BOX_DAYS.slice(1).join(', '),
        ' jours).',
      ),
      h('div', { class: 'review-stats', role: 'group', 'aria-label': 'Compteurs de révision' }, tile(stats.due, 'à revoir', stats.due ? 'due' : ''), tile(stats.fresh, 'nouvelles'), tile(stats.mastered, 'maîtrisées', 'ok'), tile(stats.total, 'au total')),
      h('section', { class: 'card review-options' }, segmented('Questions', 'source', REVIEW_SOURCES), segmented('Longueur de la session', 'size', REVIEW_SIZES.map((n) => ({ value: n, label: `${n} questions` })))),
      h(
        'div',
        { class: 'button-row' },
        h(
          'button',
          { type: 'button', class: 'btn btn-primary', dataset: { action: 'review-start' }, disabled: !pool.length, onclick: start },
          icon('arrowRight'),
          available ? `Commencer (${available} question${available > 1 ? 's' : ''})` : 'Tout est à jour : réviser quand même',
        ),
      ),
    );
  }

  function start() {
    const { items, options } = progress.get().review;
    const pool = filterPool(buildPool(), options.source);
    const { questions, mode } = selectSession(pool, items, { size: options.size });
    session = { questions, mode, index: 0, first: new Map() };
    renderQuestion();
  }

  function renderQuestion() {
    const question = session.questions[session.index];
    const total = session.questions.length;
    const next = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary',
        hidden: true,
        dataset: { action: 'review-next' },
        onclick: () => {
          session.index++;
          if (session.index < session.questions.length) renderQuestion();
          else renderSummary();
        },
      },
      'Question suivante',
      icon('arrowRight'),
    );
    const card = createQuestionCard({
      question,
      label: `Question ${session.index + 1} / ${total} · ${sourceLabel(question)}${question.again ? ' · à revoir' : ''}`,
      ctx: ctx(),
      onAnswered: (ok) => {
        // Seule la première réponse compte pour la répétition espacée ; une question ratée est
        // reposée une fois en fin de session, pour s'entraîner.
        if (!session.first.has(question.id)) {
          session.first.set(question.id, ok);
          record(question.id, ok);
          if (!ok) session.questions.push({ ...question, again: true });
        }
        next.textContent = session.index + 1 < session.questions.length ? 'Question suivante' : 'Voir le bilan';
        next.append(icon('arrowRight'));
        next.hidden = false;
        next.focus({ preventScroll: true });
      },
    });
    root.replaceChildren(
      h(
        'div',
        { class: 'review-head' },
        h('progress', { max: total, value: session.index, 'aria-label': 'Avancement de la session' }),
        h('button', { type: 'button', class: 'btn btn-small', dataset: { action: 'review-quit' }, onclick: quit }, 'Arrêter'),
      ),
      card,
      h('div', { class: 'button-row' }, next),
    );
    root.closest('.courses-page')?.scrollTo({ top: 0 });
  }

  function renderSummary() {
    const answers = [...session.first.entries()];
    const right = answers.filter(([, ok]) => ok).length;
    const missed = session.questions.filter((q) => !q.again && session.first.get(q.id) === false);
    const parts = [
      back(),
      h('h1', { class: 'page-title' }, 'Bilan de la session'),
      h('div', { class: 'quiz-summary' }, h('p', { class: 'quiz-score' }, `${right} / ${answers.length} justes du premier coup`), h('p', null, missed.length ? `${missed.length} question${missed.length > 1 ? 's' : ''} reviendr${missed.length > 1 ? 'ont' : 'a'} dès la prochaine session.` : 'Aucune erreur : ces questions reviendront dans quelques jours.')),
      missed.length
        ? h(
            'section',
            { class: 'review-missed' },
            h('h2', { class: 'module-group-title' }, 'À retravailler'),
            h(
              'ul',
              null,
              missed.map((q) => h('li', null, q.source === 'lesson' ? h('a', { href: `#/cours/${q.lesson.id}` }, sourceLabel(q)) : sourceLabel(q), h('span', null, ` — ${q.question.replace(/[`*]/g, '')}`))),
            ),
          )
        : null,
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', dataset: { action: 'review-again' }, onclick: () => quit() }, icon('undo'), 'Nouvelle session'),
      ),
    ];
    root.replaceChildren(...parts.filter(Boolean)); // replaceChildren écrirait « null »
    session = null;
  }

  function quit() {
    session = null;
    renderIntro();
  }

  return {
    element: root,
    /** Affichage de la page : reprend la session en cours, sinon l'accueil à jour. */
    show() {
      if (!session) renderIntro();
    },
  };
}

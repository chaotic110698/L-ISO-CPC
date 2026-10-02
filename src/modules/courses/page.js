import { h, domId } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { LESSONS, LEVELS, isAvailable } from '../../data/courses/index.js';
import { MACHINE_PREFS } from './progress.js';
import { renderBlocks, renderInline, hideDefinition } from './render.js';
import { createQuiz } from './quiz-view.js';

const STATUS_LABELS = { new: 'À découvrir', opened: 'Commencée', read: 'Terminée' };

/** La leçon dépend-elle de la machine (schémas doublés, variantes) ? */
function usesPrefs(lesson) {
  const keys = new Set();
  const visit = (blocks) => {
    for (const block of blocks ?? []) {
      if (block.type === 'figure' && block.turret) keys.add('turret');
      if (block.type === 'variants') {
        keys.add(block.pref);
        Object.values(block.cases).forEach(visit);
      }
      visit(block.blocks);
    }
  };
  for (const section of lesson.sections ?? []) visit(section.blocks);
  return MACHINE_PREFS.filter((pref) => keys.has(pref.key));
}

/**
 * Page « Cours d'ISO » : catalogue (#/cours) et lecteur de leçon (#/cours/<id>).
 */
export function createCoursesPage({ progress, dictionaries, openExample, navigate }) {
  const inner = h('div', { class: 'courses-inner' });
  const page = h('section', { class: 'courses-page', 'aria-label': 'Cours d’ISO' }, inner);
  let currentId = '';
  // replaceChildren écrirait « null » pour les parties absentes : on les retire.
  const setContent = (...nodes) => inner.replaceChildren(...nodes.filter((node) => node != null));

  const ctx = () => ({ dictionary: dictionaries.default, dictionaries, prefs: progress.get().prefs, openExample });

  function prefsControl(prefs, { compact = false } = {}) {
    return h(
      'div',
      { class: `course-prefs${compact ? ' is-compact' : ''}` },
      prefs.map((pref) => {
        const name = domId('pref');
        return h(
          'div',
          { class: 'course-pref', dataset: { pref: pref.key } },
          h('p', { class: 'course-pref-label' }, pref.label),
          h(
            'div',
            { class: 'segmented', role: 'radiogroup', 'aria-label': pref.label },
            pref.options.map((option) =>
              h(
                'label',
                { class: 'segment' },
                h('input', { type: 'radio', name, value: option.value, checked: progress.pref(pref.key) === option.value, onchange: () => progress.setPref(pref.key, option.value) }),
                h('span', null, option.label),
              ),
            ),
          ),
          compact ? null : h('p', { class: 'setting-description' }, pref.help),
        );
      }),
    );
  }

  // ---- Catalogue -------------------------------------------------------------------------

  function renderCatalog() {
    const available = LESSONS.filter(isAvailable);
    const read = available.filter((lesson) => progress.status(lesson.id) === 'read').length;
    setContent(
      h('h1', { class: 'page-title' }, 'Cours d’ISO'),
      h(
        'p',
        { class: 'card-description' },
        'Des leçons courtes pour apprendre la programmation ISO en tournage, du premier bloc aux macros. Les exemples sont colorés comme dans l’éditeur : touchez un code pour sa définition, ou ouvrez l’exemple dans l’éditeur pour l’essayer.',
      ),
      h(
        'div',
        { class: 'course-progress', role: 'group', 'aria-label': 'Progression' },
        h('span', null, `${read} leçon${read > 1 ? 's' : ''} terminée${read > 1 ? 's' : ''} sur ${available.length}`),
        h('progress', { max: available.length, value: read, 'aria-hidden': 'true' }),
      ),
      ...LEVELS.map((level) =>
        h(
          'section',
          { class: 'course-level', dataset: { level: level.id } },
          h('h2', { class: 'course-level-title' }, level.title),
          h('p', { class: 'card-description' }, level.description),
          h('ol', { class: 'lesson-list' }, LESSONS.filter((lesson) => lesson.level === level.id).map(renderLessonCard)),
        ),
      ),
      h(
        'section',
        { class: 'card course-machine' },
        h('h2', { class: 'card-title' }, icon('machine'), 'Votre machine'),
        h('p', { class: 'card-description' }, 'Certaines explications dépendent de la machine. Indiquez la vôtre pour n’afficher que votre cas, ou gardez les deux versions.'),
        prefsControl(MACHINE_PREFS),
      ),
    );
  }

  function quizLabel(lesson) {
    if (!lesson.quiz?.length) return null;
    const best = progress.get().lessons[lesson.id]?.quiz;
    return h('span', { class: `lesson-quiz-label${best && best.best === best.total ? ' is-perfect' : ''}` }, best ? `Quiz : ${best.best}/${best.total}` : 'Quiz');
  }

  function renderLessonCard(lesson) {
    const ready = isAvailable(lesson);
    const status = ready ? progress.status(lesson.id) : 'soon';
    const body = [
      h('span', { class: 'lesson-number', 'aria-hidden': 'true' }, status === 'read' ? icon('check') : String(lesson.number)),
      h(
        'span',
        { class: 'lesson-text' },
        h('span', { class: 'lesson-title' }, `${lesson.number}. ${lesson.title}`),
        h('span', { class: 'lesson-summary' }, lesson.summary),
        h(
          'span',
          { class: 'lesson-meta' },
          ready
            ? [
                h('span', null, `${lesson.duration} min`),
                h('span', { class: `lesson-status is-${status}` }, STATUS_LABELS[status]),
                quizLabel(lesson),
              ]
            : h('span', { class: 'badge' }, 'en préparation'),
        ),
      ),
    ];
    return h(
      'li',
      { dataset: { lesson: lesson.id, status } },
      ready ? h('a', { class: 'lesson-card', href: `#/cours/${lesson.id}` }, body) : h('div', { class: 'lesson-card is-upcoming' }, body),
    );
  }

  // ---- Leçon -----------------------------------------------------------------------------

  function renderLesson(lesson) {
    const ready = LESSONS.filter(isAvailable);
    const index = ready.indexOf(lesson);
    const previous = ready[index - 1];
    const next = ready[index + 1];
    const level = LEVELS.find((l) => l.id === lesson.level);
    const prefs = usesPrefs(lesson);
    const read = progress.status(lesson.id) === 'read';
    const sections = lesson.sections.map((section) => ({ section, id: `cours-${lesson.id}-${section.id}` }));
    const quizId = `cours-${lesson.id}-quiz`;

    setContent(
      h('a', { class: 'course-back', href: '#/cours' }, icon('arrowLeft'), 'Tous les cours'),
      h(
        'header',
        { class: 'lesson-header' },
        h('p', { class: 'lesson-kicker' }, `Leçon ${lesson.number} · ${level?.title ?? ''} · ${lesson.duration} min`),
        h('h1', { class: 'page-title' }, lesson.title),
        h('p', { class: 'lesson-lead' }, lesson.summary),
      ),
      prefs.length ? h('section', { class: 'card course-machine is-inline', 'aria-label': 'Votre machine' }, h('p', { class: 'course-pref-intro' }, icon('machine'), 'Votre machine'), prefsControl(prefs, { compact: true })) : null,
      lesson.goals?.length
        ? h('section', { class: 'lesson-goals' }, h('h2', null, 'Dans cette leçon, vous allez apprendre à :'), h('ul', null, lesson.goals.map((goal) => h('li', null, renderInline(goal, ctx())))))
        : null,
      h(
        'nav',
        { class: 'lesson-toc', 'aria-label': 'Sommaire de la leçon' },
        h('p', null, 'Sommaire'),
        h(
          'ol',
          null,
          [...sections, ...(lesson.quiz?.length ? [{ section: { title: 'Quiz' }, id: quizId }] : [])].map(({ section, id }) =>
            h('li', null, h('button', { type: 'button', class: 'link-btn', onclick: () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, section.title)),
          ),
        ),
      ),
      ...sections.map(({ section, id }) =>
        h('section', { class: 'lesson-section', id, 'aria-labelledby': `${id}-title` }, h('h2', { id: `${id}-title` }, section.title), renderBlocks(section.blocks, ctx())),
      ),
      lesson.quiz?.length
        ? h(
            'section',
            { class: 'lesson-section lesson-quiz', id: quizId, 'aria-labelledby': `${quizId}-title` },
            h('h2', { id: `${quizId}-title` }, 'Quiz'),
            createQuiz({
              lesson,
              ctx: ctx(),
              best: progress.get().lessons[lesson.id]?.quiz,
              // Score enregistré sans redessiner la leçon (le résultat reste affiché).
              onComplete: (score, total) => quietly(() => progress.setQuiz(lesson.id, score, total)),
            }),
          )
        : null,
      h(
        'footer',
        { class: 'lesson-footer' },
        h(
          'button',
          {
            type: 'button',
            class: `btn ${read ? '' : 'btn-primary'}`,
            dataset: { action: 'toggle-read' },
            onclick: () => {
              progress.setRead(lesson.id, !read);
              if (!read && next) navigate(`/cours/${next.id}`);
            },
          },
          icon('check'),
          read ? 'Leçon terminée — marquer comme non lue' : next ? 'J’ai terminé, leçon suivante' : 'J’ai terminé cette leçon',
        ),
        h(
          'div',
          { class: 'lesson-nav' },
          previous ? h('a', { class: 'btn', href: `#/cours/${previous.id}`, rel: 'prev' }, icon('arrowLeft'), h('span', null, `${previous.number}. ${previous.title}`)) : h('span'),
          next ? h('a', { class: 'btn', href: `#/cours/${next.id}`, rel: 'next' }, h('span', null, `${next.number}. ${next.title}`), icon('arrowRight')) : null,
        ),
      ),
    );
  }

  function renderNotFound() {
    setContent(h('a', { class: 'course-back', href: '#/cours' }, icon('arrowLeft'), 'Tous les cours'), h('p', { class: 'card-description' }, 'Cette leçon n’existe pas ou n’est pas encore rédigée.'));
  }

  function render({ keepScroll = false } = {}) {
    hideDefinition();
    const top = page.scrollTop;
    const lesson = LESSONS.find((l) => l.id === currentId);
    if (!currentId) renderCatalog();
    else if (lesson && isAvailable(lesson)) renderLesson(lesson);
    else renderNotFound();
    page.dataset.view = currentId ? 'lesson' : 'catalog';
    page.scrollTop = keepScroll ? top : 0;
  }

  /** Affichage d'une route : '' (catalogue) ou l'identifiant d'une leçon. */
  page.show = (path) => {
    const id = path.split('/')[0] ?? '';
    if (id === currentId && inner.childElementCount) return;
    currentId = id;
    render();
    if (id && LESSONS.some((l) => l.id === id && isAvailable(l))) quietly(() => progress.markOpened(id));
  };

  let quiet = false;
  const quietly = (fn) => {
    quiet = true;
    try {
      fn();
    } finally {
      quiet = false;
    }
  };
  progress.onChange(() => {
    if (!quiet) render({ keepScroll: true });
  });
  return page;
}

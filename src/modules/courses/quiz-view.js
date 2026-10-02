import { h, domId } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { highlightCode } from '../../ui/code-view.js';
import { checkAnswer } from './quiz.js';
import { renderInline } from './render.js';

const TYPE_HINTS = {
  choice: (q) => ([q.answer].flat().length > 1 ? 'Plusieurs réponses possibles.' : 'Une seule réponse.'),
  block: () => 'Écrivez le bloc (l’ordre des mots et le numéro N n’ont pas d’importance).',
  number: (q) => (q.unit ? `Réponse en ${q.unit}.` : 'Réponse numérique.'),
  error: () => 'Touchez la ligne qui contient l’erreur.',
};

/**
 * Quiz de fin de leçon : chaque question est corrigée à la validation (bonne réponse et
 * explication), puis le score s'affiche ; le meilleur score est enregistré.
 */
export function createQuiz({ lesson, ctx: baseCtx, best, onComplete }) {
  const questions = lesson.quiz;
  const container = h('div', { class: 'quiz' });
  const summary = h('div', { class: 'quiz-summary', hidden: true, 'aria-live': 'polite' });
  let results = [];

  function start() {
    results = questions.map(() => null);
    summary.hidden = true;
    container.replaceChildren(
      h(
        'p',
        { class: 'card-description' },
        `${questions.length} questions, corrigées une par une.`,
        best ? ` Meilleur score : ${best.best}/${best.total}.` : '',
      ),
      ...questions.map((question, index) => renderQuestion(question, index)),
      summary,
    );
  }

  function finish() {
    const score = results.filter(Boolean).length;
    const total = questions.length;
    summary.hidden = false;
    summary.replaceChildren(
      h('p', { class: 'quiz-score' }, `Score : ${score} / ${total}`),
      h('p', null, score === total ? 'Parfait, tout est juste !' : score >= total * 0.6 ? 'Bien. Relisez les explications des questions manquées.' : 'Relisez la leçon, puis recommencez le quiz.'),
      h('button', { type: 'button', class: 'btn', dataset: { action: 'quiz-restart' }, onclick: start }, icon('undo'), 'Recommencer le quiz'),
    );
    onComplete(score, total);
  }

  function renderQuestion(question, index) {
    // `dictionary` sur une question : ses codes sont expliqués selon ce système (ex. 'bc').
    const own = question.dictionary && baseCtx.dictionaries?.[question.dictionary];
    const ctx = own ? { ...baseCtx, dictionary: own } : baseCtx;
    const id = domId('quiz');
    const feedback = h('div', { class: 'quiz-feedback', hidden: true, 'aria-live': 'polite' });
    let getResponse;
    let lock;
    let body;

    if (question.type === 'choice') {
      const multiple = [question.answer].flat().length > 1;
      const inputs = question.options.map((_, i) => h('input', { type: multiple ? 'checkbox' : 'radio', name: id, value: String(i) }));
      body = h('div', { class: 'quiz-options', role: multiple ? 'group' : 'radiogroup' }, question.options.map((option, i) => h('label', { class: 'quiz-option' }, inputs[i], h('span', null, renderInline(option, ctx)))));
      getResponse = () => {
        const checked = inputs.filter((input) => input.checked).map((input) => Number(input.value));
        return multiple ? checked : checked[0];
      };
      lock = (ok) => {
        const expected = new Set([question.answer].flat());
        inputs.forEach((input, i) => {
          input.disabled = true;
          const label = input.closest('.quiz-option');
          label.classList.toggle('is-answer', expected.has(i));
          label.classList.toggle('is-wrong', input.checked && !expected.has(i));
        });
        return ok;
      };
    } else if (question.type === 'block' || question.type === 'number') {
      const isBlock = question.type === 'block';
      const input = h('input', {
        class: `input${isBlock ? ' mono' : ''}`,
        id,
        autocomplete: 'off',
        spellcheck: 'false',
        autocapitalize: isBlock ? 'characters' : 'off',
        inputmode: isBlock ? 'text' : 'decimal',
        placeholder: isBlock ? 'G01 X… Z… F…' : '0',
        'aria-label': 'Votre réponse',
        onkeydown: (event) => {
          if (event.key === 'Enter') validate.click();
        },
      });
      body = h('div', { class: 'quiz-input' }, input, !isBlock && question.unit ? h('span', { class: 'quiz-unit' }, question.unit) : null);
      getResponse = () => (isBlock ? input.value.toUpperCase() : input.value);
      lock = (ok) => {
        input.readOnly = true;
        input.classList.add(ok ? 'is-ok' : 'is-ko');
        return ok;
      };
    } else if (question.type === 'error') {
      let chosen = null;
      const buttons = question.lines.map((line, i) =>
        h(
          'button',
          {
            type: 'button',
            class: 'quiz-line',
            'aria-pressed': 'false',
            onclick: () => {
              chosen = i;
              buttons.forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
            },
          },
          highlightCode(line, ctx.dictionary),
        ),
      );
      body = h('div', { class: 'quiz-lines' }, buttons);
      getResponse = () => chosen;
      lock = (ok) => {
        buttons.forEach((b, i) => {
          b.disabled = true;
          b.classList.toggle('is-answer', i === question.answer);
          b.classList.toggle('is-wrong', i === chosen && !ok);
        });
        return ok;
      };
    }

    const validate = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-primary btn-small',
        dataset: { action: 'quiz-check' },
        onclick: () => {
          const response = getResponse();
          if (response == null || response === '' || (Array.isArray(response) && !response.length)) {
            feedback.hidden = false;
            feedback.className = 'quiz-feedback is-hint';
            feedback.replaceChildren(h('p', null, 'Choisissez ou saisissez une réponse avant de valider.'));
            return;
          }
          const { ok, details = [] } = checkAnswer(question, response);
          lock(ok);
          validate.remove();
          results[index] = ok;
          feedback.hidden = false;
          feedback.className = `quiz-feedback ${ok ? 'is-ok' : 'is-ko'}`;
          feedback.replaceChildren(
            ...[
              h('p', { class: 'quiz-verdict' }, icon(ok ? 'check' : 'close'), ok ? 'Bonne réponse' : 'Pas tout à fait'),
              !ok && details.length ? h('ul', null, details.map((d) => h('li', null, d))) : null,
              !ok ? correctAnswer(question, ctx) : null,
              h('p', null, renderInline(question.explain, ctx)),
            ].filter(Boolean), // replaceChildren écrirait « null »
          );
          if (results.every((r) => r !== null)) finish();
        },
      },
      'Valider',
    );

    return h(
      'section',
      { class: 'quiz-question', dataset: { type: question.type, index: String(index) } },
      h('p', { class: 'quiz-number' }, `Question ${index + 1} / ${questions.length}`),
      h('p', { class: 'quiz-text' }, renderInline(question.question, ctx)),
      h('p', { class: 'quiz-hint' }, TYPE_HINTS[question.type](question)),
      body,
      h('div', { class: 'quiz-actions' }, validate),
      feedback,
    );
  }

  function correctAnswer(question, ctx) {
    if (question.type === 'block') return h('p', null, 'Réponse attendue : ', renderInline(`\`${[question.expect].flat()[0]}\``, ctx));
    if (question.type === 'number') return h('p', null, `Réponse attendue : ${question.answer.toLocaleString('fr-FR')}${question.unit ? ` ${question.unit}` : ''}`);
    return null;
  }

  start();
  return container;
}

// "Ask the Judge": searchable rules reference, available from Help and from Table Tracker.

import { html, setHtml, $, on } from './dom.js';
import { openModal } from './modal.js';
import { JUDGE_TOPICS, searchJudge } from '../data/judge.js';

export function openJudge({ query = '' } = {}) {
  let topic = '';
  openModal({
    title: 'Ask the Judge',
    size: 'wide',
    body: html`
      <div class="judge">
        <input class="input" id="judgeSearch" type="search" placeholder="Search the rules — try “commander tax” or “trample”" value="${query}" autocomplete="off">
        <div class="judge__topics" id="judgeTopics"></div>
        <div class="option-list" id="judgeResults"></div>
      </div>`,
    onMount(el) {
      const input = $('#judgeSearch', el);
      const draw = () => {
        setHtml($('#judgeTopics', el), html`
          <button type="button" class="chip ${topic === '' ? 'is-on' : ''}" data-topic="">All</button>
          ${JUDGE_TOPICS.map(t => html`<button type="button" class="chip ${topic === t ? 'is-on' : ''}" data-topic="${t}">${t}</button>`)}`);
        const rows = searchJudge(input.value, topic);
        setHtml($('#judgeResults', el), rows.length
          ? rows.map(r => html`<details class="judge__entry"><summary><small>${r.topic}</small>${r.question}</summary><p>${r.answer}</p></details>`)
          : html`<p class="muted">Nothing matches that search. Try a single keyword such as “stack” or “poison”.</p>`);
      };
      input.addEventListener('input', draw);
      on(el, 'click', '[data-topic]', (event, chip) => { topic = chip.dataset.topic; draw(); });
      draw();
    }
  });
}

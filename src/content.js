// Content script for SciRate listing pages: pulls in the remaining pages of
// the current date range, scores every paper and re-orders the list in place.
(async function () {
  'use strict';

  const X = globalThis.XiRate;
  const S = X.scirate;
  const list = S.paperList(document);
  if (!list || !S.paperElements(document).length) return;

  const MODES = [
    ['interest', 'Interests'],
    ['author', 'Authors'],
    ['scites', 'Scites'],
  ];

  let prefs = await X.loadPrefs();
  let compiled = X.compilePrefs(prefs);
  const signedIn = S.isSignedIn(document);
  const startPage = S.currentPage(location.href);
  const entries = S.paperElements(document).map((el, i) => makeEntry(el, (startPage - 1) * S.PER_PAGE + i));
  const toolbar = buildToolbar();
  list.parentNode.insertBefore(toolbar.el, list);

  render();
  X.onPrefsChanged((p) => {
    prefs = p;
    compiled = X.compilePrefs(p);
    render();
  });
  if (prefs.fetchAllPages) await loadOtherPages();

  function makeEntry(el, index) {
    return { el, index, paper: S.parsePaper(el), score: null };
  }

  async function loadOtherPages() {
    const last = Math.min(S.lastPage(document, location.href), Math.max(1, prefs.maxPages));
    const pages = [];
    for (let p = 1; p <= last; p++) if (p !== startPage) pages.push(p);
    if (!pages.length) return;

    let done = 0;
    const failed = [];
    setStatus(`Loading ${pages.length} more page${pages.length > 1 ? 's' : ''}…`);
    // Two at a time, to stay polite to SciRate.
    const queue = pages.slice();
    await Promise.all([worker(), worker()]);

    async function worker() {
      while (queue.length) {
        const page = queue.shift();
        try {
          const doc = await S.fetchPage(location.href, page);
          const scited = S.scitedByUid(doc);
          S.paperElements(doc).forEach((li, i) => {
            const node = document.importNode(li, true);
            adopt(node, scited);
            list.appendChild(node);
            entries.push(makeEntry(node, (page - 1) * S.PER_PAGE + i));
          });
        } catch (e) {
          failed.push(page);
        }
        done++;
        setStatus(`Loaded ${done}/${pages.length} extra pages…`);
      }
    }

    for (const nav of list.parentNode.querySelectorAll('.pagination')) nav.classList.add('xirate-hidden');
    window.dispatchEvent(new CustomEvent('xirate:typeset'));
    render();
    if (failed.length) setStatus(`${statusSummary()} Couldn't load page(s) ${failed.sort((a, b) => a - b).join(', ')}.`);
  }

  // Papers from fetched pages have no SciRate handlers, so wire scite buttons
  // ourselves. The POST itself runs in the page context (page-hook.js).
  function adopt(li, scited) {
    const toggle = li.querySelector('.scite-toggle');
    if (!toggle) return;
    const uid = toggle.getAttribute('data-paper-uid');
    if (scited[uid]) toggle.classList.add('active');
    toggle.addEventListener('click', (ev) => {
      const button = ev.target.closest('.scite, .unscite');
      if (!button) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (!signedIn) {
        location.href = '/login';
        return;
      }
      const action = button.classList.contains('unscite') ? 'unscite' : 'scite';
      applySciteUi(li, toggle, action);
      sendScite(uid, action).then((ok) => {
        if (!ok) {
          applySciteUi(li, toggle, action === 'scite' ? 'unscite' : 'scite');
          setStatus(`Couldn't ${action} ${uid}; SciRate rejected the request.`);
        }
      });
    });
  }

  function applySciteUi(li, toggle, action) {
    const count = toggle.querySelector('.scites-count .count');
    const n = parseInt(count && count.textContent, 10) || 0;
    const scite = action === 'scite';
    toggle.classList.toggle('active', scite);
    if (count) count.textContent = String(Math.max(0, n + (scite ? 1 : -1)));
    const abstract = li.querySelector('.abstract');
    if (abstract && scite) abstract.classList.remove('hidden', 'hideable');
  }

  let nextRequestId = 0;
  function sendScite(uid, action) {
    const requestId = ++nextRequestId;
    return new Promise((resolve) => {
      const onResult = (ev) => {
        const result = JSON.parse(ev.detail);
        if (result.requestId !== requestId) return;
        window.removeEventListener('xirate:scite-result', onResult);
        resolve(result.ok);
      };
      window.addEventListener('xirate:scite-result', onResult);
      window.dispatchEvent(new CustomEvent('xirate:scite', { detail: JSON.stringify({ uid, action, requestId }) }));
    });
  }

  function render() {
    const hasPrefs = compiled.interests.length > 0 || compiled.authors.length > 0;
    for (const e of entries) {
      e.paper.scites = parseInt(e.el.querySelector('.scites-count .count')?.textContent, 10) || 0;
      e.score = X.scorePaper(e.paper, compiled);
      annotate(e);
    }
    const frag = document.createDocumentFragment();
    for (const e of X.sortEntries(entries, prefs.sortMode)) frag.appendChild(e.el);
    list.prepend(frag);
    toolbar.update(hasPrefs);
    applyFilter(prefs.minScore[prefs.sortMode]);
  }

  // Show or hide papers against a threshold in the current mode's score, and
  // reflect it on the slider. Cheap, so it runs on every slider movement.
  function applyFilter(stored) {
    const range = X.thresholdRange(entries.map((e) => e.score), prefs.sortMode);
    const threshold = X.effectiveThreshold(stored, range);
    let hidden = 0;
    for (const e of entries) {
      const hide = !X.isShown(e.score, prefs.sortMode, threshold);
      e.el.classList.toggle('xirate-hidden', hide);
      if (hide) hidden++;
    }
    toolbar.setFilter(range, threshold, hidden);
  }

  function annotate(e) {
    e.el.querySelector('.xirate-badge')?.remove();
    const { interest, author, matchedTerms, matchedAuthors } = e.score;
    if (!matchedTerms.length && !matchedAuthors.length) return;
    const badge = document.createElement('div');
    badge.className = 'xirate-badge';
    if (matchedAuthors.length) {
      const span = document.createElement('span');
      span.className = 'xirate-badge-authors';
      span.textContent = matchedAuthors.join(', ');
      span.title = `Followed authors (score ${fmt(author)})`;
      badge.appendChild(span);
    }
    if (matchedTerms.length) {
      const span = document.createElement('span');
      span.className = 'xirate-badge-terms' + (interest < 0 ? ' xirate-negative' : '');
      span.textContent = `${fmt(interest)} · ${matchedTerms.join(', ')}`;
      span.title = 'Interest score and matched terms';
      badge.appendChild(span);
    }
    const title = e.el.querySelector('.title');
    if (title) title.after(badge);
  }

  function fmt(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function statusSummary() {
    const matches = entries.filter((e) => X.isMatch(e.score)).length;
    return `${entries.length} papers, ${matches} matching your interests or authors.`;
  }

  function setStatus(msg) {
    toolbar.status.textContent = msg;
  }

  function buildToolbar() {
    const el = document.createElement('div');
    el.className = 'xirate-toolbar';

    const label = document.createElement('span');
    label.className = 'xirate-label';
    label.textContent = 'ξ-rate sort:';
    el.appendChild(label);

    const group = document.createElement('div');
    group.className = 'btn-group xirate-modes';
    const buttons = MODES.map(([mode, name]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-default btn-sm';
      b.textContent = name;
      b.addEventListener('click', () => {
        prefs.sortMode = mode;
        render();
        X.savePrefs({ sortMode: mode });
      });
      group.appendChild(b);
      return [mode, b];
    });
    el.appendChild(group);

    const filterLabel = document.createElement('label');
    filterLabel.className = 'xirate-filter';
    const slider = document.createElement('input');
    slider.type = 'range';
    const filterText = document.createElement('span');
    filterText.className = 'xirate-filter-text';
    // Filter live while dragging; save once on release (storage.sync has a write quota).
    const sliderValue = () => {
      const v = parseFloat(slider.value);
      return v <= parseFloat(slider.min) ? null : v;
    };
    slider.addEventListener('input', () => applyFilter(sliderValue()));
    slider.addEventListener('change', () => {
      const minScore = { ...prefs.minScore, [prefs.sortMode]: sliderValue() };
      prefs.minScore = minScore;
      X.savePrefs({ minScore });
    });
    filterLabel.append('hide below ', slider, filterText);
    el.appendChild(filterLabel);

    const edit = document.createElement('a');
    edit.href = '#';
    edit.className = 'xirate-edit';
    edit.textContent = 'edit interests';
    edit.addEventListener('click', (ev) => {
      ev.preventDefault();
      chrome.runtime.sendMessage({ type: 'openOptions' });
    });
    el.appendChild(edit);

    const status = document.createElement('div');
    status.className = 'xirate-status';
    el.appendChild(status);

    return {
      el,
      status,
      update(hasPrefs) {
        for (const [mode, b] of buttons) b.classList.toggle('btn-primary', mode === prefs.sortMode);
        status.textContent = hasPrefs
          ? statusSummary()
          : 'No interests or authors set yet; use "edit interests" to add them.';
      },
      setFilter(range, threshold, hidden) {
        slider.min = range.min;
        slider.max = range.max;
        slider.step = range.step;
        slider.value = threshold == null ? range.min : threshold;
        slider.disabled = range.max <= range.min;
        filterLabel.classList.toggle('xirate-disabled', slider.disabled);
        const unit = { interest: 'interest score', author: 'author score', scites: 'scites' }[prefs.sortMode];
        filterLabel.title = `Hide papers whose ${unit} is below the slider value`;
        filterText.textContent = threshold == null ? ' off' : ` ${fmt(threshold)} (${hidden} hidden)`;
      },
    };
  }
})();

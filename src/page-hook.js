// Runs in SciRate's own page context (a "MAIN" world content script), where
// the page's CSRF token and MathJax live. content.js talks to it
// with CustomEvents whose detail is a JSON string (cross-browser safe).
(function () {
  'use strict';

  function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : '';
  }

  function post(path) {
    return fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrfToken(), 'X-Requested-With': 'XMLHttpRequest' },
    }).then((res) => res.ok);
  }

  window.addEventListener('xirate:scite', (ev) => {
    const { uid, action, requestId } = JSON.parse(ev.detail);
    const path = action === 'unscite' ? '/api/unscite/' : '/api/scite/';
    post(path + encodeURIComponent(uid))
      .catch(() => false)
      .then((ok) => {
        window.dispatchEvent(new CustomEvent('xirate:scite-result', { detail: JSON.stringify({ requestId, ok }) }));
      });
  });

  // Papers pulled in from later pages arrive with raw TeX.
  window.addEventListener('xirate:typeset', () => {
    if (window.MathJax && window.MathJax.Hub) {
      window.MathJax.Hub.Queue(['Typeset', window.MathJax.Hub, document.querySelector('.paperlist ul.papers')]);
    }
  });
})();

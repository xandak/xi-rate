// Reading SciRate's markup (app/views/papers/_paper.html.slim and
// feeds/show.html.slim in github.com/scirate/scirate). Selectors live here
// so a SciRate redesign only needs changes in this file.
(function (root) {
  'use strict';

  const PER_PAGE = 50;

  function paperList(doc) {
    return doc.querySelector('.paperlist ul.papers');
  }

  function paperElements(doc) {
    const list = paperList(doc);
    return list ? Array.from(list.querySelectorAll(':scope > li.paper')) : [];
  }

  function parsePaper(li) {
    const toggle = li.querySelector('.scite-toggle');
    const authorLinks = li.querySelectorAll('.authors a[href*="au:"]');
    return {
      uid: toggle ? toggle.getAttribute('data-paper-uid') : '',
      title: text(li.querySelector('.title a')),
      abstract: text(li.querySelector('.abstract')),
      authors: Array.from(authorLinks, (a) => text(a).replace(/,\s*$/, '')),
      scites: parseInt(text(li.querySelector('.scites-count .count')), 10) || 0,
    };
  }

  function text(el) {
    return el ? el.textContent.trim() : '';
  }

  // The layout embeds `SciRate.scited_by_uid = {...};` in an inline script.
  function scitedByUid(doc) {
    for (const script of doc.querySelectorAll('script:not([src])')) {
      const m = script.textContent.match(/SciRate\.scited_by_uid\s*=\s*(\{.*?\}|null);/s);
      if (m) {
        try { return JSON.parse(m[1]) || {}; } catch (e) { return {}; }
      }
    }
    return {};
  }

  function isSignedIn(doc) {
    for (const script of doc.querySelectorAll('script:not([src])')) {
      const m = script.textContent.match(/SciRate\.current_user\s*=\s*(false|null)?/);
      if (m) return !m[1];
    }
    return false;
  }

  function currentPage(url) {
    return Math.max(1, parseInt(new URL(url).searchParams.get('page'), 10) || 1);
  }

  // will_paginate links carry ?page=N; the largest N is the last page.
  function lastPage(doc, url) {
    let max = currentPage(url);
    for (const a of doc.querySelectorAll('.pagination a[href]')) {
      const n = parseInt(new URL(a.getAttribute('href'), url).searchParams.get('page'), 10);
      if (n > max) max = n;
    }
    return max;
  }

  function pageUrl(url, page) {
    const u = new URL(url);
    u.searchParams.set('page', String(page));
    return u.toString();
  }

  async function fetchPage(url, page) {
    // Firefox's content.fetch runs as the page, so SciRate sees an ordinary same-origin request.
    const pageFetch = globalThis.content && globalThis.content.fetch ? globalThis.content.fetch.bind(globalThis.content) : fetch;
    const res = await pageFetch(pageUrl(url, page), { credentials: 'include' });
    if (!res.ok) throw new Error(`SciRate page ${page}: HTTP ${res.status}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  root.XiRate = Object.assign(root.XiRate || {}, {
    scirate: { PER_PAGE, paperList, paperElements, parsePaper, scitedByUid, isSignedIn, currentPage, lastPage, fetchPage },
  });
})(globalThis);

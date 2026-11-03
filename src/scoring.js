// Pure scoring and sorting logic. No DOM or extension APIs, so it can be
// tested in a plain page (tests/test.html). Exposed as the XiRate global.
(function (root) {
  'use strict';

  const TITLE_WEIGHT = 3;
  const MAX_ABSTRACT_HITS = 3;

  // Lowercase, strip accents and LaTeX punctuation, collapse to single spaces.
  function normalize(text) {
    return (text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\\[a-z]+/g, ' ')
      .replace(/[^a-z0-9*]+/g, ' ')
      .trim();
  }

  // Parse "entry" or "entry : weight" lines. Blank lines and # comments are skipped.
  function parseWeightedLines(text) {
    const entries = [];
    for (const raw of (text || '').split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, '').trim();
      if (!line) continue;
      const m = line.match(/^(.*?)\s*:\s*(-?\d+(?:\.\d+)?)$/);
      const label = (m ? m[1] : line).trim();
      const weight = m ? parseFloat(m[2]) : 1;
      if (label && weight !== 0) entries.push({ label, weight });
    }
    return entries;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // A term matches at word boundaries and tolerates a plural ending.
  // A trailing * makes it a prefix match ("entangle*").
  function compileInterests(text) {
    return parseWeightedLines(text).map(({ label, weight }) => {
      const prefix = label.endsWith('*');
      const words = normalize(label.replace(/\*+$/, '')).replace(/\*/g, '').split(' ').filter(Boolean);
      if (!words.length) return null;
      const body = words.map(escapeRegExp).join(' ');
      const tail = prefix ? '[a-z0-9]*' : '(?:s|es)?';
      return { label, weight, regex: new RegExp(`(?:^| )${body}${tail}(?= |$)`, 'g') };
    }).filter(Boolean);
  }

  // "Last, First" or "First Middle Last". Returns surname tokens and first initial.
  function parseAuthorName(name) {
    let first = '';
    let last = name;
    if (name.includes(',')) {
      [last, first] = name.split(',', 2);
    } else {
      const parts = name.trim().split(/\s+/);
      last = parts.pop();
      first = parts.join(' ');
    }
    const firstTokens = normalize(first).split(' ').filter(Boolean);
    return {
      surname: normalize(last).split(' ').filter(Boolean),
      initial: firstTokens.length ? firstTokens[0][0] : '',
    };
  }

  function compileAuthors(text) {
    return parseWeightedLines(text).map(({ label, weight }) => {
      const parsed = parseAuthorName(label);
      return parsed.surname.length ? { label, weight, ...parsed } : null;
    }).filter(Boolean);
  }

  // A paper author such as "John P. Preskill" matches "Preskill, John" or "J Preskill".
  function authorMatches(paperAuthor, followed) {
    const tokens = normalize(paperAuthor).split(' ').filter(Boolean);
    const n = followed.surname.length;
    if (tokens.length < n) return false;
    const tail = tokens.slice(tokens.length - n);
    if (tail.join(' ') !== followed.surname.join(' ')) return false;
    if (!followed.initial) return true;
    const given = tokens.slice(0, tokens.length - n);
    return given.length === 0 || given[0][0] === followed.initial;
  }

  function countMatches(regex, text) {
    regex.lastIndex = 0;
    let count = 0;
    while (regex.exec(text)) count++;
    return count;
  }

  // paper: { title, abstract, authors: [string], scites: number }
  function scorePaper(paper, compiled) {
    const title = normalize(paper.title);
    const abstract = normalize(paper.abstract);
    let interest = 0;
    const matchedTerms = [];
    for (const term of compiled.interests) {
      const inTitle = countMatches(term.regex, title) > 0;
      const absHits = Math.min(countMatches(term.regex, abstract), MAX_ABSTRACT_HITS);
      if (!inTitle && !absHits) continue;
      interest += term.weight * ((inTitle ? TITLE_WEIGHT : 0) + absHits);
      matchedTerms.push(term.label);
    }
    let author = 0;
    const matchedAuthors = [];
    for (const followed of compiled.authors) {
      if (paper.authors.some((a) => authorMatches(a, followed))) {
        author += followed.weight;
        matchedAuthors.push(followed.label);
      }
    }
    return { interest, author, scites: paper.scites || 0, matchedTerms, matchedAuthors };
  }

  // Comparators per sort mode; ties fall through to the next key, then to
  // SciRate's original order (index), which is already scites-descending.
  const SORT_KEYS = {
    interest: ['interest', 'author', 'scites'],
    author: ['author', 'interest', 'scites'],
    scites: ['scites'],
  };

  function sortEntries(entries, mode) {
    const keys = SORT_KEYS[mode] || SORT_KEYS.scites;
    return entries.slice().sort((a, b) => {
      for (const k of keys) {
        const d = b.score[k] - a.score[k];
        if (d) return d;
      }
      return a.index - b.index;
    });
  }

  function isMatch(score) {
    return score.interest > 0 || score.author > 0;
  }

  function compilePrefs(prefs) {
    return {
      interests: compileInterests(prefs.interestsText),
      authors: compileAuthors(prefs.authorsText),
    };
  }

  root.XiRate = Object.assign(root.XiRate || {}, {
    normalize,
    parseWeightedLines,
    compileInterests,
    compileAuthors,
    compilePrefs,
    parseAuthorName,
    authorMatches,
    scorePaper,
    sortEntries,
    isMatch,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

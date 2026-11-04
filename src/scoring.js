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

  // --- Author names -------------------------------------------------------
  //
  // Given names are split into groups (space-separated words) of parts
  // (hyphen- or dot-separated pieces), so "Seok-Hyung", "S.-H.", "S-H.",
  // "S.H." and "SH" all become the parts [seok, hyung] or [s, h]. A
  // followed author's first given name (one group, all of its parts) must be
  // present in the paper's name: each part spelled out or as its initial, or
  // run together ("Seokhyung"). So "Lee, Seok-Hyung" matches "S.-H. Lee" and
  // "Seokhyung Lee" but not "Seung-Woo Lee", "S.-W. Lee" or a bare "S. Lee".
  // Middle names may be left out on either side, but where both give one
  // they must agree. Surnames must match exactly (accents and case ignored).

  const SURNAME_PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'della', 'dos', 'ter', 'ten']);
  const SUFFIX = /,?\s+(?:jr|sr|ii|iii|iv)\.?$/i;

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // One raw given-name word to its lowercase parts. A short all-caps word
  // such as "SH" or "JP" is a run of initials.
  function givenParts(word) {
    const w = stripAccents(word);
    if (/^[A-Z]{2,3}$/.test(w)) return w.toLowerCase().split('');
    return w.toLowerCase().split(/[.\-‐-―]+/).map((p) => p.replace(/[^a-z]/g, '')).filter(Boolean);
  }

  function givenGroups(text) {
    return (text || '').trim().split(/\s+/).map(givenParts).filter((g) => g.length);
  }

  // "Last, First" or "First Middle Last" (with lowercase particles such as
  // "van den" kept in the surname). Returns normalized surname tokens and
  // given-name groups.
  function parseAuthorName(name) {
    name = name.trim().replace(SUFFIX, '');
    let first = '';
    let last = name;
    if (name.includes(',')) {
      [last, first] = name.split(',', 2);
    } else {
      const words = name.split(/\s+/);
      let i = words.length - 1;
      while (i > 1 && SURNAME_PARTICLES.has(words[i - 1].toLowerCase())) i--;
      last = words.slice(i).join(' ');
      first = words.slice(0, i).join(' ');
    }
    return { surname: normalize(last).split(' ').filter(Boolean), given: givenGroups(first) };
  }

  function compileAuthors(text) {
    return parseWeightedLines(text).map(({ label, weight }) => {
      const parsed = parseAuthorName(label);
      return parsed.surname.length ? { label, weight, ...parsed } : null;
    }).filter(Boolean);
  }

  // Two name parts agree if equal, or if either is an initial of the other.
  function partAgrees(q, p) {
    return q.length === 1 || p.length === 1 ? q[0] === p[0] : q === p;
  }

  // Consume all of `want` (a followed author's first given name) from the
  // start of `have` (the paper's given-name parts). Returns the index in
  // `have` just past it, or -1.
  function consumeFirstName(have, want) {
    let i = 0;
    let j = 0;
    outer: while (j < want.length) {
      if (i >= have.length) return -1;
      const q = have[i];
      const p = want[j];
      if (partAgrees(q, p)) { i++; j++; continue; }
      // Paper runs the parts together: "Seokhyung" for "Seok-Hyung".
      for (let k = j + 1, s = p; k < want.length; k++) {
        s += want[k];
        if (s === q) { i++; j = k + 1; continue outer; }
        if (!q.startsWith(s)) break;
      }
      // Paper splits what the followed entry runs together: "Seok-Hyung" for "Seokhyung".
      for (let k = i + 1, s = q; k < have.length; k++) {
        s += have[k];
        if (s === p) { i = k + 1; j++; continue outer; }
        if (!p.startsWith(s)) break;
      }
      // Short form of a single-part first name: "Ben" for "Benjamin".
      if (want.length === 1 && q.length >= 3 && p.startsWith(q)) { i++; j++; continue; }
      return -1;
    }
    return i;
  }

  function givenMatches(have, groups) {
    if (!groups.length || !have.length) return true;
    const [firstName, ...rest] = groups;
    const end = consumeFirstName(have, firstName);
    if (end >= 0) {
      const middle = rest.flat();
      const paperMiddle = have.slice(end);
      const n = Math.min(middle.length, paperMiddle.length);
      for (let k = 0; k < n; k++) if (!partAgrees(paperMiddle[k], middle[k])) return false;
      return true;
    }
    // "Smith, W. Clarke" may publish as "Clarke Smith".
    return firstName.length === 1 && firstName[0].length === 1 && rest.length > 0 && givenMatches(have, rest);
  }

  // Does a paper author string such as "Seok-Hyung Lee" or "S.-H. Lee" name
  // the followed author?
  function authorMatches(paperAuthor, followed) {
    let raw = paperAuthor.trim().replace(SUFFIX, '');
    if (raw.includes(',')) {
      const [last, first] = raw.split(',', 2);
      raw = `${first} ${last}`;
    }
    // Take words off the end until they make up the followed surname.
    const words = raw.split(/\s+/).filter(Boolean);
    const want = followed.surname.join(' ');
    let i = words.length;
    let tail = [];
    while (i > 0 && tail.length < followed.surname.length) {
      tail = normalize(words.slice(--i).join(' ')).split(' ').filter(Boolean);
    }
    if (tail.join(' ') !== want) return false;
    const have = words.slice(0, i).flatMap(givenParts);
    return givenMatches(have, followed.given);
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

  // The score a mode sorts by first; the toolbar slider filters on it, so
  // hiding papers below a threshold trims the tail of the sorted list.
  function primaryScore(score, mode) {
    return score[(SORT_KEYS[mode] || SORT_KEYS.scites)[0]];
  }

  // Slider bounds for a mode, on a grid of `step`. The lower end shows
  // everything (it is never above 0 or the lowest score); the upper end is
  // at most the highest score, so the top paper always stays visible.
  function thresholdRange(scores, mode) {
    const step = mode === 'scites' ? 1 : 0.5;
    const values = scores.map((s) => primaryScore(s, mode));
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    return { min: Math.floor(lo / step) * step, max: Math.floor(hi / step) * step, step };
  }

  // A stored threshold of null (or anything at or below the range's lower
  // end) hides nothing; one above the upper end is treated as the upper end.
  function effectiveThreshold(stored, range) {
    if (stored == null || stored <= range.min) return null;
    return Math.min(stored, range.max);
  }

  function isShown(score, mode, threshold) {
    return threshold == null || primaryScore(score, mode) >= threshold;
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
    primaryScore,
    thresholdRange,
    effectiveThreshold,
    isShown,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);

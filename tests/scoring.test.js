const X = globalThis.XiRate;

function paper(overrides) {
  return { title: '', abstract: '', authors: [], scites: 0, ...overrides };
}

test('normalize strips case, accents and LaTeX', () => {
  assertEqual(X.normalize('Brandão'), 'brandao');
  assertEqual(X.normalize('$\\mathbb{Z}_2$ Toric-Code'), 'z 2 toric code');
});

test('parseWeightedLines reads weights, skips blanks and comments', () => {
  assertEqual(X.parseWeightedLines('a\n\n# note\nb c : 2\nd: -1.5\ne : 0'), [
    { label: 'a', weight: 1 },
    { label: 'b c', weight: 2 },
    { label: 'd', weight: -1.5 },
  ]);
});

test('interest terms match whole words and plurals only', () => {
  const [term] = X.compileInterests('qubit');
  const s = (t) => X.scorePaper(paper({ title: t }), { interests: [term], authors: [] }).interest;
  assertEqual(s('Many qubits'), 3);
  assertEqual(s('A qubit'), 3);
  assertEqual(s('Qubitization methods'), 0);
});

test('trailing * makes a prefix match', () => {
  const compiled = { interests: X.compileInterests('entangle*'), authors: [] };
  assertEqual(X.scorePaper(paper({ title: 'Entanglement witnesses' }), compiled).interest, 3);
});

test('phrases match across hyphens and LaTeX', () => {
  const compiled = { interests: X.compileInterests('quantum error correction'), authors: [] };
  assertEqual(X.scorePaper(paper({ abstract: 'quantum-error correction' }), compiled).interest, 1);
});

test('title counts 3x weight, abstract hits capped at 3', () => {
  const compiled = { interests: X.compileInterests('surface code : 2'), authors: [] };
  const p = paper({ title: 'Surface codes', abstract: 'surface code '.repeat(5) });
  const score = X.scorePaper(p, compiled);
  assertEqual(score.interest, 2 * (3 + 3));
  assertEqual(score.matchedTerms, ['surface code']);
});

test('negative weights push papers down', () => {
  const compiled = { interests: X.compileInterests('cosmology : -2'), authors: [] };
  assertEqual(X.scorePaper(paper({ title: 'Cosmology' }), compiled).interest, -6);
});

test('author matching handles initials, comma form and accents', () => {
  const [preskill, brandao, vdb] = X.compileAuthors('John Preskill\nBrandão, Fernando\nvan den Berg, Ewout');
  assert(X.authorMatches('John P. Preskill', preskill));
  assert(X.authorMatches('J. Preskill', preskill));
  assert(!X.authorMatches('Mary Preskill', preskill), 'different initial');
  assert(!X.authorMatches('John Preskillson', preskill), 'different surname');
  assert(X.authorMatches('Fernando G. S. L. Brandao', brandao));
  assert(X.authorMatches('Ewout van den Berg', vdb));
  assert(!X.authorMatches('Ewout Berg', vdb), 'partial compound surname');
});

test('surname-only entries match any first name', () => {
  const [a] = X.compileAuthors('Terhal');
  assert(X.authorMatches('Barbara M. Terhal', a));
});

test('starter lists in profile/ parse and match as intended', async () => {
  const read = async (f) => (await fetch(`../profile/${f}`)).text();
  const compiled = X.compilePrefs({ interestsText: await read('interests.txt'), authorsText: await read('authors.txt') });
  assert(compiled.interests.length >= 30, `only ${compiled.interests.length} interests`);
  assert(compiled.authors.length >= 25, `only ${compiled.authors.length} authors`);
  const p = paper({
    title: 'Fault-tolerant non-Clifford GKP gates',
    abstract: 'We study Gottesman-Kitaev-Preskill codes on qLDPC architectures.',
    authors: ['Xanda C. Kolesnikow', 'Nouédyn Baspin', 'W. Clarke Smith'],
  });
  const score = X.scorePaper(p, compiled);
  assertEqual(score.matchedAuthors, ['Kolesnikow, Xanda', 'Baspin, Nouedyn', 'Smith, W. Clarke']);
  for (const t of ['fault-tolerant', 'non-Clifford', 'GKP', 'Gottesman-Kitaev-Preskill', 'qLDPC']) {
    assert(score.matchedTerms.includes(t), `missing ${t}`);
  }
  assert(!score.matchedTerms.includes('LDPC'), 'LDPC should not match inside qLDPC');
});

test('sortEntries orders by mode with tie-breaks and original order', () => {
  const e = (index, interest, author, scites) => ({ index, score: { interest, author, scites } });
  const entries = [e(0, 0, 0, 9), e(1, 5, 0, 1), e(2, 5, 1, 0), e(3, 0, 2, 3), e(4, 0, 0, 9)];
  const ids = (mode) => X.sortEntries(entries, mode).map((x) => x.index);
  assertEqual(ids('interest'), [2, 1, 3, 0, 4]);
  assertEqual(ids('author'), [3, 2, 1, 0, 4]);
  assertEqual(ids('scites'), [0, 4, 3, 1, 2]);
});

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

test('hyphenated given names match in all their usual spellings', () => {
  const [lee] = X.compileAuthors('Lee, Seok-Hyung');
  for (const name of ['Seok-Hyung Lee', 'Seok-hyung Lee', 'Seokhyung Lee', 'Seok Hyung Lee', 'S.-H. Lee',
    'S-H Lee', 'S-H. Lee', 'S.H. Lee', 'S. H. Lee', 'SH Lee', 'Seok H. Lee', 'Lee, Seok-Hyung', 'Lee, S.-H.']) {
    assert(X.authorMatches(name, lee), name);
  }
  for (const name of ['Seung-Woo Lee', 'S.-W. Lee', 'SW Lee', 'S. Lee', 'Seok Lee', 'Jaehak Lee', 'Seok-Hyung Leem']) {
    assert(!X.authorMatches(name, lee), name);
  }
  const [run] = X.compileAuthors('Seokhyung Lee');
  assert(X.authorMatches('Seok-Hyung Lee', run), 'entry written without hyphen');
  const [ini] = X.compileAuthors('S.-H. Lee');
  assert(X.authorMatches('Seok-Hyung Lee', ini), 'entry written as initials');
  assert(!X.authorMatches('Seung-Woo Lee', ini), 'initials entry, other person');
});

test('the 2610.38914 author list does not match Seok-Hyung Lee', () => {
  const compiled = { interests: [], authors: X.compileAuthors('Lee, Seok-Hyung') };
  const p = paper({ authors: ['Seong-Yeop Lim', 'Jaehak Lee', 'Nuri Kang', 'Seung-Woo Lee'] });
  assertEqual(X.scorePaper(p, compiled).matchedAuthors, []);
});

test('middle names may be omitted but must agree when given', () => {
  const [smith] = X.compileAuthors('Smith, W. Clarke');
  assert(X.authorMatches('W. Clarke Smith', smith));
  assert(X.authorMatches('W. C. Smith', smith));
  assert(X.authorMatches('William Smith', smith));
  assert(X.authorMatches('Clarke Smith', smith), 'goes by middle name');
  assert(!X.authorMatches('W. J. Smith', smith), 'different middle initial');
  const [brown] = X.compileAuthors('Brown, Benjamin');
  assert(X.authorMatches('Benjamin J. Brown', brown));
  assert(X.authorMatches('Ben Brown', brown), 'short form');
  const [albert] = X.compileAuthors('Albert, Victor');
  assert(X.authorMatches('Victor V. Albert', albert));
  assert(!X.authorMatches('Victoria Albert', albert), 'longer name is a different person');
});

test('First Last entries keep surname particles and paper names drop suffixes', () => {
  const [vdb] = X.compileAuthors('Ewout van den Berg');
  assertEqual(vdb.surname, ['van', 'den', 'berg']);
  assert(X.authorMatches('E. van den Berg', vdb));
  const [p] = X.compileAuthors('John Preskill');
  assert(X.authorMatches('John Preskill Jr.', p));
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

test('thresholdRange spans 0 or the lowest score up to the highest, on the step grid', () => {
  const s = (interest, author, scites) => ({ interest, author, scites });
  const scores = [s(-6, 0, 3), s(0, 2, 40), s(13.7, 1.5, 0)];
  assertEqual(X.thresholdRange(scores, 'interest'), { min: -6, max: 13.5, step: 0.5 });
  assertEqual(X.thresholdRange(scores, 'author'), { min: 0, max: 2, step: 0.5 });
  assertEqual(X.thresholdRange(scores, 'scites'), { min: 0, max: 40, step: 1 });
  assertEqual(X.thresholdRange([], 'interest'), { min: 0, max: 0, step: 0.5 });
});

test('effectiveThreshold treats the lower end as off and clamps to the upper end', () => {
  const range = { min: -6, max: 13.5, step: 0.5 };
  assertEqual(X.effectiveThreshold(null, range), null);
  assertEqual(X.effectiveThreshold(-6, range), null);
  assertEqual(X.effectiveThreshold(4, range), 4);
  assertEqual(X.effectiveThreshold(20, range), 13.5);
});

test('isShown filters on the current mode\'s primary score', () => {
  const score = { interest: 3, author: 0, scites: 12 };
  assert(X.isShown(score, 'interest', null));
  assert(X.isShown(score, 'interest', 3));
  assert(!X.isShown(score, 'interest', 3.5));
  assert(!X.isShown(score, 'author', 0.5));
  assert(X.isShown(score, 'scites', 12));
  assert(!X.isShown(score, 'scites', 13));
});

test('sortEntries orders by mode with tie-breaks and original order', () => {
  const e = (index, interest, author, scites) => ({ index, score: { interest, author, scites } });
  const entries = [e(0, 0, 0, 9), e(1, 5, 0, 1), e(2, 5, 1, 0), e(3, 0, 2, 3), e(4, 0, 0, 9)];
  const ids = (mode) => X.sortEntries(entries, mode).map((x) => x.index);
  assertEqual(ids('interest'), [2, 1, 3, 0, 4]);
  assertEqual(ids('author'), [3, 2, 1, 0, 4]);
  assertEqual(ids('scites'), [0, 4, 3, 1, 2]);
});

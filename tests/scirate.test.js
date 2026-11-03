// Fixture mirrors the markup rendered by SciRate's feeds/show.html.slim and
// papers/_paper.html.slim.
const S = globalThis.XiRate.scirate;

const FIXTURE = `<!doctype html><html><head>
<meta name="csrf-token" content="tok">
</head><body>
<div class="paperlist"><ul class="papers">
  <li class="paper tex2jax"><div class="row"><div class="col-md-8">
    <div class="title"><a href="/arxiv/2611.00001">Fault-tolerant $\\mathbb{Z}_2$ codes</a></div>
    <div class="authors">
      <a href="/search?q=au:Preskill_J+in:quant-ph">John Preskill,</a>
      <a href="/search?q=au:Terhal_B+in:quant-ph">Barbara M. Terhal </a>
    </div>
    <div class="uid">Nov 02 2026 <a href="/arxiv/quant-ph">quant-ph</a> arXiv:2611.00001v1</div>
  </div><div class="col-md-4"><div class="pull-right">
    <div class="scite-toggle" data-paper-uid="2611.00001">
      <button class="btn unscite btn-success">Scited</button>
      <button class="btn btn-default scite">Scite!</button>
      <div class="scites-count"><a href="/arxiv/2611.00001/scites"><button class="btn btn-default count">12</button></a></div>
    </div>
  </div></div></div>
  <div class="abstract">We study codes.</div></li>
  <li class="paper tex2jax"><div class="row"><div class="col-md-8">
    <div class="title"><a href="/arxiv/2611.00002">Another paper</a></div>
    <div class="authors">
      <a href="/search?q=au:Doe_J+in:quant-ph">Jane Doe </a>
      <a href="/arxiv/2611.00002">et al (3)</a>
    </div>
  </div><div class="col-md-4"><div class="pull-right">
    <div class="scite-toggle" data-paper-uid="2611.00002">
      <div class="scites-count"><a><button class="btn btn-default count">0</button></a></div>
    </div>
  </div></div></div>
  <div class="abstract hidden hideable">Hidden abstract.</div></li>
  <div class="pagination">
    <a href="/arxiv/quant-ph?range=1&amp;page=2">2</a>
    <a href="/arxiv/quant-ph?range=1&amp;page=4">4</a>
    <a class="next_page" href="/arxiv/quant-ph?range=1&amp;page=2">Next</a>
  </div>
</ul></div>
<script>
  SciRate.current_user = {"id":1,"expand_abstracts":false};
  SciRate.scited_by_uid = {"2611.00001":true};
</script>
</body></html>`;

function fixture() {
  return new DOMParser().parseFromString(FIXTURE, 'text/html');
}

test('parsePaper extracts uid, title, authors, abstract and scites', () => {
  const [first, second] = S.paperElements(fixture()).map(S.parsePaper);
  assertEqual(first.uid, '2611.00001');
  assertEqual(first.title, 'Fault-tolerant $\\mathbb{Z}_2$ codes');
  assertEqual(first.authors, ['John Preskill', 'Barbara M. Terhal']);
  assertEqual(first.abstract, 'We study codes.');
  assertEqual(first.scites, 12);
  assertEqual(second.authors, ['Jane Doe'], 'et al link is not an author');
  assertEqual(second.scites, 0);
});

test('scitedByUid and isSignedIn read the inline SciRate script', () => {
  const doc = fixture();
  assertEqual(S.scitedByUid(doc), { '2611.00001': true });
  assert(S.isSignedIn(doc));
  const out = new DOMParser().parseFromString('<script>SciRate.current_user = false;\nSciRate.scited_by_uid = null;</script>', 'text/html');
  assert(!S.isSignedIn(out));
  assertEqual(S.scitedByUid(out), {});
});

test('lastPage reads will_paginate links; currentPage reads the URL', () => {
  const url = 'https://scirate.com/arxiv/quant-ph?range=1';
  assertEqual(S.lastPage(fixture(), url), 4);
  assertEqual(S.currentPage(url), 1);
  assertEqual(S.currentPage(url + '&page=3'), 3);
});

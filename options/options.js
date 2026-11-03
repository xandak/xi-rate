(async function () {
  'use strict';

  const X = globalThis.XiRate;
  const $ = (id) => document.getElementById(id);
  const prefs = await X.loadPrefs();

  $('interests').value = prefs.interestsText;
  $('authors').value = prefs.authorsText;
  $('fetchAllPages').checked = prefs.fetchAllPages;
  $('maxPages').value = prefs.maxPages;

  $('starter').addEventListener('click', async () => {
    const read = async (file) => (await fetch(chrome.runtime.getURL(file))).text();
    $('interests').value = await read('profile/interests.txt');
    $('authors').value = await read('profile/authors.txt');
    $('saved').textContent = 'Starter lists loaded; click Save to keep them.';
  });

  $('save').addEventListener('click', async () => {
    const maxPages = Math.min(50, Math.max(1, parseInt($('maxPages').value, 10) || X.DEFAULT_PREFS.maxPages));
    await X.savePrefs({
      interestsText: $('interests').value,
      authorsText: $('authors').value,
      fetchAllPages: $('fetchAllPages').checked,
      maxPages,
    });
    $('maxPages').value = maxPages;
    const compiled = X.compilePrefs({ interestsText: $('interests').value, authorsText: $('authors').value });
    $('saved').textContent = `Saved ${compiled.interests.length} interests and ${compiled.authors.length} authors.`;
  });
})();

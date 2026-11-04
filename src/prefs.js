// Preference storage shared by the content script and the options page.
(function (root) {
  'use strict';

  const DEFAULT_PREFS = {
    interestsText: '',
    authorsText: '',
    sortMode: 'interest',
    hideNonMatching: false,
    fetchAllPages: true,
    maxPages: 50,
  };

  async function loadPrefs() {
    const stored = await chrome.storage.sync.get(DEFAULT_PREFS);
    return { ...DEFAULT_PREFS, ...stored };
  }

  function savePrefs(patch) {
    return chrome.storage.sync.set(patch);
  }

  function onPrefsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') loadPrefs().then(callback);
    });
  }

  root.XiRate = Object.assign(root.XiRate || {}, { DEFAULT_PREFS, loadPrefs, savePrefs, onPrefsChanged });
})(globalThis);

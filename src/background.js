// Content scripts cannot open the options page themselves.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'openOptions') chrome.runtime.openOptionsPage();
});

// Seed the starter lists in profile/ on first install. Lists the user has
// already saved are never overwritten.
chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get(['interestsText', 'authorsText']);
  const seed = {};
  for (const [key, file] of [['interestsText', 'profile/interests.txt'], ['authorsText', 'profile/authors.txt']]) {
    if (stored[key] === undefined) seed[key] = await (await fetch(chrome.runtime.getURL(file))).text();
  }
  if (Object.keys(seed).length) await chrome.storage.sync.set(seed);
});

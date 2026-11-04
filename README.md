# ξ-rate

A browser extension that re-sorts [SciRate](https://scirate.com/) listings by **your** research interests, the authors you follow, or SciRate's own scites. You stay on scirate.com and logged in, so sciting works as usual.

## Install (unpacked)

**Chrome / Edge / Brave:** open `chrome://extensions`, turn on *Developer mode*, click *Load unpacked* and pick this folder.

**Firefox (128+):** open `about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on…* and pick `manifest.json`. Temporary add-ons are removed when Firefox restarts.

After pulling changes, click the reload button on the extension card and refresh SciRate.

## Use

On first install, the interest and author lists are filled from [profile/interests.txt](profile/interests.txt) and [profile/authors.txt](profile/authors.txt), starter lists built from my SciRate scite history. *Restore starter lists* on the options page reloads them.

1. Open the extension's options (the *edit interests* link in the ξ-rate bar on any SciRate listing, or the extension's *Options* entry).
2. Add interests (one per line, optional `: weight`) and authors (`First Last` or `Last, First`).
3. On a SciRate listing, use the **Interests / Authors / Scites** buttons in the ξ-rate bar. The *hide below* slider hides papers whose score in the current mode (interest score, author score or scites) is below the chosen value, so it trims the tail of the sorted list; all the way left shows everything. Each mode remembers its own setting.

SciRate shows 50 papers per page. By default ξ-rate fetches up to 50 pages of the current date range and sorts them together; the limit is in the options.

Matched terms and authors appear as small badges under each title.

## Tests

The scoring and page-parsing tests run in a browser:

```bash
python -m http.server 8765
```

Then open http://127.0.0.1:8765/tests/test.html.

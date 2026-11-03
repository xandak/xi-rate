# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

xi-rate is a cross-browser Manifest V3 extension (Chrome 111+, Firefox 128+) that re-sorts [SciRate](https://scirate.com/) listings by the user's research interests, followed authors, or scites. The user is a quantum physics researcher. It augments scirate.com in place rather than replacing it, so sciting keeps working with the user's real SciRate login.

Plain JavaScript, no build step and no dependencies. Node is not installed on the dev machine.

## Commands

- Load: `chrome://extensions` → Load unpacked → repo root (Firefox: `about:debugging` → Load Temporary Add-on → `manifest.json`).
- Tests: `python -m http.server 8765` in the repo root, then open `http://127.0.0.1:8765/tests/test.html`. Results are also on `window.testResults` (`{total, failed, results}`), handy for checking from the browser pane. There's no runner for a single test; temporarily comment out others in `tests/*.test.js`.

## Architecture

Scripts share one global namespace, `globalThis.XiRate`. Each file adds to it in an IIFE, and load order is set in `manifest.json` (`scoring.js` → `prefs.js` → `scirate.js` → `content.js`).

- `src/scoring.js`: pure logic (no DOM or `chrome.*`), so it's unit-testable in a plain page. It parses the `term : weight` interest and author lists, scores a paper (title hit = 3×weight, abstract hits capped at 3) and sorts. Each sort mode has a tie-break key list in `SORT_KEYS`, ending in SciRate's original order.
- `src/scirate.js`: every SciRate selector and markup assumption lives here, including the inline `SciRate.scited_by_uid` / `SciRate.current_user` script and `will_paginate` links. If SciRate changes its HTML, fix it here.
- `src/content.js`: runs on every scirate.com page and exits unless there's a `.paperlist ul.papers`. It fetches the other pages of the current date range (SciRate pages at 50, sorted by scites), imports their `li.paper` nodes, re-orders the list in place, and adds the toolbar and match badges.
- `src/page-hook.js`: a `"world": "MAIN"` content script. Papers imported from other pages lack SciRate's Backbone handlers, so `content.js` wires their scite buttons itself. It asks the page-world hook, via `CustomEvent`s with JSON-string `detail`, to POST `/api/scite|unscite/:uid` with the page's CSRF token and to re-run MathJax v2 typesetting. Page-1 nodes keep SciRate's native handlers because moving DOM nodes preserves listeners.
- `src/prefs.js`: `chrome.storage.sync` preferences (raw interest/author text, sort mode, page limits), shared by the content script and `options/`.
- `src/background.js`: opens the options page (content scripts can't), and on install seeds `chrome.storage.sync` from `profile/interests.txt` and `profile/authors.txt` if the user hasn't saved lists yet.
- `profile/`: the user's starter interest and author lists, derived from their SciRate scite history (username `xanda-kolesnikow`). Matching titles/abstracts were fetched from the arXiv API into the gitignored `data/` folder. Edits here only reach an existing install through the options page's "Restore starter lists" button.

## SciRate facts

SciRate is open source (Rails, https://github.com/scirate/scirate). Views are in `app/views/papers/_paper.html.slim` and `app/views/feeds/show.html.slim`, scite JS in `app/assets/javascripts/scirate.js.coffee`, and the listing query in `FeedsController#_range_query`. Useful routes: `GET /arxiv/:feed?range=N&page=P`, `POST /api/scite/:uid`, `POST /api/unscite/:uid`, `GET /:username/download_scites` (scite history; not used yet).

scirate.com sits behind a Cloudflare bot check, so curl and automated browsers get a challenge page. Verify against the live site in the user's own browser; in tests, use fixtures modelled on the templates above.

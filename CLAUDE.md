# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

xi-rate is a personalised front end for [SciRate](https://scirate.com/) (the arXiv upvote site). The user is a quantum physics researcher who wants arXiv listings sortable by:

- their own research interests (topic relevance),
- authors they follow,
- SciRate scites (the native SciRate ordering).

Sciting must keep working against the real SciRate account, so xi-rate augments SciRate rather than replacing it.

The repository is new: no build system, tests or source code exist yet. Update this file with commands and architecture once they do.

## SciRate integration facts

SciRate is open source (Rails): https://github.com/scirate/scirate. Relevant routes from `config/routes.rb`:

- `GET /arxiv/:feed` — feed listing (e.g. `/arxiv/quant-ph`); `GET /` is the user's home feed.
- `GET /arxiv/:paper_uid` — paper page; `GET /arxiv/:paper_uid/scites` — who scited it.
- `POST /api/scite/:paper_uid` and `POST /api/unscite/:paper_uid` — scite/unscite. They need the logged-in session cookie and Rails CSRF token, so they are easiest to call from code running on a scirate.com page.
- `GET /:username/download_scites` — export of a user's scite history, a useful signal for learning interests.

There is no documented public JSON API for listings. Paper metadata (abstracts, authors) can also come from the arXiv API (`export.arxiv.org/api/query`).

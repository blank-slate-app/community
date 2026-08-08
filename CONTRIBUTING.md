# Contributing

Two things live here: **decks** and **tools**. Both arrive by pull request.
A maintainer reviews every submission — tools are single readable files, so
the whole diff is the whole tool — and merging it makes it live in every
user's panels within a minute.

## Submitting a deck

1. In Blank-Slate, right-click the canvas → **Publish Deck…**
   The app builds a tidy, self-contained folder in your local `_decks/`
   library: only the objects on your artboards, images re-encoded to ≤1MB
   each, a flip-through preview PDF named `<Title - Author>.pdf`, the
   project file, and any **unique** tools the deck needs (stock tools are
   never bundled).
2. Fork this repo, copy that folder into `decks/`, and add an entry to
   `index.json`:

   ```json
   {
     "dir": "My Deck - My Name",
     "title": "My Deck",
     "author": "My Name",
     "pages": 6,
     "images": 12,
     "downloads": 0,
     "files": [
       "manifest.json",
       "project.json",
       "My Deck - My Name.pdf",
       "images/photo-01.jpg",
       "tools/my-tool.js"
     ]
   }
   ```

   `files` must list **every file in the folder** — the app downloads them
   individually, no server involved. `downloads` starts at 0.
3. Open the pull request. That's it.

**Deck rules:** folder and PDF named `Title - Author` · PDF ≤5MB ·
images ≤1MB each (Publish Deck… already guarantees both) · only include
tools that differ from the shipped baseline · nothing in the deck that
isn't yours to share.

## Submitting a tool

1. Build it per [AGENTS.md](AGENTS.md) — one self-contained `.js` file,
   honest `manifest.authors` ledger (append your name, never remove
   others; keep `basedOn` if you remixed).
2. Add the file under `community-tools/` and an entry to `index.json`:

   ```json
   {
     "file": "community-tools/sticker.js",
     "name": "Sticker",
     "author": "My Name",
     "credits": ["My Name"],
     "basedOn": null,
     "description": "Drop emoji stickers on the canvas",
     "downloads": 0
   }
   ```

   `author` is whoever made THIS tool. For a remix, `basedOn` names the
   tool you forked and `credits` lists the full `manifest.authors` chain,
   oldest first — e.g. `"author": "santibraby", "credits":
   ["Forma Rosa Creative", "santibraby"], "basedOn": "artboards"`.

3. Open the pull request.

**Tool rules:** plain readable JavaScript — no minified or obfuscated code ·
no network calls, no `window.api`, only the `ctx` API · must load cleanly
(the app boots even if a tool is broken, but broken tools aren't merged) ·
test the discipline before submitting: your action undoes with Ctrl+Z and
survives save/reload.

## Licensing your submission

By opening the PR you confirm the work is yours to share, and you license
it to the community: **tools under MIT** (attribution via the
`manifest.authors` ledger), **decks under CC BY 4.0**. Details in
[LICENSE.md](LICENSE.md). One bonus worth knowing: merged contributors
get a free Blank-Slate license permanently, whatever their size.

## Review

Maintainers read every line of tool code before merging — that's the point
of one-file tools. Decks are checked for the rules above and a quick
open-the-PDF sanity pass. No CLA, no process beyond the PR.

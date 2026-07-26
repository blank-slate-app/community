# Blank-Slate Community

The shared library for [Blank-Slate](https://github.com/blank-slate-app/blank-slate)
— a desktop canvas app for moodboards and pitch decks where **every tool is a
single file you can read, edit, remix, or write from scratch**, by hand or by
pointing an AI agent at it.

This repo is what the app's **Decks** and **Tools** panels show. Every copy of
Blank-Slate reads this catalog live: when something is merged here, it appears
in everyone's panels within a minute. Download a deck and it merges into your
open project; install a tool and it lands in your `_tools/` folder as a plain
`.js` file, yours to remix.

## Get the app

1. Download the latest `Blank-Slate-<version>-win.zip` from
   [Releases](https://github.com/blank-slate-app/blank-slate/releases/latest).
2. Unzip it anywhere you like (e.g. `Documents\Blank-Slate`).
3. Run `Blank-Slate.exe`.
   - Windows SmartScreen may warn because the app isn't code-signed yet —
     click **More info → Run anyway**.
4. On first run the app creates its folders **next to the exe**:

   | folder | what it is |
   |---|---|
   | `_projects/` | your projects — one folder each: `project.json` + `assets/` |
   | `_tools/` | every tool, one editable `.js` file each — this IS the app |
   | `_baseline/` | pristine copies; deleted tools auto-revive from here |
   | `_decks/` | your local deck library: published + downloaded decks |

   Everything is visible, plain files. Point an agent (or a text editor)
   at `_tools/` and start remixing — `_tools/AGENTS.md` is the contract.

## What's in this repo

```
community/
├── index.json          the catalog the app fetches
├── decks/              published decks — exactly what "Publish Deck…" produces
│   └── <Title - Author>/
│       ├── manifest.json
│       ├── project.json
│       ├── <Title - Author>.pdf    ← flip through every page in the panel
│       ├── images/…                (each ≤1MB)
│       └── tools/…                 (only the deck's unique tools)
└── community-tools/    standalone tool submissions (one .js file each)
```

## Contribute

- **Share a deck or a tool:** see [CONTRIBUTING.md](CONTRIBUTING.md).
  Submissions are pull requests; a maintainer reviews and merges — merge =
  live in every app.
- **Build or remix a tool:** see [AGENTS.md](AGENTS.md) — the full authoring
  contract, written to be handed to an AI agent as-is.

---

Curated by Forma Rosa Creative · every tool is a file

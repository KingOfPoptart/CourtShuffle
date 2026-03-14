# CourtShuffle

A mobile-first web app for randomly assigning racquetball players to courts.

## Live Site

Deployed via GitHub Pages: [https://kingofpoptart.github.io/CourtShuffle/](https://kingofpoptart.github.io/CourtShuffle/)

## Features

- **Player pool** — maintain a permanent roster per gym; toggle who's present each session
- **Court shuffle** — randomly assigns present players to courts, respecting player court preferences
- **Game types** — Singles (2), Cutthroat (3), Doubles (4); random server picked for all types; random 2v2 teams for Doubles
- **Bench** — overflow players who don't fit on a court are placed on the bench
- **Drag & drop** — rearrange players between courts and the bench after shuffling; drop onto another player to swap
- **Multi-gym** — add, rename, and delete gyms; each gym has its own player pool and court count
- **Editable court names** — courts default to "Court 1", "Court 2", etc. but can be renamed
- **Share** — copy a link that encodes the gym's players, court config, and present status as URL params; opening the link adds it as a new gym (duplicate names get a number appended)
- **Help** — built-in `?` button explains all features
- **Persistent** — all state saved to localStorage

> **Note:** Enable GitHub Pages in the repo settings → Pages → Source: **GitHub Actions** for the deploy workflow to work.

## Development

```bash
nvm use        # or: nvm install 20
npm install
npm run dev
```

## Deployment

Push to `main` — GitHub Actions builds and deploys automatically.

```bash
git push origin main
```

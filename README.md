# Watchsize

https://watchsize.mebn.dev

Compare watch sizes at true scale on an A4 sheet.

```sh
npm install
npm run dev      # http://localhost:5173
npm test
```

- **New watch**: drop, paste, browse or paste a link to a producer / stock photo (transparent or white
  background, front view) and enter the case diameter in mm.
- The background is removed, the case edges are detected (crown excluded) and the image is
  scaled so the case is exactly that many mm. Drag the two guides to fine tune; double click a
  watch (or its row in the list) to adjust later.
- Drop an image straight onto the sheet to start a new watch at that spot.
- `1:1` shows the sheet at physical size after calibrating with a bank card (ruler icon).
- Print gives an exact A4 at 100% scale.

Image links and images dragged in from another browser tab are fetched through a small proxy in
`vite.config.ts` (`/api/img`). It runs with `npm run dev` and `npm run preview`.

# uni-grid-web3-v4

This project now builds as a fully client-side static Svelte app, which makes it suitable for GitHub Pages hosting.

## Local development

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:3000`.

## Production build

```bash
npm run build
```

The static output is written to `dist/`.

## GitHub Pages

The Vite base path is configured for repository pages under `/uni-grid-web3-v4/`.

Automatic deployment is available through the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`.

If you publish this repository through GitHub Pages:

1. Run `npm install`.
2. Run `npm run build`.
3. Publish the contents of `dist/`.

Repository settings required for the workflow:

1. Open `Settings -> Pages` in GitHub.
2. Set `Source` to `GitHub Actions`.

If you deploy with a custom domain or a user/organization page, override the base path at build time:

```bash
BASE_PATH=/ npm run build
```

## Notes

The current app is shipped as a client-rendered SPA. Any future routes must continue to work without server rendering if they are intended to stay GitHub Pages-compatible.

## License

MIT
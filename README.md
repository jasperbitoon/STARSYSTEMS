# Star Systems

Custom software for the problems you work around.

The marketing site for Star Systems, a one-person software studio that builds custom
CRMs, internal tools and automations. Five pages (Home, Solutions, Work, About,
Start a project) served as static files. There is no build step.

## Run it locally

Serve this folder with any static file server. With Python:

```bash
python -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/>. On Windows, use `py` in place of `python` if the
command is not found. Opening `index.html` straight from disk does not work; the page
has to be served.

## What's here

| Path | What it is |
| --- | --- |
| `index.html` | The whole site: styles in the head, the five pages inside the `x-dc` block, behaviour in the script block at the bottom |
| `support.js` | The runtime that renders `index.html`, included unmodified from the design tool the site was drawn in |
| `_ds/` | Nocturne design system from the same tool: colour, type and component styles |
| `vendor/` | React and ReactDOM 18.3.1, served locally |
| `fonts/` | Inter, Latin subset, with its licence |
| `404.html` | Not-found page for GitHub Pages |
| `.nojekyll` | Tells GitHub Pages to serve `_ds/` as-is |

## Editing

- **Wording and layout** live in the template inside `index.html`.
- **Each page has its own address**: `#/solutions`, `#/work`, `#/about`, `#/start`.
- **The enquiry form** posts through [Web3Forms](https://web3forms.com). Search
  `index.html` for `FORM_KEY` and paste your access key between the quotes. While that is
  empty, submitting opens the visitor's email app with their answers filled in instead,
  and shows the same message on the page for them to copy.
- **Brand name, contact email and the availability line** are the defaults in the
  `data-props` attribute of the script block; changing them there updates every page.
  Three places are plain text and have to be edited by hand as well: the `noscript`
  block just above the script (brand, tagline and email), the `<title>` and `og:` tags in
  the head (brand and tagline), and `404.html` (brand).

## Publishing

GitHub Pages: Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.

Third-party licences are listed in `THIRD-PARTY-NOTICES.md`.

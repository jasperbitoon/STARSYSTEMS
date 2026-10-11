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
command is not found.

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

- **Wording and layout** live in the template inside `index.html`. Some wording is in the
  script block at the bottom instead: the typed lines in the Home hero (`TYPED_LINES`), the
  Solutions lists, the per-field error messages, the button and note text that changes as
  the form is used, the browser-tab name of each page, the Pause/Resume motion label, and
  the subject and labels of the enquiry email. If a phrase is not where you expect, search
  `index.html` for it. Each piece of text in the script block sits between single quotes:
  keep them, and inside the text use a curly apostrophe (’) rather than a straight one ('),
  or the pages stop showing. Check the page locally before publishing.
- **Page headlines** have each word in its own `<span class="ns-w">…</span>`, so the words
  can arrive one at a time. When you change a headline, keep one word (with its punctuation)
  per span and a space between the spans. The same sentence is also written once, whole, in
  the `aria-label` of the `<h1>`: that is what a screen reader reads, so change it to match.
- **Motion** is marked in the template, not scripted per element: `data-reveal` brings a
  block in each time it scrolls into view, from either direction (`data-reveal="row"` brings
  it in a column at a time), and
  `data-tilt` leans a card or row toward the pointer. The Pause motion control in the footer
  and the visitor's reduced-motion setting switch all of it off.
- **Each page has its own address**: `#/solutions`, `#/work`, `#/about`, `#/start`.
- **The enquiry form** posts through [Web3Forms](https://web3forms.com). Search
  `index.html` for `FORM_KEY` and paste your access key between the quotes. While that is
  empty, submitting opens the visitor's email app with their answers filled in instead,
  and shows the same message on the page for them to copy.
- **Brand name, contact email and the availability line** are the defaults in the
  `data-props` attribute of the script block; changing them there updates every page.
  Leave the `&quot;` marks around each value in place, and do not type a plain `"` inside
  one. Three places are plain text and have to be edited by hand as well: the `noscript`
  block just above the script (brand, tagline and email), the `<title>`, description and
  `og:` tags in the head (brand and tagline), and `404.html` (brand).

## Publishing

GitHub Pages: Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`.

Third-party licences are listed in `THIRD-PARTY-NOTICES.md`.

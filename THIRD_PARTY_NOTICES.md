# Third-party notices

Linkora is distributed under GPL-3.0-only. See `LICENSE`.

## QRBTF

- Upstream: https://github.com/ciaochaos/qrbtf
- Copyright belongs to the QRBTF authors and contributors. Existing upstream notices are retained. The upstream README credits `ciaochaos`, `CPunisher`, and other members of Latent Cat.
- License: GNU General Public License version 3, retained at `third_party/qrbtf/LICENSE`.
- Reused source: A1 and A2 SVG renderers, A1/A1C/A1P and A2/A2C presets, QR matrix classification, and positioning path constants.
- The supplied upstream archive's SHA-256 and original source hashes are recorded in `third_party/qrbtf/upstream.json`. No unverifiable commit hash is asserted.
- Linkora modifications (2026-09-12): removed upstream site-specific forms and translation dependencies; added small local renderer types; made random point/line generation deterministic per payload; limited SVG root attributes; integrated local decoding, rendering, and export checks. Upstream preset parameter values are preserved.
- `scripts/vendor-qrbtf.py` documents the extraction and adaptation. Renderer source, preset source, lockfile, build scripts, and these notices are included in source distributions.

## Other dependencies

Next.js, React, lucide-react, Zod, ZXing, and the QR encoder retain their respective licenses in npm distributions. `package-lock.json` pins the dependency graph. Installing dependencies with `npm ci` retrieves their license files. `@paulmillr/qr` 0.1.1 is pinned to match the supplied QRBTF encoder API; it is upstream-deprecated and should be migrated with decoding regression tests before a future dependency upgrade.

## Artwork and fonts

The supplied PSD, extracted images, embedded example payment images, custom fonts, administrator-uploaded assets, and user images are **not** licensed by this code's GPL declaration. They are excluded from Git and source archives. Their distribution requires separate permission from their rights holders. Do not upload `public/private-assets`, `data`, `.local`, or environment files to a public repository.

## Corresponding source distribution

This repository contains the application source and build materials. Before distributing a deployed build, generate the matching archive with `npm run source:bundle`. The running server provides it at `/api/source`; the response `Link` header advertises this URL with `rel="source"`. The site does not display a source button or modification log. Operators must keep that archive matched to the deployed build and retain these license notices. An archive is a code source distribution and does not confer rights to excluded artwork or fonts.

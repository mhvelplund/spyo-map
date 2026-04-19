# Copilot instructions for Spyo Map

> **For agentic workers:** REQUIRED: Use superpowers:using-superpowers (if it is available).

- Use Mise-en-place for organizing code and files. Install all tools with `mise`.

## Build, lint, and data-prep commands

- `npm run dev` starts the Vite dev server on port 3000 (proxies `/api` to `localhost:3001`).
- `npm run lint` runs ESLint across all workspace packages.
- `npm run build` builds the frontend (`packages/frontend/dist/`).
- `npm run build --workspace=packages/backend` compiles the Fastify backend to `packages/backend/dist/`.
- `npm run build --workspace=packages/extractor` compiles the extractor job to `packages/extractor/dist/`.
- `docker compose up` starts MinIO + backend + frontend for local development.
- `docker compose run --rm extractor` runs the extractor against the MinIO `raw/` folder.
- `docker compose run --rm -e LOCAL_SOURCE_PATH=/photos -v /path/to/photos:/photos extractor` ingests from a local folder.
- Automated tests are not configured yet.

## Planning

- When planning a new feature or change, try to break the work into jobs that can be performed in parallel branches.
  Example, if a change requires both backend and frontend work, start by planning work that affects the shared
  interface, then plan work for the backend and frontend separately. The to latter tasks can then be performed in
  parallel Git branches without merge conflicts.

## Source control

- When making commits, follow the conventional commit format: `<type>: <description>`. For example:
  `feat: add clustering for nearby images`.
- Write clear and descriptive commit messages that explain the "what" and "why" of the changes.
- Only use the following types: `feat`, `chore`, and `feat!`. Use `feat!` for breaking changes that require a major
  version bump. For example: `feat!: change image ID format, requires frontend and backend updates`. This helps maintain
  a clear commit history and facilitates automated changelog generation if needed in the future.

### Pull requests

- Never commit to the `main` branch directly. Always create a feature branch for your work, and open a pull request when
  it's ready for review. This allows for code review, discussion, and testing before changes are merged into the main
  codebase.
- Keep pull requests focused and concise. Avoid bundling unrelated changes together, as this makes it harder to review
  and understand the purpose of the PR. If you find yourself making multiple unrelated changes, consider breaking them
  into separate PRs.
- After opening a pull request, notify me for review. I will review the code, provide feedback, and merge the PR if I
  approve it.
- When working on a multi-stage feature, create PR's to the feature branch instead of main until the contents of the
  feature are ready for main. This allows for incremental review and testing of the feature as it is developed, without
  affecting the stability of the main branch.

## High-level architecture

This is an npm workspaces monorepo with four packages:

- **`packages/shared`** — Shared TypeScript types (`ImageRecord`, `GeoLocation`, etc.). Both frontend and backend use these.
- **`packages/frontend`** — React + Vite + Leaflet SPA. Fetches image metadata from the backend REST API. Loads images directly from S3/MinIO via `<img src>` using absolute URLs returned by the API. No SQL.js, no Google Maps, no API key in the browser.
- **`packages/backend`** — Fastify REST API. Downloads `images.db` from S3/MinIO at startup using `@aws-sdk/client-s3`, reads it with `better-sqlite3`, and serves JSON metadata at `/api/images`. Never proxies image files. Constructs `imageUrl`/`thumbnailUrl` from `IMAGES_BASE_URL` env var.
- **`packages/extractor`** — One-shot TypeScript CLI job (replaces `extract_exif.py`). Reads photos from `raw/` in the bucket or a local folder (`LOCAL_SOURCE_PATH`), extracts GPS EXIF with `exifr`, resizes with `sharp`, uploads to `images/` and `images/thumbnails/`, then atomically replaces `images.db` in the bucket.

Object storage layout:
```
bucket/
├── raw/                 ← upload source photos here
├── images/              ← processed full-size (public read)
│   └── thumbnails/      ← thumbnails (public read)
└── images.db            ← SQLite DB (private; backend + extractor only)
```

- Routing is hash-based (`/#/image/:imageId`) for static-hosting compatibility.
- `MainMapView` loads all images via `apiClient.getAllImages()` and passes them to `MapView`.
- `MapView` owns Leaflet integration. It renders circular thumbnail markers using `DivIcon`, clusters with `leaflet.markercluster`, and reports selection back to the router layer.
- `ImageView` handles deep-linked routes. It fetches nearby images via `apiClient.getNearbyImages()` and opens `ImageModal`.
- `ImageModal` handles full-image viewing, keyboard/touch navigation, and social sharing.

## Key conventions

- `ImageRecord` has `imageUrl` and `thumbnailUrl` (absolute URLs from the API). Do not derive image paths from IDs in the frontend.
- The S3 client (both backend and extractor) must use `forcePathStyle: true` for MinIO compatibility.
- Normalize image identifiers with `extractImageId()` when working with routes, selection handlers, or shared URLs.
- Hash-based routing (`/#/image/:imageId`) is preserved — `generateImageUrl()` and `SocialShare` both assume this form.
- TypeScript is configured in strict mode across all packages. Follow the typed `ImageRecord`/props patterns.

# Communication style

- Be terse and direct. No filler, no preamble, no summaries unless asked.
- Skip "Sure!", "Great question!", "Here's what I found:", and similar pleasantries.
- State the answer or action, then stop.
- This applies only to chat responses, not to generated code, comments, or file content.

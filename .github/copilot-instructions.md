# Copilot instructions for Spyo Map

- Use Mise-en-place for organizing code and files. Install all tools with `mise`.

## Build, lint, and data-prep commands

- `npm run dev` starts the Vite dev server on port 3000.
- `npm run lint` runs ESLint for the TypeScript/React app.
- `npm run build` runs `tsc -b`, builds the Vite app, then copies required static assets from `public/` into `dist/`.
- `npm run build:github` builds for GitHub Pages with `--base=/spyo-map/`.
- `npm run build:production` validates deployment prerequisites, builds, then validates the final `dist/` output.
- `npm run build:validate` validates the already-built `dist/` folder.
- `npm run deploy:validate` checks that `VITE_GOOGLE_MAPS_API_KEY`, `public/images.db`, and `public/images/` are present before deployment.
- `uv sync` installs the Python dependencies and CLI entry point for EXIF extraction from `pyproject.toml`.
- `cd public && python ../extract_exif.py /path/to/photo-folder` generates `public/images.db`, `public/images/`, and `public/images/thumbnails/` in the location the frontend and build expect.
- Automated tests are not configured in `package.json` right now, so there is no repo-native full-test or single-test command yet.

## High-level architecture

- The repo has two cooperating parts:
  - `extract_exif.py` is the offline ingestion step. It scans a photo folder, extracts GPS/EXIF metadata, generates scaled images and thumbnails, and writes an SQLite database plus image assets into the current working directory. Run it from `public/` so the web app can fetch the generated files.
  - The React/Vite app is a stateless browser client. `src/services/DatabaseService.ts` fetches `/images.db`, opens it with SQL.js in the browser, maps each row to `ImageRecord`, and derives full-size and thumbnail paths from the image ID.
- Routing is static-hosting friendly. `src/main.tsx` uses `HashRouter`, so direct links and share URLs use `/#/image/:imageId` instead of server-handled path routing.
- `MainMapView` is the landing flow: it loads all images through `databaseService` and passes them to `MapContainer`.
- `MapContainer` owns Google Maps integration. It renders custom `AdvancedMarkerElement` markers with thumbnail previews, clusters them with `@googlemaps/markerclusterer`, and reports image selection back to the router layer.
- `ImageView` handles deep-linked image routes. It reloads the image list, selects the requested image from the route param, computes nearby images client-side, and opens `ImageModal` over the same map view.
- `ImageModal` is responsible for full-image viewing, keyboard/touch navigation, and social sharing.
- Build and deployment assume generated assets already exist in `public/`. `deploy.config.js` copies `public/images.db`, `public/images/`, and optional `public/.htaccess` into `dist/` after Vite builds. The GitHub Actions workflow follows that same pipeline.

## Key conventions

- Do not store image file paths in SQLite. The database only stores metadata plus the stable image `id`; the frontend derives `/images/{id}.jpg` and `/images/thumbnails/{id}.jpg`.
- Normalize image identifiers with `extractImageId()` when working with routes, selection handlers, or shared URLs. Callers may pass a bare ID, filename, or path-like string.
- Preserve hash-based routing when changing navigation or sharing behavior. `generateImageUrl()` and `SocialShare` both assume `/#/image/:imageId`.
- Nearby-image modal navigation is currently a UI concern, not a service-layer concern. `ImageView` computes a sorted 1 km neighborhood in memory and uses that list for prev/next navigation.
- The frontend expects `VITE_GOOGLE_MAPS_API_KEY` and shows explicit fallback UI when it is missing or Google Maps fails to load. Keep that failure mode visible rather than silently bypassing the map.
- TypeScript is configured in strict mode. Follow the existing typed `ImageRecord`/props patterns and avoid widening types when changing data flow across components.

# Communication style

- Be terse and direct. No filler, no preamble, no summaries unless asked.
- Skip "Sure!", "Great question!", "Here's what I found:", and similar pleasantries.
- State the answer or action, then stop.
- This applies only to chat responses, not to generated code, comments, or file content.

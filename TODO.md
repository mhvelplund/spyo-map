# TODO

- **Purge the CDN cache when an image is hidden.** Hiding moves `images/{id}.jpg` and its thumbnail to
  `private/{random}.jpg`, but Cloudflare's edge cache on `spyo-img.isntall.net` can keep serving the old URLs until the
  cached copies expire. Have the Worker purge those two URLs on hide. Needs a Cloudflare API token with Zone → Cache
  Purge permission, stored as a Worker secret.
- **Admin CLI `images remove` and hidden images.** It deletes `images/{id}…` only; a hidden image's `private/` files
  and its `image_overrides` row are left behind. That row also keeps the hash's group membership and position
  override (the Worker ignores such orphan rows when counting group members).
- **Accept HEIC uploads.** Let the upload page (and mobile app) accept `.heic`/`.heif` files. The extractor converts
  them to JPG when writing `images/` and `images/thumbnails/`; the untouched HEIC is kept as-is in `originals/`. Check
  that `exifr` reads GPS from HEIC and that the `sharp` build used by the extractor can decode HEIC (prebuilt sharp
  binaries may lack HEVC support — may need a libheif-enabled build or a separate decoder such as `heic-convert`).

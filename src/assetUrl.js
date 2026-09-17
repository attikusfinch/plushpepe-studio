// Catalog paths are relative to the app, including a GitHub Pages project path.
export function assetUrl(path) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

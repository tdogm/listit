export async function postToShopify({ listing, photos }) {
  // TODO: implement once you set env vars
  // listing: { title, description, price_cents, category, condition, ... }
  // photos: array of signed URLs
  return {
    ok: false,
    manual: true,
    message: "Shopify connector not configured yet (missing env vars).",
  };
}

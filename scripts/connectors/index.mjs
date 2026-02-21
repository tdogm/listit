import { postToShopify } from "./shopify.mjs";
import { postToEtsy } from "./etsy.mjs";

// Platforms you already show in UI
export async function postToPlatform({ platform, listing, photos }) {
  switch (platform) {
    case "Shopify":
      return await postToShopify({ listing, photos });
    case "Etsy":
      return await postToEtsy({ listing, photos });

    // Not automated (officially) — return "manual"
    case "Facebook Marketplace":
      return { ok: false, manual: true, message: "No official general posting API. Use manual export." };

    // eBay supported, but auth setup is bigger; placeholder for now
    case "eBay":
      return { ok: false, manual: true, message: "eBay auth not configured yet." };

    default:
      return { ok: false, manual: true, message: `No connector for ${platform}` };
  }
}

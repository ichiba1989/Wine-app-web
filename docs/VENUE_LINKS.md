# Links to Vintage Wine Merchants' website (Vintage Wine Merchants branch)

On the Vintage Wine Merchants version, a wine's name on the Discover card opens **that wine's page on vintagewinemerchants.com**, or is not a link at all when the wine is not on the website. Nothing is made up: a link is saved only when the website itself lists the same wine (same words, same vintage; bottle sizes, accents and capitals aside). When two pages could fit, or none does, there is no link.

## One-time setup (owner)

1. **Database:** run `docs/venue_links.sql` in the Supabase SQL editor (adds the link columns to the shop's list; safe to run again).
2. **Server function:** web browsers do not let one site read another site's pages, so the reading is done by a small Supabase Edge Function.
   - Supabase dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Name it exactly **`venue-links`**.
   - Replace the example code with the whole of `docs/venue_links_function.js` and press **Deploy**.
   - It needs no secrets. It only reads public pages on vintagewinemerchants.com and never writes to the database (the editor's app saves the results under the editor's own access).

## Using it (editors)

Editor tab → **Vintage Wine Merchants** → **Website links** (on the line above the wine being reviewed):

- **Find links** reads the website's product list and gives each wine on the shop's list its page there, or marks it "not on the website".
- **Check links** opens every saved link. A page that is gone, that now sends you elsewhere, or that shows a different wine (or another vintage) is **removed**; the screen lists what was removed and why. A page that could not be opened at all (the website was down) is left as it is.

Run **Find links** after each new upload of the shop's list, and **Check links** now and then (the shop sells out of wines). The Owner page's list tab shows each wine's link in the **Website** column.

## How it reads the website

The function tries the two common shop systems: a Shopify product list (`/products.json`) and a WooCommerce product list (`/wp-json/wc/store/products`). If the website is built differently, Find links says the website did not list its products; tell the developer, and a reader for that system can be added in `docs/venue_links_function.js` (re-deploy after any change).

**Not tested against the live website:** while this was built, vintagewinemerchants.com could not be reached from the development environment, so the first real run is the test. The matching rules were tested against the shop's own titles (every title found its own page and none linked to a different wine).

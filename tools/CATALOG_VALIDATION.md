# Daily catalog validation

Runbook for the scheduled task that checks products created or updated in the
last 26 hours on athletic-horse.com (Shopify Admin GraphQL via the Shopify connector).
It fixes what is safe to fix and reports the rest.

## Scope

```graphql
products(first: 100, query: "updated_at:>'<now minus 26h ISO>' status:active") { ... }
```

Skip drafts and archived products. Never touch theme files and never publish a theme.

## Checks and fixes (per product)

1. **Category.** The product must be in exactly one *primary* category, decided by the
   first regex in `tools/category_rules.py` (`PRIMARY`, then catch-all
   `training-accessories`), plus the secondary memberships from `targets()`
   (`water-sports`, `racket-equipment`, `kids`, `women`, `men`, `gym-equipment`, …).
   - Fix by **adding** missing memberships with `collectionAddProducts`.
     Only do this for manual (non-smart) collections.
   - Never remove a product from a collection. Report extra or conflicting
     memberships instead.
2. **English SEO.**
   - `seo.title`: `<Short product name> | Alhisan Alriyadi`, 70 characters or fewer.
   - `seo.description`: 120–160 characters, a natural sentence about the product,
     ending with "Cash on delivery across Saudi Arabia."
   - Set **both fields in the same** `productUpdate(product:{id, seo:{title, description}})`.
     Sending only one clears the other.
3. **Alt text.** Every image must have alt text.
   - The first image gets the product title.
   - Later images get `<title> – view N`.
   - Update via `fileUpdate(files:[{id: <MediaImage gid>, alt}])`.
   - Keep existing alt text unless it is empty or a file name.
4. **Arabic translations (locale `ar`).** Read `translatableResource(resourceId)` and
   register `title`, `body_html`, `meta_title`, `meta_description` with
   `translationsRegister`. Use the current `translatableContentDigest`, and do it
   whenever a key has no `ar` translation or it is marked `outdated`.
   - Write natural Modern Standard Arabic suited to a Saudi sports store.
   - Keep brand names and numbers. Keep the HTML structure of `body_html`.
   - `meta_title` format: `<الاسم المختصر> | الحصان الرياضي`.
   - Option names and values must also be in Arabic. They show on product pages, in the cart, at checkout and in emails.
     - For each product, read `translatableResource` for its `ProductOption` and `ProductOptionValue` IDs (`product.options{id optionValues{id}}`).
     - Register the `ar` `name` from the dictionary at `tools/option_dictionary.json`.
     - Leave pure size codes and numbers as they are (`XL`, `2XL`, `42`).
     - If a value is not in the dictionary, translate it into natural Arabic and add it to the report.
5. **Option naming.**
   - Option names: `Size`, `Color`, `Weight`, `Length`.
   - Size values: `Small`, `Medium`, `Large`, `XL`, `2XL`, …, not `S/M/L` or `M`.
     Numeric sizes (shoe, age, cm) stay as they are.
   - Weight values: `5 KG`.
   - Fix with `productOptionUpdate`. If it fails (for example, metafield-linked
     values), report it.
6. **Description.** An empty English description is reported, not invented.
7. **Frequently bought together.**
   - The theme picks add-ons in Liquid (`theme/snippets/fbt-picks.liquid`): it
     maps the product's category to complementary categories.
   - Coverage check: the product's primary category must appear as a rule key in
     that snippet's `rules` string, and at least one target category must have
     another in-stock product.
   - Report uncovered products and suggest a rule line. Do not write the
     `custom.frequently_bought_together` metafield; static picks go stale.
   - "You may also like" uses Shopify's related recommendations, with the most
     specific collection as a fallback. A product in a primary category is covered.
8. **Images present.** Report products with zero images.
9. **No country of origin "Egypt".** The store never shows "Made in Egypt".
   - Remove from English `descriptionHtml`, case-insensitive: "Made in Egypt", "Country of origin: Egypt". If the phrase is a whole `<li>`, remove the `<li>` too.
   - Remove from Arabic `body_html`: "صنع في مصر", "مصنوع في مصر", "بلد المنشأ: مصر". Do this after the English change and use the new digest.
   - Check `seo.description` and the Arabic `meta_description` the same way.
   - Do not touch products where Egypt is the design, for example "Handball – Egypt Flag Print".

## Limits

- GraphQL documents must stay under 16384 characters. Put large payloads in variables.
- Batch at most 10 `translationsRegister` aliases per request.
- Bulk mutations are not available. Loop instead.

## Output

End with a short summary:
- products checked;
- each fix applied (product title → what changed);
- items needing the owner (empty descriptions, no images, failed option renames,
  uncovered FBT categories).

If nothing was updated in the window, say so in one line.

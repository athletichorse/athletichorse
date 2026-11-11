"""Build Shopify productSet payloads for new, in-stock babasaleh.com products.

Usage: python3 -I tools/prepare_babasaleh_import.py <babasaleh_products.json> <athletic_horse_products.json> <out.json>
(both inputs are the public /products.json dumps, all pages concatenated)

Rules agreed with the owner (2026-10-26):
- only products not already in the store (title / image filename / SKU) with at least one available variant
- price SAR = EGP / 6.97, rounded to a whole riyal (same ratio as existing products); compare-at the same way
- status DRAFT; inventory tracked, 10 per available variant, 0 for sold-out variants; deny overselling
- vendor "Baba Saleh" becomes the store name; descriptions never mention Egypt / Baba Saleh / EGP
  (unless Egypt is the product's design, e.g. "Egypt National Team" kit)
"""
import json, re, sys, os

EGP_PER_SAR = 6.97
STORE = 'Alhisan Alriyadi'
SCRUB = re.compile(r'egypt|مصر|baba ?saleh|بابا صالح|cairo|القاهرة|\bEGP\b|جنيه|made in', re.I)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def norm(t):
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()


def img_key(src):
    return src.split('/')[-1].split('?')[0]


def sar(egp):
    egp = float(egp or 0)
    return str(max(1, round(egp / EGP_PER_SAR))) if egp else None


def clean_body(html, title):
    keep_egypt = re.search(r'egypt', title, re.I)
    html = re.sub(r'baba ?saleh|بابا صالح', STORE, html or '', flags=re.I)
    if keep_egypt:
        return html
    # drop whole <li>/<p> blocks or sentences that mention the scrubbed words
    html = re.sub(r'<(li|p)[^>]*>(?:(?!</\1>).)*?(?:egypt|مصر|cairo|القاهرة|\bEGP\b|جنيه|made in)(?:(?!</\1>).)*?</\1>', '', html, flags=re.I | re.S)
    html = re.sub(r'[^.<>]*(?:egypt|مصر|cairo|القاهرة|\bEGP\b|جنيه|made in)[^.<>]*\.?', '', html, flags=re.I)
    return re.sub(r'<(ul|ol)>\s*</\1>', '', html).strip()


def main(bs_path, ah_path, out_path):
    bs = json.load(open(bs_path)); ah = json.load(open(ah_path))
    ah_titles = {norm(p['title']) for p in ah}
    ah_imgs = {img_key(i['src']) for p in ah for i in p['images']}
    ah_skus = {v['sku'] for p in ah for v in p['variants'] if v.get('sku')}
    out = []
    for p in bs:
        if not any(v['available'] for v in p['variants']):
            continue
        if norm(p['title']) in ah_titles or {img_key(i['src']) for i in p['images']} & ah_imgs \
                or {v['sku'] for v in p['variants'] if v.get('sku')} & ah_skus:
            continue
        opts = [o for o in p['options'] if o['name'] != 'Title']
        names = [('Size' if o['name'].lower().startswith('size') else o['name']) for o in opts]
        variants = []
        for v in p['variants']:
            vo = [{'optionName': n, 'name': v[f'option{i + 1}']} for i, n in enumerate(names)]
            variants.append({
                'optionValues': vo or [{'optionName': 'Title', 'name': 'Default Title'}],
                'price': sar(v['price']),
                'compareAtPrice': sar(v['compare_at_price']) if v.get('compare_at_price') and float(v['compare_at_price']) > float(v['price']) else None,
                'sku': v.get('sku') or None,
                'inventoryPolicy': 'DENY',
                'inventoryItem': {'tracked': True},
                'qty': 10 if v['available'] else 0,
            })
        out.append({
            'source_handle': p['handle'],
            'title': p['title'],
            'descriptionHtml': clean_body(p['body_html'], p['title']),
            'vendor': STORE if re.search(r'baba ?saleh', p['vendor'] or '', re.I) else p['vendor'],
            'productType': p['product_type'],
            'status': 'DRAFT',
            'productOptions': [{'name': n, 'values': [{'name': x} for x in o['values']]} for n, o in zip(names, opts)]
                              or [{'name': 'Title', 'values': [{'name': 'Default Title'}]}],
            'variants': variants,
            'images': [i['src'].split('?')[0] for i in p['images']],
            'scrubbed': bool(SCRUB.search(p['body_html'] or '')) and not re.search('egypt', p['title'], re.I),
        })
    json.dump(out, open(out_path, 'w'), ensure_ascii=False, indent=1)
    print(len(out), 'products,', sum(len(x['variants']) for x in out), 'variants ->', out_path)


if __name__ == '__main__':
    main(*sys.argv[1:4])

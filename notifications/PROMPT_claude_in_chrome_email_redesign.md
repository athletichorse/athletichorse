# Prompt for Claude in Chrome — redesign all Athletic Horse emails

Copy everything below the line into Claude in Chrome while logged in to Shopify admin (admin.shopify.com/store/sfypqe-qu).

---

You are working in my Shopify admin for **Athletic Horse – Alhisan Alriyadi (الحصان الرياضي)**, a sports equipment store in Saudi Arabia (athletic-horse.com). We sell with **cash on delivery only**, prices in SAR. I want every customer email redesigned in a modern, elegant style and **all phone numbers / WhatsApp links removed**.

## Goals
1. **Remove every phone number and WhatsApp link** from every email: any `wa.me/…`, `api.whatsapp.com`, `tel:` link, "WhatsApp us", "Call us", and any number like +966…, 05…, 966573873497, 966541770519, 966564816467. Replace support lines with: "Questions? Reply to this email or visit athletic-horse.com/pages/contact" (link to https://athletic-horse.com/pages/contact). Do not add any new phone number.
2. **Modern, elegant layout** for every email (details below), consistent across all of them.
3. **Do not break anything**: keep every Liquid variable, `{% if %}` / `{% for %}` block, order/line-item tables, discount, shipping, tracking, payment and customer-account logic exactly as they work today. Only change markup, styling and wording around them.

## Where to work (do all of them)
A. **Settings → Notifications → Customer notifications** — open every template in every group and edit it with "Edit code":
   - Order processing: Order confirmation, Draft order invoice, Shipping confirmation (and Shipping update), Out for delivery, Delivered, Local delivery / Ready for pickup emails if present
   - Order exceptions: Order edited, Order invoice, Order canceled, Order payment receipt, Refund, Payment error / Pending payment / Payment success if present
   - Abandoned checkout
   - Gift cards (Gift card created, Gift card receipt) if present
   - Customer account: Account invitation, Account activation/confirmation (welcome), Password reset, Customer account login code / magic link if present, Contact customer
   - Marketing: Customer marketing confirmation (double opt-in)
   - Returns: Return request, Return accepted/declined, Return label if present
   - Also check **Staff notifications → New order** (internal only: just remove phone numbers there; keep layout simple).
B. **Marketing → Automations** (Shopify Messaging / Shopify Email): open every automation — Abandoned checkout, Abandoned cart, Abandoned product browse, Welcome new subscribers, First purchase upsell / thank you, Win-back, and any other active or draft automation — and edit each email in its editor: remove phone/WhatsApp blocks, apply the same design (logo, colours, fonts, button style, footer). Keep each automation's trigger, delay, conditions and on/off status unchanged.
C. **Marketing → Campaigns → email templates** (if any saved templates exist): apply the same design and remove phone numbers.

## Design system (use exactly)
- Width: single centred card, max 600px, generous white space (32–40px padding desktop, 22px on mobile), rounded corners 16px, soft border `#E3E7E4`, page background `#F3F5F4`.
- Colours: text `#111614`, secondary text `#3D4641`, primary/brand green `#14532D`, dark green `#0F3D22`, soft green tint `#E7F0EA`, highlight lime `#B6F23A` (sparingly, e.g. a thin top bar or small badge), sale red `#D61F45` only for discounts.
- Logo at top, centred, 140–160px wide: https://athletic-horse.com/cdn/shop/files/alhisan-alriyadi-logo-transparent.png (link to https://athletic-horse.com). Below it a thin 4px lime (`#B6F23A`) accent bar or none — keep it subtle.
- Typography: system font stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` (no external font imports). Headline 24–26px bold, body 15–16px, line-height 1.6. Sentence case, no ALL CAPS paragraphs.
- Structure for transactional emails: logo → short headline (e.g. "Your order is confirmed") → one friendly sentence → order number + date in a light tint box → status progress (Confirmed → Shipped → Out for delivery → Delivered) as a simple 4-step line where relevant → main button → line items (image 64px, name, variant, qty, price) → totals (subtotal, shipping, discount in red, total bold) → shipping address → "Payment: Cash on delivery" note → help line (reply to email / contact page link) → footer.
- Buttons: solid `#14532D`, white text, 12px radius, 14px × 28px padding, full width on mobile; secondary links in `#14532D`.
- Footer: small grey text (`#3D4641`, 12–13px): "Alhisan Alriyadi · Jeddah, Saudi Arabia · athletic-horse.com", links to Shop, Contact, Returns policy (https://athletic-horse.com/policies/refund-policy). Unsubscribe link only where Shopify requires it (marketing emails) — keep Shopify's unsubscribe tag/block.
- Mobile-friendly (tables + inline styles, works in Gmail, Apple Mail, Outlook), supports dark mode (avoid white-on-white; logo must stay visible), no animations, no background images, accessible alt text on every image.
- Tone: warm, short, premium. Mention cash on delivery where payment is relevant ("Please have the amount ready when the courier arrives."). Never mention Egypt, and never say "Made in Egypt".

## Subjects and preheaders
Keep the Liquid variables in subjects (e.g. `{{ name }}`). Make them short and clean, for example:
- Order confirmation: `Order {{ name }} confirmed`
- Shipping confirmation: `Your order {{ name }} is on the way`
- Out for delivery: `Your order {{ name }} is out for delivery`
- Delivered: `Your order {{ name }} has been delivered`
- Abandoned checkout: `You left something in your cart`
Add a hidden preheader line at the top of each HTML email that summarises it in one sentence.

## Process for each template
1. Open it, copy the current code into a note first so nothing is lost.
2. Rebuild the layout with the design system above, moving over all existing Liquid logic unchanged.
3. Remove every phone/WhatsApp mention (search the code for `wa.me`, `whatsapp`, `tel:`, `966`, `+966`, `05`).
4. Click **Preview**, check desktop and mobile width, then **Save**.
5. For the main ones (Order confirmation, Shipping confirmation, Out for delivery, Delivered, Abandoned checkout, Account invitation, Password reset) use **Send test email** to info@athletic-horse.com.
6. Keep a checklist and report at the end: every template/automation name → done / skipped (with reason), and anything you could not change.

## Don'ts
- Don't change sender name/email, store settings, automation triggers/timing, discounts, or turn any notification/automation on or off.
- Don't edit the **Arabic** translations (Translate & Adapt / languages). Only the default (English) templates. The Arabic versions will be redone separately to match.
- Don't delete any notification. Don't add tracking pixels or external scripts.

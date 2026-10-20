"""Build branded Shopify notification templates (English + Arabic) for Athletic Horse.

English files go in notifications/en/ to paste into Shopify admin → Settings → Notifications.
Arabic versions are written to notifications/ar/ and registered as translations through the
Admin API (EMAIL_TEMPLATE translatable resources), so Arabic-speaking customers receive them.

Run: python3 notifications/build.py
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
GREEN = '#14532D'
GREEN_DEEP = '#0F3D22'
LIME = '#B6F23A'
INK = '#101814'
TEXT = '#3B4640'
MUTED = '#6B7770'
LINE = '#E3E9E5'
TINT = '#F2F7F3'
PAGE = '#EDF1EE'
LOGO_WHITE = 'https://cdn.shopify.com/s/files/1/0847/8952/6778/files/alhisan-alriyadi-logo-white.png?v=1792476034'
WHATSAPP = 'https://wa.me/966573873497'

SOCIAL = [
    ('Snapchat', 'https://www.snapchat.com/@athletic_horse'),
    ('TikTok', 'https://www.tiktok.com/@athletic_horse'),
    ('Instagram', 'https://www.instagram.com/athletic_horseksa'),
    ('Facebook', 'https://www.facebook.com/share/1BPrXjSdpZ/'),
]

T = {
    'en': {
        'dir': 'ltr', 'align': 'left', 'end': 'right',
        'font': "'Quicksand','Segoe UI',Helvetica,Arial,sans-serif",
        'order': 'Order', 'qty': 'Qty', 'subtotal': 'Subtotal', 'shipping': 'Delivery', 'discount': 'Discount',
        'tax': 'VAT included', 'total': 'Total', 'ship_to': 'Delivering to', 'pay': 'Payment',
        'cod_title': 'Cash on delivery', 'cod_text': 'Please have the amount ready when your order arrives.',
        'items': 'Your items', 'summary': 'Order summary',
        'help': 'Need a hand?', 'help_text': 'Our team replies fast on WhatsApp, every day.', 'help_btn': 'Chat on WhatsApp',
        'legal': 'شركة الحصان الرياضي · CR 7053046608 · VAT 314498395700003',
        'address': 'Al Boghdadiyah Al Sharqiyah, Jeddah, Saudi Arabia', 'view_order': 'View your order',
        'returns': '3-day returns', 'perk2': 'Cash on delivery', 'perk3': 'Delivery across KSA',
        'steps': ['Confirmed', 'Shipped', 'On the way', 'Delivered'],
    },
    'ar': {
        'dir': 'rtl', 'align': 'right', 'end': 'left',
        'font': "'Readex Pro',Tahoma,Arial,sans-serif",
        'order': 'الطلب', 'qty': 'الكمية', 'subtotal': 'المجموع الفرعي', 'shipping': 'التوصيل', 'discount': 'الخصم',
        'tax': 'شامل ضريبة القيمة المضافة', 'total': 'الإجمالي', 'ship_to': 'عنوان التوصيل', 'pay': 'طريقة الدفع',
        'cod_title': 'الدفع عند الاستلام', 'cod_text': 'يرجى تجهيز المبلغ عند وصول طلبك.',
        'items': 'منتجاتك', 'summary': 'ملخص الطلب',
        'help': 'تحتاج مساعدة؟', 'help_text': 'فريقنا يرد بسرعة عبر واتساب يومياً.', 'help_btn': 'تواصل عبر واتساب',
        'legal': 'شركة الحصان الرياضي · س.ت 7053046608 · الرقم الضريبي 314498395700003',
        'address': 'البغدادية الشرقية، جدة، المملكة العربية السعودية', 'view_order': 'عرض طلبك',
        'returns': 'إرجاع خلال 3 أيام', 'perk2': 'الدفع عند الاستلام', 'perk3': 'توصيل لكل المملكة',
        'steps': ['تم التأكيد', 'تم الشحن', 'في الطريق', 'تم التوصيل'],
    },
}


def money(expr):
    # Keep currency amounts left-to-right inside Arabic text
    return '<span dir="ltr" style="unicode-bidi:isolate;white-space:nowrap">{{ %s | money }}</span>' % expr


def button(lang, url_expr, label, secondary=False):
    bg, fg, bd = (('#FFFFFF', GREEN, GREEN) if secondary else (GREEN, '#FFFFFF', GREEN))
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 4px"><tr><td class="ah-btn" bgcolor="{bg}" style="border-radius:12px;background:{bg}{'' if not secondary else ';box-shadow:inset 0 0 0 2px ' + bd}">
<a href="{url_expr}" style="display:inline-block;padding:15px 34px;font-family:{T[lang]['font']};font-size:15px;font-weight:700;color:{fg};text-decoration:none;border-radius:12px;border:2px solid {bd}">{label}</a></td></tr></table>'''


def section_title(lang, text):
    return f'<p class="ah-muted" style="margin:32px 0 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{MUTED}">{text}</p>'


def items(lang, loop, title, qty, price, image, variant, label=None):
    t = T[lang]
    price_td = ('<td class="ah-ink" style="padding:12px 0;vertical-align:middle;font-size:15px;font-weight:700;color:' + INK +
                ';white-space:nowrap;text-align:' + t['end'] + '{% unless forloop.last %};border-bottom:1px solid ' + LINE + '{% endunless %}">' +
                money(price) + '</td>') if price else ''
    pre = ''
    if loop == 'subtotal_line_items':
        pre = '{% assign ah_lines = subtotal_line_items %}{% if ah_lines == blank or ah_lines.size == 0 %}{% assign ah_lines = line_items %}{% endif %}'
        loop = 'ah_lines'
    return pre + '{% if ' + loop + '.size > 0 %}' + section_title(lang, label or t['items']) + f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
{{% for line in {loop} %}}
<tr>
  <td width="76" style="padding:12px 0;vertical-align:middle{{% unless forloop.last %}};border-bottom:1px solid {LINE}{{% endunless %}}">{{% if {image} %}}<img src="{{{{ {image} | img_url: '160x160' }}}}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;border-radius:14px;background:{TINT};object-fit:contain;border:1px solid {LINE}">{{% endif %}}</td>
  <td style="padding:12px 14px;vertical-align:middle;text-align:{t['align']}{{% unless forloop.last %}};border-bottom:1px solid {LINE}{{% endunless %}}">
    <span class="ah-ink" style="display:block;font-size:15px;font-weight:700;color:{INK};line-height:1.35">{{{{ {title} }}}}</span>
    {{% if {variant} != blank and {variant} != 'Default Title' %}}<span class="ah-muted" style="display:block;font-size:13px;color:{MUTED};margin-top:2px">{{{{ {variant} }}}}</span>{{% endif %}}
    <span style="display:inline-block;margin-top:6px;padding:2px 10px;border-radius:999px;background:{TINT};font-size:12px;font-weight:700;color:{GREEN}">{t['qty']} {{{{ {qty} }}}}</span>
  </td>
  {price_td}
</tr>
{{% endfor %}}
</table>{{% endif %}}'''


def totals(lang):
    t = T[lang]
    def row(label, expr, cond=None, neg=False):
        val = money(expr).replace('{{', '−{{', 1) if neg else money(expr)
        r = (f'<tr><td class="ah-muted" style="padding:5px 0;font-size:14px;color:{MUTED};text-align:{t["align"]}">{label}</td>'
             f'<td class="ah-ink" style="padding:5px 0;font-size:14px;font-weight:600;color:{INK};text-align:{t["end"]}">{val}</td></tr>')
        return (f'{{% if {cond} %}}' + r + '{% endif %}') if cond else r
    return (section_title(lang, t['summary']) +
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-tint" style="background:{TINT};border-radius:16px"><tr><td style="padding:18px 20px">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
            row(t['subtotal'], 'subtotal_price') +
            row(t['discount'], 'total_discounts', 'total_discounts > 0', neg=True) +
            row(t['shipping'], 'shipping_price', 'shipping_price') +
            f'<tr><td colspan="2" style="padding:10px 0 0"><div style="border-top:1px dashed #C9D5CD;height:1px;line-height:1px">&nbsp;</div></td></tr>'
            f'<tr><td class="ah-ink" style="padding:10px 0 0;font-size:17px;font-weight:700;color:{INK};text-align:{t["align"]}">{t["total"]}</td>'
            f'<td style="padding:10px 0 0;font-size:22px;font-weight:700;color:{GREEN};text-align:{t["end"]}" class="ah-accent">{money("total_price")}</td></tr>'
            f'{{% if tax_price > 0 %}}<tr><td colspan="2" class="ah-muted" style="padding:2px 0 0;font-size:12px;color:{MUTED};text-align:{t["end"]}">{t["tax"]} {money("tax_price")}</td></tr>{{% endif %}}'
            '</table></td></tr></table>')


def info(lang, with_address=True, with_payment=True):
    t = T[lang]
    addr = (f'{{% if shipping_address %}}<td class="ah-col" width="50%" valign="top" style="padding:0 6px">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-box" style="border:1px solid {LINE};border-radius:16px"><tr><td style="padding:16px 18px;text-align:{t["align"]}">'
            f'<span class="ah-muted" style="display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{MUTED};margin-bottom:6px">{t["ship_to"]}</span>'
            f'<span class="ah-ink" dir="auto" style="display:block;font-size:14px;line-height:1.55;color:{INK}">{{{{ shipping_address | format_address }}}}</span></td></tr></table></td>{{% endif %}}') if with_address else ''
    pay = '' if not with_payment else (f'<td class="ah-col" width="50%" valign="top" style="padding:0 6px">'
           f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-box" style="border:1px solid {LINE};border-radius:16px"><tr><td style="padding:16px 18px;text-align:{t["align"]}">'
           f'<span class="ah-muted" style="display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:{MUTED};margin-bottom:6px">{t["pay"]}</span>'
           f'<span class="ah-ink" style="display:block;font-size:15px;font-weight:700;color:{INK}">💵 {t["cod_title"]}</span>'
           f'<span class="ah-muted" style="display:block;font-size:13px;line-height:1.5;color:{MUTED};margin-top:4px">{t["cod_text"]}</span></td></tr></table></td>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px"><tr><td style="padding:0 0;margin:0 -6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>{addr}{pay}</tr></table></td></tr></table>'


def progress(lang, step):
    """Order journey tracker: Confirmed → Shipped → On the way → Delivered. step is 1-4."""
    t = T[lang]
    cells = ''
    for i, label in enumerate(t['steps'], start=1):
        on = i <= step
        dot_bg, dot_fg = (GREEN, '#FFFFFF') if on else ('#FFFFFF', '#A9B5AE')
        bar = GREEN if i <= step else LINE
        cells += (f'<td width="25%" valign="top" style="text-align:center;padding:0 2px">'
                  f'<div class="{"" if on else "ah-off"}" style="height:4px;line-height:4px;border-radius:4px;background:{bar};margin-bottom:10px">&nbsp;</div>'
                  f'<span class="{"" if on else "ah-dot-off"}" style="display:inline-block;width:26px;height:26px;line-height:26px;border-radius:50%;background:{dot_bg};color:{dot_fg};border:2px solid {GREEN if on else LINE};font-size:12px;font-weight:700">{"✓" if i < step or (on and i == 4) else i}</span>'
                  f'<span class="{"ah-ink" if on else "ah-muted"}" style="display:block;margin-top:6px;font-size:12px;font-weight:{700 if i == step else 500};color:{INK if on else MUTED}">{label}</span></td>')
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 4px"><tr>{cells}</tr></table>'


def layout(lang, title, body):
    t = T[lang]
    socials = ' &nbsp;·&nbsp; '.join(f'<a href="{url}" style="color:{GREEN};font-weight:700;text-decoration:none" class="ah-accent">{name}</a>' for name, url in SOCIAL)
    fonts = ('https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap' if lang == 'en'
             else 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;500;600;700&display=swap')
    perk = lambda txt: f'<td align="center" style="padding:0 6px;font-size:12px;font-weight:700;color:{GREEN}" class="ah-accent">✓ {txt}</td>'
    return f'''<!DOCTYPE html>
<html lang="{lang}" dir="{t['dir']}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{title}</title>
<link href="{fonts}" rel="stylesheet">
<style>
  body {{ margin:0; padding:0; background:{PAGE}; -webkit-text-size-adjust:100%; }}
  a {{ color:{GREEN}; }}
  @media (max-width: 620px) {{
    .ah-pad {{ padding:28px 22px !important; }}
    .ah-col {{ display:block !important; width:100% !important; padding:0 0 12px 0 !important; }}
    .ah-h1 {{ font-size:24px !important; }}
  }}
  @media (prefers-color-scheme: dark) {{
    .ah-bg {{ background:#0B110D !important; }}
    .ah-card, .ah-card-td {{ background:#141C17 !important; }}
    .ah-ink {{ color:#EEF3EF !important; }}
    .ah-text {{ color:#C9D3CC !important; }}
    .ah-muted {{ color:#9AA8A0 !important; }}
    .ah-tint {{ background:#1B2620 !important; }}
    .ah-box {{ border-color:#2A3730 !important; }}
    .ah-accent {{ color:{LIME} !important; }}
    .ah-foot {{ background:#101712 !important; border-color:#2A3730 !important; }}
    .ah-card-td td {{ border-color:#2A3730 !important; }}
    .ah-off {{ background:#2A3730 !important; }}
    .ah-dot-off {{ background:#141C17 !important; border-color:#2A3730 !important; color:#6F7D75 !important; }}
  }}
  [data-ogsc] .ah-ink {{ color:#EEF3EF !important; }}
  [data-ogsc] .ah-text {{ color:#C9D3CC !important; }}
  [data-ogsc] .ah-muted {{ color:#9AA8A0 !important; }}
  [data-ogsc] .ah-accent {{ color:{LIME} !important; }}
  [data-ogsb] .ah-card-td {{ background:#141C17 !important; }}
  [data-ogsb] .ah-tint {{ background:#1B2620 !important; }}
</style>
</head>
<body dir="{t['dir']}" class="ah-bg" style="margin:0;padding:0;background:{PAGE}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-bg" style="background:{PAGE}"><tr><td align="center" style="padding:28px 10px">
<table role="presentation" class="ah-card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:24px;overflow:hidden;font-family:{t['font']}">
  <tr><td bgcolor="{GREEN}" style="background:{GREEN};background-image:linear-gradient(135deg,{GREEN} 0%,{GREEN_DEEP} 100%);padding:30px 28px 26px;text-align:center">
    <a href="{{{{ shop.url }}}}" style="text-decoration:none"><img src="{LOGO_WHITE}" alt="{{{{ shop.name }}}}" width="200" style="display:inline-block;width:200px;max-width:70%;height:auto;border:0"></a>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:18px auto 0"><tr><td style="width:44px;height:4px;line-height:4px;border-radius:4px;background:{LIME}">&nbsp;</td></tr></table>
  </td></tr>
  <tr><td class="ah-pad ah-card-td" style="padding:38px 40px 34px;background:#FFFFFF;text-align:{t['align']};color:{INK}">
{body}
  </td></tr>
  <tr><td class="ah-card-td" style="padding:0 40px 30px;background:#FFFFFF">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-tint" style="background:{TINT};border-radius:18px"><tr><td style="padding:22px 24px;text-align:center">
      <p class="ah-ink" style="margin:0;font-size:17px;font-weight:700;color:{INK}">{t['help']}</p>
      <p class="ah-muted" style="margin:4px 0 14px;font-size:14px;color:{MUTED}">{t['help_text']}</p>
      <a href="{WHATSAPP}" style="display:inline-block;padding:12px 24px;border-radius:12px;background:#1FA855;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:none">{t['help_btn']}</a>
    </td></tr></table>
  </td></tr>
  <tr><td class="ah-foot" style="padding:22px 28px 28px;background:#F7F9F8;text-align:center;border-top:1px solid {LINE}">
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px"><tr>{perk(t['returns'])}{perk(t['perk2'])}{perk(t['perk3'])}</tr></table>
    <p style="margin:0 0 12px;font-size:13px">{socials}</p>
    <p class="ah-muted" style="margin:0 0 4px;font-size:11.5px;color:{MUTED}">{t['legal']}</p>
    <p class="ah-muted" style="margin:0;font-size:11.5px;color:{MUTED}">{t['address']} · <a href="{{{{ shop.url }}}}" style="color:{MUTED}">{{{{ shop.url | remove: 'https://' }}}}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>'''


def heading(lang, title, text, icon=None):
    t = T[lang]
    badge = (f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px"><tr><td style="width:64px;height:64px;border-radius:50%;background:{LIME};text-align:center;font-size:30px;line-height:64px">{icon}</td></tr></table>') if icon else ''
    return (badge +
            f'<h1 class="ah-ink ah-h1" style="margin:0 0 10px;font-size:28px;line-height:1.25;font-weight:700;color:{INK};text-align:center">{title}</h1>'
            f'<p class="ah-text" style="margin:0 auto;max-width:460px;font-size:15.5px;line-height:1.7;color:{TEXT};text-align:center">{text}</p>')


def order_tag(lang):
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px"><tr><td class="ah-tint ah-accent" style="padding:6px 14px;border-radius:999px;background:{TINT};font-size:12.5px;font-weight:700;color:{GREEN};letter-spacing:.03em">'
            f'{T[lang]["order"]} <span dir="ltr">{{{{ order_name | default: name }}}}</span></td></tr></table>')


LINE_ORDER = dict(loop='subtotal_line_items', title='line.title', qty='line.quantity', price='line.final_line_price', image='line.image', variant='line.variant.title')
LINE_FULFIL = dict(loop='fulfillment.fulfillment_line_items', title='line.line_item.title', qty='line.quantity', price=None, image='line.line_item.image', variant='line.line_item.variant.title')

def tracking(lang):
    t = T[lang]
    label = 'Track your shipment' if lang == 'en' else 'تتبّع شحنتك'
    carrier = 'Carrier' if lang == 'en' else 'شركة الشحن'
    number = 'Tracking number' if lang == 'en' else 'رقم التتبع'
    return (f'{{% if fulfillment.tracking_numbers.size > 0 %}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-box" style="margin-top:22px;border:1px solid {LINE};border-radius:16px"><tr><td style="padding:14px 18px;text-align:{t["align"]};font-size:14px">'
            f'{{% if fulfillment.tracking_company %}}<span class="ah-muted" style="color:{MUTED}">{carrier}</span> <strong class="ah-ink" style="color:{INK}">{{{{ fulfillment.tracking_company }}}}</strong><br>{{% endif %}}'
            f'<span class="ah-muted" style="color:{MUTED}">{number}</span> <strong class="ah-ink" dir="ltr" style="color:{INK}">{{{{ fulfillment.tracking_numbers.first }}}}</strong></td></tr></table>{{% endif %}}'
            f'{{% if fulfillment.tracking_url %}}{button(lang, "{{ fulfillment.tracking_url }}", label, secondary=True)}{{% endif %}}')


def receipt(lang):
    """Payment receipt details: amount, method and order, as a summary card."""
    t = T[lang]
    lbl = {'en': ('Amount paid', 'Payment method', 'Order'), 'ar': ('المبلغ المدفوع', 'طريقة الدفع', 'الطلب')}[lang]
    row = lambda k, v, big=False: (f'<tr><td class="ah-muted" style="padding:6px 0;font-size:14px;color:{MUTED};text-align:{t["align"]}">{k}</td>'
                                   f'<td class="{"ah-accent" if big else "ah-ink"}" style="padding:6px 0;font-size:{22 if big else 14}px;font-weight:700;color:{GREEN if big else INK};text-align:{t["end"]}">{v}</td></tr>')
    method = ('{% if transaction.payment_details.payment_method_display_name %}{{ transaction.payment_details.payment_method_display_name }}'
              '{% elsif transaction.payment_details.credit_card_company %}{{ transaction.payment_details.credit_card_company }} •••• {{ transaction.payment_details.credit_card_last_four_digits }}'
              '{% else %}{{ transaction.gateway_display_name }}{% endif %}')
    return (section_title(lang, 'Payment details' if lang == 'en' else 'تفاصيل الدفع') +
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="ah-tint" style="background:{TINT};border-radius:16px"><tr><td style="padding:18px 20px">'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' +
            row(lbl[0], money('transaction.amount'), big=True) +
            f'<tr><td colspan="2" style="padding:8px 0 4px"><div style="border-top:1px dashed #C9D5CD;height:1px;line-height:1px">&nbsp;</div></td></tr>' +
            row(lbl[1], method) +
            row(lbl[2], '<span dir="ltr">{{ order_name | default: name }}</span>') +
            '</table></td></tr></table>')


def unsubscribe(lang):
    label = 'Unsubscribe from these reminders' if lang == 'en' else 'إلغاء الاشتراك في هذه التذكيرات'
    return (f'{{% if unsubscribe_url %}}<p class="ah-muted" style="margin:28px 0 0;font-size:12px;color:{MUTED};text-align:center">'
            f'<a href="{{{{ unsubscribe_url }}}}" style="color:{MUTED}">{label}</a></p>{{% endif %}}')


def H(L, en, ar, icon=None):
    return heading(L, *({'en': en, 'ar': ar}[L]), icon=icon)


VIEW = lambda L: button(L, '{{ order_status_url }}', T[L]['view_order'])

TEMPLATES = [
    # id, key, subject en, subject ar, body builder
    ('43561615610', 'order_confirmation', 'Order {{ name }} confirmed ✅', 'تم تأكيد طلبك {{ name }} ✅',
     lambda L: order_tag(L) + H(L, ('Thanks for your order!', "Hi {{ customer.first_name }}, we've got your order and we're getting it ready. We'll message you as soon as it's on the way."),
                                ('شكراً لطلبك!', 'مرحباً {{ customer.first_name }}، استلمنا طلبك ونقوم بتجهيزه الآن، وسنبلغك فور خروجه للتوصيل.'), '🎉')
     + progress(L, 1) + VIEW(L) + items(L, **LINE_ORDER) + totals(L) + info(L)),
    ('43562008826', 'order_edited', 'Order {{ name }} updated', 'تم تحديث طلبك {{ name }}',
     lambda L: order_tag(L) + H(L, ('Your order was updated', 'Hi {{ customer.first_name }}, here are the latest details of your order.'),
                                ('تم تحديث طلبك', 'مرحباً {{ customer.first_name }}، إليك أحدث تفاصيل طلبك.'), '✏️')
     + items(L, **LINE_ORDER) + totals(L) + VIEW(L)),
    ('43562041594', 'order_canceled', 'Order {{ name }} has been canceled', 'تم إلغاء طلبك {{ name }}',
     lambda L: order_tag(L) + H(L, ('Your order was canceled', 'Hi {{ customer.first_name }}, order {{ name }} has been canceled. You chose cash on delivery, so nothing was charged. Want to order again? We\'re happy to help on WhatsApp.'),
                                ('تم إلغاء طلبك', 'مرحباً {{ customer.first_name }}، تم إلغاء طلبك {{ name }}. بما أنك اخترت الدفع عند الاستلام فلم يُخصم أي مبلغ. ترغب في الطلب مجدداً؟ يسعدنا مساعدتك عبر واتساب.'), '↩️')
     + items(L, **LINE_ORDER)),
    ('43562107130', 'refund', 'Refund for order {{ name }}', 'استرداد مبلغ الطلب {{ name }}',
     lambda L: order_tag(L) + H(L, ('Your refund is on its way', 'We\'ve refunded <strong>' + money('amount') + '</strong> for your order. Depending on the method, it can take up to 10 days to arrive.'),
                                ('تم استرداد المبلغ', 'تم استرداد <strong>' + money('amount') + '</strong> لطلبك. قد يستغرق وصوله حتى 10 أيام حسب طريقة الاسترداد.'), '💸')),
    ('43561648378', 'draft_invoice', 'Your order from {{ shop.name }} is ready', 'طلبك من الحصان الرياضي جاهز',
     lambda L: H(L, ('Your order is ready', '{% if custom_message != blank %}{{ custom_message }}{% else %}We\'ve prepared your order. Confirm it below and pay cash on delivery.{% endif %}'),
                    ('طلبك جاهز', '{% if custom_message != blank %}{{ custom_message }}{% else %}جهّزنا طلبك. أكّده من الزر أدناه وادفع عند الاستلام.{% endif %}'), '🧾')
     + button(L, '{{ invoice_url }}', 'Confirm your order' if L == 'en' else 'تأكيد الطلب') + items(L, **LINE_ORDER) + totals(L)),
    ('43561976058', 'order_invoice', 'Invoice for order {{ name }}', 'فاتورة الطلب {{ name }}',
     lambda L: order_tag(L) + H(L, ('Your invoice is ready', 'Hi {{ customer.first_name | default: billing_address.first_name }}, here is the invoice for your order. Amount due: <strong>' + money('order.total_outstanding | default: total_price') + '</strong>.{% if custom_message != blank %}<br><br>{{ custom_message }}{% endif %}'),
                                ('فاتورتك جاهزة', 'مرحباً {{ customer.first_name | default: billing_address.first_name }}، إليك فاتورة طلبك. المبلغ المستحق: <strong>' + money('order.total_outstanding | default: total_price') + '</strong>.{% if custom_message != blank %}<br><br>{{ custom_message }}{% endif %}'), '🧾')
     + button(L, '{{ checkout_payment_collection_url }}', 'Pay invoice' if L == 'en' else 'ادفع الفاتورة')
     + items(L, **LINE_ORDER) + totals(L) + info(L, with_payment=False)),
    ('43562074362', 'payment_receipt', 'Payment received for order {{ order_name | default: name }} ✅', 'تم استلام دفعة الطلب {{ order_name | default: name }} ✅',
     lambda L: order_tag(L) + H(L, ('Payment received', 'Thank you{% if customer.first_name %}, {{ customer.first_name }}{% endif %}! We\'ve received your payment for this order.'),
                                ('تم استلام الدفعة', 'شكراً لك{% if customer.first_name %} يا {{ customer.first_name }}{% endif %}! استلمنا دفعتك لهذا الطلب.'), '✅')
     + receipt(L) + VIEW(L)),
    ('43562139898', 'abandoned_checkout', 'You left something in your cart', 'نسيت شيئاً في سلتك',
     lambda L: H(L, ('Still thinking it over?', 'Hi{% if billing_address.first_name != blank %} {{ billing_address.first_name }}{% else %} there{% endif %}, your items are waiting. Finish your order now and pay cash when it reaches your door.'),
                    ('ما زلت تفكر؟', 'مرحباً{% if billing_address.first_name != blank %} {{ billing_address.first_name }}{% endif %}، منتجاتك بانتظارك. أكمل طلبك الآن وادفع نقداً عند وصوله إلى بابك.'), '🛒')
     + button(L, '{{ url }}', 'Complete your order' if L == 'en' else 'أكمل طلبك')
     + items(L, loop='subtotal_line_items', title='line.title', qty='line.quantity', price=None, image='line.image', variant='line.variant.title')
     + unsubscribe(L)),
    ('43561681146', 'shipping_confirmation', 'Your order {{ name }} is on the way 🚚', 'طلبك {{ name }} في الطريق إليك 🚚',
     lambda L: order_tag(L) + H(L, ('Your order is on the way!', 'Good news, {{ customer.first_name }}! Your order has shipped. Please have the amount ready for cash on delivery.'),
                                ('طلبك في الطريق!', 'خبر سار يا {{ customer.first_name }}! تم شحن طلبك. يرجى تجهيز المبلغ للدفع عند الاستلام.'), '🚚')
     + progress(L, 2) + tracking(L) + items(L, **LINE_FULFIL) + VIEW(L)),
    ('43562565882', 'shipping_update', 'Shipping update for order {{ name }}', 'تحديث شحن الطلب {{ name }}',
     lambda L: order_tag(L) + H(L, ('Your shipping details changed', 'Here is the latest tracking information for your order.'),
                                ('تم تحديث معلومات الشحن', 'إليك أحدث معلومات التتبع لطلبك.'), '📍')
     + progress(L, 2) + tracking(L) + items(L, **LINE_FULFIL)),
    ('43562598650', 'out_for_delivery', 'Order {{ name }} is out for delivery 📦', 'طلبك {{ name }} خرج للتوصيل 📦',
     lambda L: order_tag(L) + H(L, ('Arriving today!', 'Your order is out for delivery. ' + T['en']['cod_text']),
                                ('يصلك اليوم!', 'طلبك خرج للتوصيل. ' + T['ar']['cod_text']), '📦')
     + progress(L, 3) + tracking(L) + items(L, **LINE_FULFIL)),
    ('43561779450', 'local_out_for_delivery', 'Order {{ name }} is out for delivery 📦', 'طلبك {{ name }} خرج للتوصيل 📦',
     lambda L: order_tag(L) + H(L, ('Arriving today!', 'Your order is out for delivery. ' + T['en']['cod_text']),
                                ('يصلك اليوم!', 'طلبك خرج للتوصيل. ' + T['ar']['cod_text']), '📦')
     + progress(L, 3) + VIEW(L)),
    ('43562631418', 'delivered', 'Order {{ name }} has been delivered 🎉', 'تم توصيل طلبك {{ name }} 🎉',
     lambda L: order_tag(L) + H(L, ('Delivered. Enjoy your gear!', 'Your order has arrived. Not quite right? You can return it within 3 days.'),
                                ('تم التوصيل. استمتع بمعداتك!', 'وصل طلبك. لم يناسبك؟ يمكنك إرجاعه خلال 3 أيام.'), '🏆')
     + progress(L, 4) + items(L, **LINE_FULFIL)),
    ('43561812218', 'local_delivered', 'Order {{ name }} has been delivered 🎉', 'تم توصيل طلبك {{ name }} 🎉',
     lambda L: order_tag(L) + H(L, ('Delivered. Enjoy your gear!', 'Your order has arrived. Not quite right? You can return it within 3 days.'),
                                ('تم التوصيل. استمتع بمعداتك!', 'وصل طلبك. لم يناسبك؟ يمكنك إرجاعه خلال 3 أيام.'), '🏆')
     + progress(L, 4) + VIEW(L)),
    ('43562926330', 'account_activation', 'Activate your {{ shop.name }} account', 'فعّل حسابك في الحصان الرياضي',
     lambda L: H(L, ('Activate your account', '{% if custom_message != blank %}{{ custom_message }}{% else %}Create your password to track orders and check out faster.{% endif %}'),
                    ('فعّل حسابك', '{% if custom_message != blank %}{{ custom_message }}{% else %}أنشئ كلمة المرور لتتبع طلباتك وإتمام الشراء بشكل أسرع.{% endif %}'), '🔑')
     + button(L, '{{ customer.account_activation_url }}', 'Activate account' if L == 'en' else 'تفعيل الحساب')),
    ('43562959098', 'account_welcome', 'Welcome to {{ shop.name }}!', 'أهلاً بك في الحصان الرياضي!',
     lambda L: H(L, ('Welcome to the team!', 'Your account is ready. Sign in next time for faster checkout and easy order tracking.'),
                    ('أهلاً بك في الفريق!', 'حسابك جاهز. سجّل الدخول في المرة القادمة لإتمام الشراء بسرعة وتتبع طلباتك بسهولة.'), '🙌')
     + button(L, '{{ shop.url }}', 'Start shopping' if L == 'en' else 'ابدأ التسوق')),
    ('43562991866', 'password_reset', 'Reset your {{ shop.name }} password', 'إعادة تعيين كلمة المرور',
     lambda L: H(L, ('Reset your password', "Tap the button below to choose a new password. If you didn't ask for this, you can ignore this email."),
                    ('إعادة تعيين كلمة المرور', 'اضغط الزر أدناه لاختيار كلمة مرور جديدة. إذا لم تطلب ذلك يمكنك تجاهل هذه الرسالة.'), '🔒')
     + button(L, '{{ customer.reset_password_url }}', 'Reset password' if L == 'en' else 'إعادة التعيين')),
    ('43563221242', 'contact_customer', 'Message from {{ shop.name }}', 'رسالة من الحصان الرياضي',
     lambda L: f'<div class="ah-text" style="font-size:15.5px;line-height:1.75;color:{TEXT}">{{{{ custom_message }}}}</div>'),
    ('43563254010', 'marketing_confirmation', 'Confirm your subscription', 'أكّد اشتراكك',
     lambda L: H(L, ('One more step', 'Confirm your email to hear first about new arrivals, offers and team deals.'),
                    ('خطوة أخيرة', 'أكّد بريدك لتصلك المنتجات الجديدة والعروض وصفقات الفرق أولاً.'), '✉️')
     + button(L, '{{ customer.subscribe_url }}', 'Confirm subscription' if L == 'en' else 'تأكيد الاشتراك')),
]

STAFF_NEW_ORDER = layout('en', 'New order {{ name }}', (
    order_tag('en') + heading('en', 'New order: ' + money('total_price'), '{{ customer.first_name }} {{ customer.last_name }} just ordered. Payment: cash on delivery.', icon='🛍️')
    + '{% if attributes["Came from"] %}<p class="ah-text" style="margin:14px 0 0;font-size:14px;color:' + TEXT + ';text-align:center">Came from <strong>{{ attributes["Came from"] }}</strong>{% if attributes["Last source"] %} · last visit from <strong>{{ attributes["Last source"] }}</strong>{% endif %}</p>{% endif %}'
    + button('en', '{{ shop.url }}/admin/orders/{{ id }}', 'Open in Shopify admin')
    + items('en', loop='line_items', title='line.title', qty='line.quantity', price='line.final_line_price', image='line.image', variant='line.variant.title')
    + totals('en') + info('en')))


# Abandoned cart (no checkout started yet). Shopify Email automations; same Liquid objects as the
# abandoned checkout email, with the button sending the shopper back to their cart.
ABANDONED_CART = ('You left something in your cart', 'نسيت شيئاً في سلتك',
    lambda L: H(L, ('Your cart is waiting', 'Hi{% if billing_address.first_name != blank %} {{ billing_address.first_name }}{% else %} there{% endif %}, you left a few things in your cart. They are still available, but stock is limited.'),
                   ('سلتك بانتظارك', 'مرحباً{% if billing_address.first_name != blank %} {{ billing_address.first_name }}{% endif %}، تركت بعض المنتجات في سلتك. ما زالت متوفرة لكن الكمية محدودة.'), '🛒')
    + button(L, '{{ url | default: shop.url | append: "/cart" }}', 'Back to your cart' if L == 'en' else 'العودة إلى السلة')
    + items(L, loop='subtotal_line_items', title='line.title', qty='line.quantity', price=None, image='line.image', variant='line.variant.title')
    + unsubscribe(L))


def slim(html):
    """Drop font-family from inner tags; it is inherited from the surrounding table cells."""
    return re.sub(r'<(h1|p|a|span|strong|div)([^>]*?) style="([^"]*?)font-family:[^;"]*;?', r'<\1\2 style="\3', html)


def main():
    out = {'en': {}, 'ar': {}}
    for lang in ('en', 'ar'):
        os.makedirs(os.path.join(HERE, lang), exist_ok=True)
    for rid, key, sub_en, sub_ar, body in TEMPLATES:
        for lang, sub in (('en', sub_en), ('ar', sub_ar)):
            html = slim(layout(lang, sub, body(lang)))
            with open(os.path.join(HERE, lang, key + '.liquid'), 'w') as f:
                f.write(html)
            out[lang][rid] = {'key': key, 'title': sub, 'body_html': html}
    for lang, sub in (('en', ABANDONED_CART[0]), ('ar', ABANDONED_CART[1])):
        with open(os.path.join(HERE, lang, 'abandoned_cart.liquid'), 'w') as f:
            f.write(slim(layout(lang, sub, ABANDONED_CART[2](lang))))
    with open(os.path.join(HERE, 'en', 'staff_new_order.liquid'), 'w') as f:
        f.write(STAFF_NEW_ORDER)
    with open(os.path.join(HERE, 'templates.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False)
    print('built', len(TEMPLATES), 'templates x 2 languages')


if __name__ == '__main__':
    main()

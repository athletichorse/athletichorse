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
LIME = '#B6F23A'
INK = '#0B0F0C'
MUTED = '#5B6660'
LINE = '#E6EAE7'
TINT = '#F3F8EE'

SOCIAL = [
    ('Snapchat', 'https://www.snapchat.com/@athletic_horse', '#FFFC00', '#111111'),
    ('TikTok', 'https://www.tiktok.com/@athletic_horse', '#111111', '#FFFFFF'),
    ('Instagram', 'https://www.instagram.com/athletic_horseksa', '#FFFFFF', INK),
    ('WhatsApp', 'https://wa.me/966541770519', '#FFFFFF', INK),
]

T = {
    'en': {
        'dir': 'ltr', 'align': 'left', 'font': "'Readex Pro', Arial, Helvetica, sans-serif",
        'order': 'Order', 'qty': 'Qty', 'subtotal': 'Subtotal', 'shipping': 'Delivery', 'discount': 'Discount',
        'tax': 'VAT', 'total': 'Total', 'ship_to': 'Delivering to', 'cod_title': 'Cash on delivery',
        'cod_text': 'Please have the exact amount ready — you pay when your order arrives.',
        'help': 'Questions? We reply fast on WhatsApp.', 'help_btn': 'Chat on WhatsApp',
        'follow': 'Follow us', 'legal': 'شركة الحصان الرياضي · CR 7053046608 · VAT 314498395700003',
        'address': 'Al Boghdadiyah Al Sharqiyah, Jeddah, Saudi Arabia', 'view_order': 'View your order',
        'returns': 'Easy returns within 3 days of delivery.', 'hi': 'Hi',
    },
    'ar': {
        'dir': 'rtl', 'align': 'right', 'font': "'Readex Pro', Tahoma, Arial, sans-serif",
        'order': 'الطلب', 'qty': 'الكمية', 'subtotal': 'المجموع الفرعي', 'shipping': 'التوصيل', 'discount': 'الخصم',
        'tax': 'ضريبة القيمة المضافة', 'total': 'الإجمالي', 'ship_to': 'عنوان التوصيل', 'cod_title': 'الدفع عند الاستلام',
        'cod_text': 'يرجى تجهيز المبلغ — تدفع عند وصول طلبك.',
        'help': 'لديك سؤال؟ نرد بسرعة عبر واتساب.', 'help_btn': 'تواصل عبر واتساب',
        'follow': 'تابعنا', 'legal': 'شركة الحصان الرياضي · س.ت 7053046608 · الرقم الضريبي 314498395700003',
        'address': 'البغدادية الشرقية، جدة، المملكة العربية السعودية', 'view_order': 'عرض طلبك',
        'returns': 'إرجاع سهل خلال 3 أيام من الاستلام.', 'hi': 'مرحباً',
    },
}


def money(expr):
    # Keep currency amounts left-to-right inside Arabic text
    return '<span dir="ltr" style="unicode-bidi:isolate;white-space:nowrap">{{ %s | money }}</span>' % expr


def button(lang, url_expr, label):
    return f'''<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:999px;background:{GREEN}">
<a href="{url_expr}" style="display:inline-block;padding:14px 28px;font-family:{T[lang]['font']};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px">{label}</a></td></tr></table>'''


def items(lang, loop, title, qty, price, image, variant):
    t = T[lang]
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;border-top:1px solid {LINE}">
{{% for line in {loop} %}}
<tr>
  <td width="72" style="padding:14px 0;border-bottom:1px solid {LINE};vertical-align:top">{{% if {image} %}}<img src="{{{{ {image} | img_url: 'compact_cropped' }}}}" width="60" height="60" alt="" style="display:block;border-radius:10px;background:{TINT};object-fit:contain">{{% endif %}}</td>
  <td style="padding:14px 12px;border-bottom:1px solid {LINE};vertical-align:top;font-family:{t['font']};font-size:14px;color:{INK};text-align:{t['align']}">
    <strong style="font-weight:600">{{{{ {title} }}}}</strong>{{% if {variant} != blank and {variant} != 'Default Title' %}}<br><span style="color:{MUTED};font-size:13px">{{{{ {variant} }}}}</span>{{% endif %}}
    <br><span style="color:{MUTED};font-size:13px">{t['qty']}: {{{{ {qty} }}}}</span>
  </td>
  {'<td style="padding:14px 0;border-bottom:1px solid ' + LINE + ';vertical-align:top;font-family:' + t['font'] + ';font-size:14px;font-weight:600;color:' + INK + ';white-space:nowrap;text-align:' + ('left' if lang == 'ar' else 'right') + '">' + money(price) + '</td>' if price else ''}
</tr>
{{% endfor %}}
</table>'''


def totals(lang):
    t = T[lang]
    end = 'left' if lang == 'ar' else 'right'
    row = lambda label, expr, cond=None, bold=False, neg=False: (
        (f'{{% if {cond} %}}' if cond else '') +
        f'<tr><td style="padding:6px 0;font-family:{t["font"]};font-size:{16 if bold else 14}px;color:{INK if bold else MUTED};font-weight:{700 if bold else 400};text-align:{t["align"]}">{label}</td>'
        f'<td style="padding:6px 0;font-family:{t["font"]};font-size:{18 if bold else 14}px;color:{INK};font-weight:{700 if bold else 500};text-align:{end}">{money(expr).replace('{{', '−{{', 1) if neg else money(expr)}</td></tr>' +
        ('{% endif %}' if cond else ''))
    return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">' +
            row(t['subtotal'], 'subtotal_price') +
            row(t['discount'], 'total_discounts', 'total_discounts > 0', neg=True) +
            row(t['shipping'], 'shipping_price', 'shipping_price') +
            row(t['tax'], 'tax_price', 'tax_price > 0') +
            f'<tr><td colspan="2" style="border-top:1px solid {LINE};height:8px;line-height:8px">&nbsp;</td></tr>' +
            row(t['total'], 'total_price', bold=True) + '</table>')


def address(lang):
    t = T[lang]
    return f'''{{% if shipping_address %}}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="padding:16px 18px;background:{TINT};border-radius:12px;font-family:{t['font']};font-size:14px;color:{INK};text-align:{t['align']}">
<strong style="display:block;margin-bottom:6px">{t['ship_to']}</strong><div dir="auto">{{{{ shipping_address | format_address }}}}</div></td></tr></table>{{% endif %}}'''


def cod(lang):
    t = T[lang]
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="padding:14px 18px;border:1.5px solid {LIME};border-radius:12px;font-family:{t['font']};font-size:14px;color:{INK};text-align:{t['align']}">
<strong>💵 {t['cod_title']}</strong> — {t['cod_text']}</td></tr></table>'''


def layout(lang, title, body):
    t = T[lang]
    socials = ''.join(
        f'<a href="{url}" style="display:inline-block;margin:0 4px 8px;padding:8px 14px;border-radius:999px;background:{bg};color:{fg};border:1px solid {LINE};font-family:{t["font"]};font-size:13px;font-weight:700;text-decoration:none">{name}</a>'
        for name, url, bg, fg in SOCIAL)
    return f'''<!DOCTYPE html>
<html lang="{lang}" dir="{t['dir']}">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body {{ margin:0; padding:0; background:#F4F6F5; }}
  a {{ color:{GREEN}; }}
  @media (max-width: 620px) {{ .ah-card {{ border-radius:0 !important; }} .ah-pad {{ padding:24px 20px !important; }} }}
</style>
</head>
<body dir="{t['dir']}" style="margin:0;padding:0;background:#F4F6F5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F5"><tr><td align="center" style="padding:24px 8px">
<table role="presentation" class="ah-card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden">
  <tr><td style="background:#ffffff;padding:22px 28px;text-align:center">
    {{% if shop.email_logo_url %}}<img src="{{{{ shop.email_logo_url }}}}" alt="{{{{ shop.name }}}}" width="{{{{ shop.email_logo_width | default: 170 }}}}" style="max-width:210px;height:auto">{{% else %}}<span style="font-family:{t['font']};font-size:22px;font-weight:700;color:{GREEN}">{{{{ shop.name }}}}</span>{{% endif %}}
  </td></tr>
  <tr><td style="height:5px;line-height:5px;background:{GREEN}">&nbsp;</td></tr>
  <tr><td style="height:3px;line-height:3px;background:{LIME}">&nbsp;</td></tr>
  <tr><td class="ah-pad" style="padding:32px 36px;text-align:{t['align']};font-family:{t['font']};color:{INK}">
{body}
  </td></tr>
  <tr><td style="padding:22px 28px;background:{TINT};text-align:center;font-family:{t['font']}">
    <p style="margin:0 0 10px;font-size:14px;color:{INK}">{t['help']}</p>
    <a href="https://wa.me/966541770519" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#1FA855;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">{t['help_btn']}</a>
  </td></tr>
  <tr><td style="padding:22px 28px 26px;text-align:center;font-family:{t['font']}">
    <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:{INK}">{t['follow']}</p>
    {socials}
    <p style="margin:14px 0 4px;font-size:12px;color:{MUTED}">{t['returns']}</p>
    <p style="margin:0 0 4px;font-size:12px;color:{MUTED}">{t['legal']}</p>
    <p style="margin:0;font-size:12px;color:{MUTED}">{t['address']} · <a href="{{{{ shop.url }}}}" style="color:{GREEN}">{{{{ shop.url | remove: 'https://' }}}}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body>
</html>'''


def heading(lang, title, text):
    return (f'<h1 style="margin:0 0 12px;font-family:{T[lang]["font"]};font-size:26px;line-height:1.25;font-weight:700;color:{INK}">{title}</h1>'
            f'<p style="margin:0;font-family:{T[lang]["font"]};font-size:15px;line-height:1.7;color:#2B332E">{text}</p>')


def order_tag(lang):
    return f'<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;color:{GREEN}">{T[lang]["order"]} {{{{ order_name | default: name }}}}</p>'


LINE_ORDER = dict(loop='subtotal_line_items', title='line.title', qty='line.quantity', price='line.final_line_price', image='line.image', variant='line.variant.title')
LINE_FULFIL = dict(loop='fulfillment.fulfillment_line_items', title='line.line_item.title', qty='line.quantity', price=None, image='line.line_item.image', variant='line.line_item.variant.title')

TRACK = {
    'en': '{% if fulfillment.tracking_url %}' ,
}


def tracking(lang):
    label = 'Track your shipment' if lang == 'en' else 'تتبّع شحنتك'
    carrier = 'Carrier' if lang == 'en' else 'شركة الشحن'
    number = 'Tracking number' if lang == 'en' else 'رقم التتبع'
    return (f'{{% if fulfillment.tracking_numbers.size > 0 %}}<p style="margin:16px 0 0;font-size:14px;color:{MUTED}">'
            f'{{% if fulfillment.tracking_company %}}{carrier}: <strong style="color:{INK}">{{{{ fulfillment.tracking_company }}}}</strong><br>{{% endif %}}'
            f'{number}: <strong dir="ltr" style="color:{INK}">{{{{ fulfillment.tracking_numbers.first }}}}</strong></p>{{% endif %}}'
            f'{{% if fulfillment.tracking_url %}}{button(lang, "{{ fulfillment.tracking_url }}", label)}{{% endif %}}')


TEMPLATES = [
    # id, key, subject en, subject ar, body builder
    ('43561615610', 'order_confirmation', 'Order {{ name }} confirmed ✅', 'تم تأكيد طلبك {{ name }} ✅',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Thank you for your order!', "Hi {{ customer.first_name }}, we've received your order and we're getting it ready. We'll let you know as soon as it's on the way."),
         'ar': ('شكراً لطلبك!', 'مرحباً {{ customer.first_name }}، استلمنا طلبك ونقوم بتجهيزه الآن. سنبلغك فور خروجه للتوصيل.')}[L])
     + items(L, **LINE_ORDER) + totals(L) + cod(L) + address(L) + button(L, '{{ order_status_url }}', T[L]['view_order'])),
    ('43562008826', 'order_edited', 'Order {{ name }} updated', 'تم تحديث طلبك {{ name }}',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Your order has been updated', 'Hi {{ customer.first_name }}, here are the latest details of your order.'),
         'ar': ('تم تحديث طلبك', 'مرحباً {{ customer.first_name }}، إليك أحدث تفاصيل طلبك.')}[L])
     + items(L, **LINE_ORDER) + totals(L) + button(L, '{{ order_status_url }}', T[L]['view_order'])),
    ('43562041594', 'order_canceled', 'Order {{ name }} has been canceled', 'تم إلغاء طلبك {{ name }}',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Your order has been canceled', 'Hi {{ customer.first_name }}, your order {{ name }} was canceled. As you chose cash on delivery, nothing was charged. Want to order again? We are happy to help on WhatsApp.'),
         'ar': ('تم إلغاء طلبك', 'مرحباً {{ customer.first_name }}، تم إلغاء طلبك {{ name }}. بما أنك اخترت الدفع عند الاستلام فلم يتم خصم أي مبلغ. ترغب في الطلب مجدداً؟ يسعدنا مساعدتك عبر واتساب.')}[L])
     + items(L, **LINE_ORDER)),
    ('43562107130', 'refund', 'Refund for order {{ name }}', 'استرداد مبلغ الطلب {{ name }}',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Your refund is on its way', 'We have refunded <strong>' + money('amount') + '</strong> for your order. Depending on the method, it can take up to 10 days to arrive.'),
         'ar': ('تم استرداد المبلغ', 'تم استرداد <strong>' + money('amount') + '</strong> لطلبك. قد يستغرق وصوله حتى 10 أيام حسب طريقة الاسترداد.')}[L])),
    ('43561648378', 'draft_invoice', 'Your order from {{ shop.name }} is ready', 'طلبك من الحصان الرياضي جاهز',
     lambda L: heading(L, *{
         'en': ('Your order is ready', '{% if custom_message != blank %}{{ custom_message }}{% else %}We prepared your order. Confirm it below and pay cash on delivery.{% endif %}'),
         'ar': ('طلبك جاهز', '{% if custom_message != blank %}{{ custom_message }}{% else %}جهّزنا طلبك. أكّده من الزر أدناه وادفع عند الاستلام.{% endif %}')}[L])
     + button(L, '{{ invoice_url }}', 'Confirm your order' if L == 'en' else 'تأكيد الطلب') + items(L, **LINE_ORDER) + totals(L)),
    ('43562139898', 'abandoned_checkout', 'You left something behind 👀', 'نسيت شيئاً في سلتك 👀',
     lambda L: heading(L, *{
         'en': ('Still thinking it over?', 'Hi {{ billing_address.first_name }}, your items are waiting for you. Complete your order now — cash on delivery, delivered to your door.'),
         'ar': ('ما زلت تفكر؟', 'مرحباً {{ billing_address.first_name }}، منتجاتك بانتظارك. أكمل طلبك الآن — الدفع عند الاستلام والتوصيل حتى بابك.')}[L])
     + items(L, loop='subtotal_line_items', title='line.title', qty='line.quantity', price=None, image='line.image', variant='line.variant.title')
     + button(L, '{{ url }}', 'Complete your order' if L == 'en' else 'أكمل طلبك')),
    ('43561681146', 'shipping_confirmation', 'Your order {{ name }} is on the way 🚚', 'طلبك {{ name }} في الطريق إليك 🚚',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Your order is on the way!', 'Good news {{ customer.first_name }} — your order has shipped. Please keep the amount ready for cash on delivery.'),
         'ar': ('طلبك في الطريق!', 'خبر سار يا {{ customer.first_name }} — تم شحن طلبك. يرجى تجهيز المبلغ للدفع عند الاستلام.')}[L])
     + tracking(L) + items(L, **LINE_FULFIL) + button(L, '{{ order_status_url }}', T[L]['view_order'])),
    ('43562565882', 'shipping_update', 'Shipping update for order {{ name }}', 'تحديث شحن الطلب {{ name }}',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Your shipping details changed', 'Here is the latest tracking information for your order.'),
         'ar': ('تم تحديث معلومات الشحن', 'إليك أحدث معلومات التتبع لطلبك.')}[L])
     + tracking(L) + items(L, **LINE_FULFIL)),
    ('43562598650', 'out_for_delivery', 'Order {{ name }} is out for delivery 📦', 'طلبك {{ name }} خرج للتوصيل 📦',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Arriving today!', 'Your order is out for delivery. ' + T['en']['cod_text']),
         'ar': ('يصلك اليوم!', 'طلبك خرج للتوصيل. ' + T['ar']['cod_text'])}[L])
     + tracking(L) + items(L, **LINE_FULFIL)),
    ('43561779450', 'local_out_for_delivery', 'Order {{ name }} is out for delivery 📦', 'طلبك {{ name }} خرج للتوصيل 📦',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Arriving today!', 'Your order is out for delivery. ' + T['en']['cod_text']),
         'ar': ('يصلك اليوم!', 'طلبك خرج للتوصيل. ' + T['ar']['cod_text'])}[L])
     + button(L, '{{ order_status_url }}', T[L]['view_order'])),
    ('43562631418', 'delivered', 'Order {{ name }} has been delivered 🎉', 'تم توصيل طلبك {{ name }} 🎉',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Delivered — enjoy your gear!', 'Your order has been delivered. Not quite right? You can return it within 3 days.'),
         'ar': ('تم التوصيل — استمتع بمعداتك!', 'تم توصيل طلبك. لم يناسبك؟ يمكنك إرجاعه خلال 3 أيام.')}[L])
     + items(L, **LINE_FULFIL)),
    ('43561812218', 'local_delivered', 'Order {{ name }} has been delivered 🎉', 'تم توصيل طلبك {{ name }} 🎉',
     lambda L: order_tag(L) + heading(L, *{
         'en': ('Delivered — enjoy your gear!', 'Your order has been delivered. Not quite right? You can return it within 3 days.'),
         'ar': ('تم التوصيل — استمتع بمعداتك!', 'تم توصيل طلبك. لم يناسبك؟ يمكنك إرجاعه خلال 3 أيام.')}[L])
     + button(L, '{{ order_status_url }}', T[L]['view_order'])),
    ('43562926330', 'account_activation', 'Activate your {{ shop.name }} account', 'فعّل حسابك في الحصان الرياضي',
     lambda L: heading(L, *{
         'en': ('Activate your account', '{% if custom_message != blank %}{{ custom_message }}{% else %}Create your password to track orders and check out faster.{% endif %}'),
         'ar': ('فعّل حسابك', '{% if custom_message != blank %}{{ custom_message }}{% else %}أنشئ كلمة المرور لتتبع طلباتك وإتمام الشراء بشكل أسرع.{% endif %}')}[L])
     + button(L, '{{ customer.account_activation_url }}', 'Activate account' if L == 'en' else 'تفعيل الحساب')),
    ('43562959098', 'account_welcome', 'Welcome to {{ shop.name }}!', 'أهلاً بك في الحصان الرياضي!',
     lambda L: heading(L, *{
         'en': ('Welcome to the team!', 'Your account is ready. Next time you shop, just sign in for faster checkout.'),
         'ar': ('أهلاً بك في الفريق!', 'حسابك جاهز. في المرة القادمة سجّل الدخول لإتمام الشراء بشكل أسرع.')}[L])
     + button(L, '{{ shop.url }}', 'Start shopping' if L == 'en' else 'ابدأ التسوق')),
    ('43562991866', 'password_reset', 'Reset your {{ shop.name }} password', 'إعادة تعيين كلمة المرور',
     lambda L: heading(L, *{
         'en': ('Reset your password', "Click the button below to choose a new password. If you didn't ask for this, you can ignore this email."),
         'ar': ('إعادة تعيين كلمة المرور', 'اضغط الزر أدناه لاختيار كلمة مرور جديدة. إذا لم تطلب ذلك يمكنك تجاهل هذه الرسالة.')}[L])
     + button(L, '{{ customer.reset_password_url }}', 'Reset password' if L == 'en' else 'إعادة التعيين')),
    ('43563221242', 'contact_customer', 'Message from {{ shop.name }}', 'رسالة من الحصان الرياضي',
     lambda L: f'<div style="font-size:15px;line-height:1.7;color:#2B332E">{{{{ custom_message }}}}</div>'),
    ('43563254010', 'marketing_confirmation', 'Confirm your subscription', 'أكّد اشتراكك',
     lambda L: heading(L, *{
         'en': ('One more step', 'Confirm your email to get new arrivals, offers and team deals first.'),
         'ar': ('خطوة أخيرة', 'أكّد بريدك لتصلك المنتجات الجديدة والعروض وصفقات الفرق أولاً.')}[L])
     + button(L, '{{ customer.subscribe_url }}', 'Confirm subscription' if L == 'en' else 'تأكيد الاشتراك')),
]

STAFF_NEW_ORDER = layout('en', 'New order {{ name }}', (
    heading('en', 'New order {{ name }} 🎉', '{{ customer.first_name }} {{ customer.last_name }} placed an order for <strong>' + money('total_price') + '</strong> (cash on delivery).')
    + '{% if attributes["Came from"] %}<p style="margin:12px 0 0;font-size:14px;color:#2B332E">Came from: <strong>{{ attributes["Came from"] }}</strong>{% if attributes["Auto source"] %} · Detected: <strong>{{ attributes["Auto source"] }}</strong>{% endif %}</p>{% endif %}'
    + items('en', loop='line_items', title='line.title', qty='line.quantity', price='line.final_line_price', image='line.image', variant='line.variant.title')
    + totals('en') + address('en')
    + button('en', '{{ shop.url }}/admin/orders/{{ id }}', 'Open in Shopify admin')))


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
    with open(os.path.join(HERE, 'en', 'staff_new_order.liquid'), 'w') as f:
        f.write(STAFF_NEW_ORDER)
    with open(os.path.join(HERE, 'templates.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False)
    print('built', len(TEMPLATES), 'templates x 2 languages')


if __name__ == '__main__':
    main()

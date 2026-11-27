#!/usr/bin/env python3
"""Build the Event Production page body (EN + AR).

Outputs pages/event-production.en.html and pages/event-production.ar.html.
Upload: EN as the page body, AR as the `body_html` translation (locale ar).

Owner rules (27 Nov 2026):
- This is the ONLY place on the site with the bulk-order / event-production WhatsApp, +966 50 217 0165.
- Very dynamic: swipe deck (mobile), scroll effects, stacked cards, quote builder.
Motion: transform/opacity only, all off under prefers-reduced-motion, content visible without JS.
CSS prefix: ah-ep
"""
import json
import pathlib
from urllib.parse import quote

HERE = pathlib.Path(__file__).parent
WA = "966502170165"
WA_DISPLAY = "+966 50 217 0165"
IMG = "/cdn/shop/files/"
PH = {
    "medal": IMG + "rn-image_picker_lib_temp_006474f0-b515-4aee-970f-a2af8766822f.png",
    "tshirt": IMG + "tshirt_blue2_156bd0ea-8c23-4f21-a08c-6b28a3f86346.png",
    "vest": IMG + "553a777f-07aa-4524-b486-611c26369333.png",
    "bib": IMG + "rn-image_picker_lib_temp_73cf570f-68e4-4f65-a252-ad9b85d597ed.jpg",
    "flag": IMG + "sa_76da210e-cf1e-4085-a382-52be0ecd10bc.png",
    "bracelet": IMG + "wristband-gray.png",
    "bag": IMG + "cb108b9d-7acc-434c-9762-e6906d55237d.png",
    "shorts": IMG + "238d631c-fd76-4c26-b05e-891cce0add2b.jpg",
    "kit": IMG + "rn-image_picker_lib_temp_9af26313-093c-4f17-acd2-ba13589dd515.jpg",
}

# Line icons (24x24, stroke = currentColor)
ICON = {
    "medal": '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 4 2-4h4l-2.5 8"/><path d="m12 13 .9 1.8 2 .3-1.4 1.4.3 2L12 17.6l-1.8.9.3-2-1.4-1.4 2-.3Z"/>',
    "tshirt": '<path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a3 3 0 0 1-6 0Z"/>',
    "vest": '<path d="M8 3h2a2 2 0 0 0 4 0h2l1 4-2 3v11H9V10L7 7Z"/><path d="M9 14h6"/>',
    "flag": '<path d="M5 21V4"/><path d="M5 4c4-2 7 2 11 0v9c-4 2-7-2-11 0"/>',
    "tent": '<path d="M3 20 12 4l9 16Z"/><path d="M12 4v16"/><path d="m9 20 3-5 3 5"/>',
    "barrier": '<rect x="2" y="7" width="20" height="9" rx="1.5"/><path d="M5 16v4M19 16v4M7 7l-3 9M13 7l-3 9M19 7l-3 9"/>',
    "bracelet": '<ellipse cx="12" cy="12" rx="9" ry="5"/><ellipse cx="12" cy="12" rx="6" ry="2.5"/>',
    "bag": '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    "buoy": '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="m6.5 6.5 3 3M17.5 6.5l-3 3M6.5 17.5l3-3M17.5 17.5l-3-3"/>',
    "gate": '<path d="M3 21V11a9 9 0 0 1 18 0v10"/><path d="M7 21V11a5 5 0 0 1 10 0v10"/><path d="M9 8h6"/>',
    "shorts": '<path d="M5 4h14l1 15-6 1-2-8-2 8-6-1Z"/><path d="M5 7h14"/>',
    "lanyard": '<path d="M7 3c0 6 3 9 5 11 2-2 5-5 5-11"/><rect x="8" y="14" width="8" height="7" rx="1.5"/>',
    "id": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.6-1.6 1.7-2.3 3-2.3s2.4.7 3 2.3M14 10h4M14 13h3"/>',
    "number": '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M10.5 10.5 12 9.5V15"/>',
    "wa": '<path d="M20 12a8 8 0 0 1-11.9 7L4 20l1.1-4A8 8 0 1 1 20 12Z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1 1.6.8c-.2 1-1 1.7-2 1.7A6 6 0 0 1 8 9.4c0-1 .7-1.8 1.7-2l.8 1.6Z"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "check": '<path d="m5 12 4.5 4.5L19 7"/>',
    "spark": '<path d="M12 2c.6 5 3.5 8.4 9 10-5.5 1.6-8.4 5-9 10-.6-5-3.5-8.4-9-10 5.5-1.6 8.4-5 9-10Z"/>',
}


def icon(name, cls="ah-ep__ic"):
    fill = ' fill="currentColor" stroke="none"' if name == "spark" else ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'
    return f'<svg class="{cls}" viewBox="0 0 24 24" aria-hidden="true"{fill}>{ICON[name]}</svg>'


ITEMS = ["medal", "tshirt", "vest", "flag", "tent", "barrier", "bracelet", "bag", "buoy", "gate", "shorts", "lanyard", "id", "number"]
PHOTO = {"medal": "medal", "tshirt": "tshirt", "vest": "vest", "flag": "flag", "bracelet": "bracelet", "bag": "bag", "shorts": "shorts", "number": "bib"}
HUE = {"medal": "#e2b33c", "tshirt": "#2f7de1", "vest": "#f97316", "flag": "#14532d", "tent": "#0ea5a4", "barrier": "#d61f45", "bracelet": "#8b5cf6",
       "bag": "#0f766e", "buoy": "#f59e0b", "gate": "#e11d48", "shorts": "#1d4ed8", "lanyard": "#16a34a", "id": "#334155", "number": "#b6f23a"}

T = {
    "en": {
        "dir": "ltr", "pre": "",
        "eyebrow": "Event production",
        "h1": "We build the look of your event.",
        "lead": "Medals, T-shirts, vests, flags, tents, barrier covers, wristbands, bags, buoys, inflatable gates, shorts, lanyards, printed IDs and bib numbers — custom made with your logo, delivered anywhere in Saudi Arabia.",
        "cta": "Get a quote",
        "cta2": "WhatsApp us", "add": "Add to quote",
        "stats": [("14", "custom products"), ("1", "team from design to delivery"), ("100%", "your branding")],
        "marquee": ["Marathons", "Fun runs", "School sports days", "Tournaments", "Corporate events", "Swimming galas", "National Day", "Academies", "Triathlons", "Padel cups"],
        "deck_eyebrow": "Swipe to explore", "deck": "Everything we customise",
        "deck_hint": "Swipe",
        "cards": {
            "medal": ("Medals", "Custom-shaped medals with printed ribbons and your event name."),
            "tshirt": ("T-shirts", "Event, staff and volunteer shirts in breathable sports fabric."),
            "vest": ("Vests", "Training, marshal and team vests in bright, numbered colours."),
            "flag": ("Flags", "Event, club, feather and beach flags with your design."),
            "tent": ("Tents", "Branded pop-up gazebos for registration, medical and VIP areas."),
            "barrier": ("Barrier covers", "Printed fence and barrier wraps for start, finish and sponsor zones."),
            "bracelet": ("Wristbands", "Silicone and fabric wristbands for access, teams and giveaways."),
            "bag": ("Bags", "Drawstring, tote and race-pack bags with your logo."),
            "buoy": ("Buoys", "Printed marker buoys for open-water swims and triathlons."),
            "gate": ("Inflatable gates", "Inflatable start and finish arches in your colours."),
            "shorts": ("Shorts", "Team and running shorts that match your shirts."),
            "lanyard": ("Neck straps", "Printed lanyards for staff, volunteers and guests."),
            "id": ("Printed ID", "Staff, media and participant ID cards and badges."),
            "number": ("Bib numbers", "Race bibs with numbers, names and sponsor logos."),
        },
        "events_eyebrow": "Made for every event", "events": "One partner for the whole event",
        "events_list": [
            ("Runs & marathons", "Bibs, medals, finish arch, barrier covers, T-shirts and race-pack bags."),
            ("School sports days", "Vests, medals, flags, wristbands and tents for every house and team."),
            ("Tournaments & leagues", "Team shirts and shorts, medals, flags, printed IDs and lanyards."),
            ("Corporate & community events", "Branded tents, flags, T-shirts, bags and giveaways."),
            ("Swimming & triathlon", "Marker buoys, swim caps, medals, bibs and inflatable gates."),
        ],
        "how_eyebrow": "How it works", "how": "From idea to event day",
        "steps": [
            ("Tell us about your event", "Items, quantities, sizes, date and city — and send your logo."),
            ("Design & quote", "You get a price and a design preview before anything is produced."),
            ("Production", "Once you approve, we produce everything to your brand colours."),
            ("Delivery", "Delivered to your venue anywhere in Saudi Arabia, on time for event day."),
        ],
        "q_eyebrow": "Get a quote", "q": "Build your request",
        "q_sub": "Pick what you need. We'll write the WhatsApp message for you.",
        "q_items": "What do you need?", "q_event": "Type of event",
        "q_events": ["Run / marathon", "School sports day", "Tournament", "Corporate event", "Swimming / triathlon", "Other"],
        "q_qty": "Number of participants (approx.)", "q_date": "Event date", "q_city": "City",
        "q_city_ph": "e.g. Jeddah", "q_name": "Your name / organisation", "q_name_ph": "e.g. Al Noor School",
        "q_logo": "Print our logo", "q_names": "Names / numbers",
        "summary": "Your request", "empty": "Pick at least one item", "send": "Send on WhatsApp",
        "msg_head": "Hello Alhisan Alriyadi, I would like a quote for event production:",
        "m_items": "Items", "m_event": "Event", "m_qty": "Participants", "m_date": "Date", "m_city": "City", "m_name": "Name", "m_extra": "Extras",
        "wa_line": "Event production & bulk orders WhatsApp",
        "sticky": "Get a quote",
        "faq": "Good to know",
        "faqs": [
            ("What is the minimum order?", "It depends on the product — tell us your quantity and we'll suggest the best option, from small teams to thousands of participants."),
            ("Can I see the design first?", "Yes. You approve a design preview and the price before production starts."),
            ("Do you deliver outside Jeddah?", "Yes, we deliver to venues anywhere in Saudi Arabia."),
        ],
    },
    "ar": {
        "dir": "rtl", "pre": "/ar",
        "eyebrow": "إنتاج الفعاليات",
        "h1": "نصنع هوية فعاليتك بالكامل.",
        "lead": "ميداليات، تيشيرتات، صدريات، أعلام، خيام، أغطية حواجز، أساور، شنط، عوّامات، بوابات هوائية، شورتات، أشرطة رقبة، بطاقات تعريف مطبوعة وأرقام المتسابقين — مخصصة بشعارك ونوصلها لأي مكان في المملكة.",
        "cta": "اطلب عرض سعر",
        "cta2": "راسلنا واتساب", "add": "أضف إلى الطلب",
        "stats": [("14", "منتجاً قابلاً للتخصيص"), ("1", "فريق من التصميم حتى التوصيل"), ("100%", "بهوية فعاليتك")],
        "marquee": ["الماراثونات", "سباقات الجري", "الأيام الرياضية المدرسية", "البطولات", "فعاليات الشركات", "بطولات السباحة", "اليوم الوطني", "الأكاديميات", "الترياثلون", "بطولات البادل"],
        "deck_eyebrow": "اسحب لتستكشف", "deck": "كل ما نخصصه لك",
        "deck_hint": "اسحب",
        "cards": {
            "medal": ("ميداليات", "ميداليات بأشكال خاصة وأشرطة مطبوعة باسم فعاليتك."),
            "tshirt": ("تيشيرتات", "تيشيرتات للفعاليات والموظفين والمتطوعين بقماش رياضي مريح."),
            "vest": ("صدريات", "صدريات تدريب ومنظمين وفرق بألوان واضحة ومرقمة."),
            "flag": ("أعلام", "أعلام فعاليات وأندية وأعلام ريشة وشاطئ بتصميمك."),
            "tent": ("خيام", "خيام منبثقة بشعارك لمناطق التسجيل والإسعاف وكبار الضيوف."),
            "barrier": ("أغطية حواجز", "أغطية مطبوعة للحواجز في مناطق البداية والنهاية والرعاة."),
            "bracelet": ("أساور", "أساور سيليكون وقماش للدخول والفرق والهدايا."),
            "bag": ("شنط", "شنط برباط وشنط قماش وحقائب المتسابقين بشعارك."),
            "buoy": ("عوّامات", "عوّامات إرشادية مطبوعة لسباقات السباحة المفتوحة والترياثلون."),
            "gate": ("بوابات هوائية", "أقواس هوائية للبداية والنهاية بألوان فعاليتك."),
            "shorts": ("شورتات", "شورتات للفرق والجري متناسقة مع التيشيرتات."),
            "lanyard": ("أشرطة رقبة", "أشرطة رقبة مطبوعة للموظفين والمتطوعين والضيوف."),
            "id": ("بطاقات تعريف مطبوعة", "بطاقات وشارات تعريف للمنظمين والإعلام والمشاركين."),
            "number": ("أرقام المتسابقين", "أرقام صدر للسباقات مع الأسماء وشعارات الرعاة."),
        },
        "events_eyebrow": "لكل أنواع الفعاليات", "events": "شريك واحد لفعاليتك كاملة",
        "events_list": [
            ("سباقات الجري والماراثون", "أرقام المتسابقين، ميداليات، بوابة النهاية، أغطية الحواجز، تيشيرتات وحقائب المتسابقين."),
            ("الأيام الرياضية المدرسية", "صدريات، ميداليات، أعلام، أساور وخيام لكل فريق."),
            ("البطولات والدوريات", "تيشيرتات وشورتات الفرق، ميداليات، أعلام، بطاقات تعريف وأشرطة رقبة."),
            ("فعاليات الشركات والمجتمع", "خيام وأعلام وتيشيرتات وشنط وهدايا بشعارك."),
            ("السباحة والترياثلون", "عوّامات إرشادية، قبعات سباحة، ميداليات، أرقام وبوابات هوائية."),
        ],
        "how_eyebrow": "كيف نعمل", "how": "من الفكرة حتى يوم الفعالية",
        "steps": [
            ("أخبرنا عن فعاليتك", "المنتجات والكميات والمقاسات والتاريخ والمدينة — وأرسل شعارك."),
            ("التصميم وعرض السعر", "تستلم السعر ومعاينة التصميم قبل بدء الإنتاج."),
            ("الإنتاج", "بعد اعتمادك ننتج كل شيء بألوان هويتك."),
            ("التوصيل", "نوصل إلى موقع فعاليتك في أي مكان بالمملكة في الموعد."),
        ],
        "q_eyebrow": "اطلب عرض سعر", "q": "جهّز طلبك",
        "q_sub": "اختر ما تحتاجه، ونكتب لك رسالة واتساب جاهزة.",
        "q_items": "ماذا تحتاج؟", "q_event": "نوع الفعالية",
        "q_events": ["سباق جري / ماراثون", "يوم رياضي مدرسي", "بطولة", "فعالية شركة", "سباحة / ترياثلون", "أخرى"],
        "q_qty": "عدد المشاركين (تقريباً)", "q_date": "تاريخ الفعالية", "q_city": "المدينة",
        "q_city_ph": "مثال: جدة", "q_name": "الاسم / الجهة", "q_name_ph": "مثال: مدارس النور",
        "q_logo": "طباعة شعارنا", "q_names": "أسماء / أرقام",
        "summary": "طلبك", "empty": "اختر منتجاً واحداً على الأقل", "send": "أرسل عبر واتساب",
        "msg_head": "مرحباً الحصان الرياضي، أرغب في عرض سعر لإنتاج فعالية:",
        "m_items": "المنتجات", "m_event": "الفعالية", "m_qty": "المشاركون", "m_date": "التاريخ", "m_city": "المدينة", "m_name": "الاسم", "m_extra": "إضافات",
        "wa_line": "واتساب إنتاج الفعاليات والطلبات بالجملة",
        "sticky": "اطلب عرض سعر",
        "faq": "معلومات مهمة",
        "faqs": [
            ("ما هو الحد الأدنى للطلب؟", "يعتمد على المنتج — أخبرنا بالكمية ونقترح لك الأنسب، من الفرق الصغيرة حتى آلاف المشاركين."),
            ("هل أرى التصميم أولاً؟", "نعم، تعتمد معاينة التصميم والسعر قبل بدء الإنتاج."),
            ("هل توصلون خارج جدة؟", "نعم، نوصل إلى مواقع الفعاليات في أي مكان بالمملكة."),
        ],
    },
}

CSS = r"""
<style>
.ah-ep{--g:#14532D;--gd:#0B2E19;--gt:#E7F0EA;--lime:#B6F23A;--ink:#111614;--mut:#3D4641;--wa:#25D366;--ease:cubic-bezier(.22,1,.36,1);color:var(--ink);line-height:1.6;max-width:1200px;margin:0 auto;overflow-x:clip}
.ah-ep *{box-sizing:border-box}
.ah-ep h1,.ah-ep h2,.ah-ep h3,.ah-ep p{margin:0}
.ah-ep ul,.ah-ep ol{list-style:none;margin:0;padding:0}
.rte .ah-ep ul>li::before,.rte .ah-ep ol>li::before{content:none;display:none}
.rte .ah-ep li{margin:0;padding:0}
.ah-ep a{text-decoration:none}
.ah-ep img{display:block;max-width:100%;height:auto}
.ah-ep__ic{width:24px;height:24px;flex:none}
.ah-ep__sec{margin:clamp(56px,9vw,96px) 0}
.ah-ep__eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--g)}
[dir=rtl] .ah-ep__eyebrow{letter-spacing:0}
.ah-ep__eyebrow i{width:26px;height:2px;background:currentColor;display:block}
.ah-ep__h2{font-size:clamp(1.7rem,4vw,2.7rem);line-height:1.1;letter-spacing:-.02em;margin:10px 0 26px!important}
/* hero */
.ah-ep__hero{position:relative;border-radius:30px;background:var(--gd);color:#fff;padding:clamp(28px,6vw,72px) clamp(22px,5vw,64px);overflow:hidden;isolation:isolate;min-height:min(86vh,720px);display:flex;flex-direction:column;justify-content:center}
.ah-ep__blob{position:absolute;border-radius:50%;filter:blur(10px);z-index:-1;will-change:transform}
.ah-ep__blob--a{width:60vmax;height:60vmax;max-width:760px;max-height:760px;inset-inline-end:-22%;top:-30%;background:radial-gradient(circle,rgba(182,242,58,.28),transparent 62%);animation:ahEpDrift 16s ease-in-out infinite alternate}
.ah-ep__blob--b{width:50vmax;height:50vmax;max-width:620px;max-height:620px;inset-inline-start:-20%;bottom:-35%;background:radial-gradient(circle,rgba(46,160,110,.45),transparent 65%);animation:ahEpDrift 20s ease-in-out infinite alternate-reverse}
@keyframes ahEpDrift{to{transform:translate3d(6%,8%,0) scale(1.12)}}
.ah-ep__grid{position:absolute;inset:0;z-index:-1;opacity:.12;background-image:linear-gradient(rgba(255,255,255,.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.5) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(70% 70% at 50% 40%,#000,transparent);mask-image:radial-gradient(70% 70% at 50% 40%,#000,transparent)}
.ah-ep__hero .ah-ep__eyebrow{color:var(--lime)}
.ah-ep__h1{font-size:clamp(2.3rem,7vw,4.8rem);line-height:1.02;letter-spacing:-.03em;color:#fff;margin:14px 0 18px!important;max-width:12em}
.ah-ep__w{display:inline-block;opacity:0;transform:translate3d(0,.5em,0) rotate(2deg);animation:ahEpUp .9s var(--ease) both;animation-delay:calc(var(--i)*80ms + 120ms)}
@keyframes ahEpUp{to{opacity:1;transform:none}}
.ah-ep__h1 em{font-style:normal;color:var(--lime)}
.ah-ep__lead{font-size:clamp(1rem,1.6vw,1.15rem);color:rgba(255,255,255,.84);max-width:40em;margin-bottom:28px!important;opacity:0;animation:ahEpUp .9s var(--ease) .55s both}
.ah-ep__btns{display:flex;flex-wrap:wrap;gap:12px;opacity:0;animation:ahEpUp .9s var(--ease) .7s both}
.ah-ep__btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 26px;border-radius:999px;font-weight:800;font-size:1rem;color:var(--gd)!important;background:var(--lime);overflow:hidden;transition:transform .35s var(--ease);-webkit-tap-highlight-color:transparent}
.ah-ep__btn:active{transform:scale(.96)}
.ah-ep__btn::after{content:"";position:absolute;inset-block:0;inset-inline-start:-50%;width:35%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.6),transparent);transform:skewX(-20deg);animation:ahEpShine 3.4s ease-in-out 1.6s infinite}
@keyframes ahEpShine{0%,55%{transform:skewX(-20deg) translateX(0)}100%{transform:skewX(-20deg) translateX(480%)}}
[dir=rtl] .ah-ep__btn::after{animation-name:ahEpShineR}
@keyframes ahEpShineR{0%,55%{transform:skewX(20deg) translateX(0)}100%{transform:skewX(20deg) translateX(-480%)}}
.ah-ep__btn--wa{background:var(--wa);color:#fff!important}
.ah-ep__btn--ghost{background:rgba(255,255,255,.1);color:#fff!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.ah-ep__btn--ghost::after{display:none}
[dir=rtl] .ah-ep__btn .ah-ep__arr{transform:scaleX(-1)}
.ah-ep__stats{display:flex;flex-wrap:wrap;gap:clamp(18px,4vw,48px);margin-top:36px;opacity:0;animation:ahEpUp .9s var(--ease) .85s both}
.ah-ep__stat b{display:block;font-size:clamp(1.6rem,3.5vw,2.4rem);line-height:1;color:#fff;font-variant-numeric:tabular-nums}
.ah-ep__stat span{font-size:.85rem;color:rgba(255,255,255,.7)}
/* orbit of floating items */
.ah-ep__orbit{position:absolute;inset:0;z-index:-1;pointer-events:none}
.ah-ep__fl{position:absolute;display:grid;place-items:center;width:clamp(46px,6vw,64px);height:clamp(46px,6vw,64px);border-radius:18px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);color:#fff;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:ahEpFloat 7s ease-in-out infinite;animation-delay:var(--d);will-change:transform}
.ah-ep__fl .ah-ep__ic{width:52%;height:52%}
@keyframes ahEpFloat{50%{transform:translate3d(0,-14px,0) rotate(6deg)}}
.ah-ep__fl--1{top:12%;inset-inline-end:8%;color:var(--lime)}
.ah-ep__fl--2{top:38%;inset-inline-end:20%}
.ah-ep__fl--3{bottom:16%;inset-inline-end:6%}
.ah-ep__fl--4{top:8%;inset-inline-end:32%}
.ah-ep__fl--5{bottom:8%;inset-inline-end:28%;color:var(--lime)}
@media (max-width:749px){.ah-ep__fl--2,.ah-ep__fl--4{display:none}.ah-ep__fl{opacity:.55}.ah-ep__fl--1{top:5%}.ah-ep__fl--3{bottom:4%}.ah-ep__fl--5{bottom:4%;inset-inline-end:auto;inset-inline-start:58%}}
/* marquee */
.ah-ep__mq{margin:22px 0 0;overflow:hidden;border-radius:999px;background:var(--gt);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.ah-ep__mq-track{display:flex;width:max-content;gap:0;animation:ahEpMq 34s linear infinite}
.ah-ep__mq span{display:inline-flex;align-items:center;gap:14px;padding:14px 18px;font-weight:700;color:var(--g);white-space:nowrap}
.ah-ep__mq span svg{width:12px;height:12px;color:var(--g);opacity:.6}
@keyframes ahEpMq{to{transform:translateX(-50%)}}
/* swipe deck */
.ah-ep__deck-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}
.ah-ep__deck-nav{display:flex;gap:8px;margin-bottom:26px}
.ah-ep__nav{width:46px;height:46px;border-radius:50%;border:1px solid #E3E7E4;background:#fff;display:grid;place-items:center;color:var(--ink);cursor:pointer;transition:transform .3s var(--ease)}
.ah-ep__nav:active{transform:scale(.9)}
.ah-ep__nav--prev .ah-ep__ic{transform:scaleX(-1)}
[dir=rtl] .ah-ep__nav--prev .ah-ep__ic{transform:none}
[dir=rtl] .ah-ep__nav--next .ah-ep__ic{transform:scaleX(-1)}
.ah-ep__deck{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:10px 4px 26px;margin:0 -4px;overscroll-behavior-x:contain;perspective:1200px}
.ah-ep__deck::-webkit-scrollbar{display:none}
.ah-ep__card{position:relative;flex:0 0 min(78vw,300px);scroll-snap-align:center;border-radius:24px;background:#fff;border:1px solid #E3E7E4;overflow:hidden;transform-origin:center;will-change:transform,opacity;transition:box-shadow .35s var(--ease)}
.ah-ep__card:hover{box-shadow:0 20px 40px -24px rgba(11,46,25,.45)}
.ah-ep__media{position:relative;aspect-ratio:4/3.4;display:grid;place-items:center;background:radial-gradient(90% 90% at 30% 20%,color-mix(in srgb,var(--h) 28%,#fff),color-mix(in srgb,var(--h) 10%,#fff));overflow:hidden}
.ah-ep__media img{width:74%;height:74%;object-fit:contain;mix-blend-mode:multiply;transition:transform .8s var(--ease)}
.ah-ep__card:hover .ah-ep__media img{transform:scale(1.06) rotate(-2deg)}
.ah-ep__media .ah-ep__big{width:44%;height:44%;color:color-mix(in srgb,var(--h) 80%,#000);animation:ahEpBob 5s ease-in-out infinite}
@keyframes ahEpBob{50%{transform:translate3d(0,-8px,0) rotate(-4deg)}}
.ah-ep__badge{position:absolute;top:14px;inset-inline-start:14px;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#fff;color:var(--g);box-shadow:0 6px 16px -10px rgba(0,0,0,.4)}
.ah-ep__badge .ah-ep__ic{width:22px;height:22px}
.ah-ep__num{position:absolute;top:16px;inset-inline-end:16px;font-weight:800;font-size:.8rem;color:rgba(17,22,20,.45);font-variant-numeric:tabular-nums}
.ah-ep__body{padding:18px 20px 22px}
.ah-ep__body h3{font-size:1.2rem;line-height:1.2;margin-bottom:6px!important}
.ah-ep__body p{font-size:.94rem;color:var(--mut)}
.ah-ep__add{margin-top:14px;display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:.9rem;color:var(--g);background:none;border:0;padding:0;cursor:pointer}
.ah-ep__add .ah-ep__ic{width:18px;height:18px}
.ah-ep__add[aria-pressed=true]{color:#0a7a3a}
.ah-ep__dots{display:flex;justify-content:center;gap:6px}
.ah-ep__dot{width:7px;height:7px;border-radius:99px;background:#CBD5CF;transition:transform .3s var(--ease),background .3s}
.ah-ep__dot.is-on{background:var(--g);transform:scaleX(2.4)}
.ah-ep__hint{display:none;align-items:center;gap:8px;font-size:.85rem;color:var(--mut);margin:-6px 0 12px}
.ah-ep__hint i{display:block;width:26px;height:26px;border-radius:50%;background:var(--gt);animation:ahEpSwipe 1.8s var(--ease) infinite}
@keyframes ahEpSwipe{0%{transform:translateX(0);opacity:0}25%{opacity:1}100%{transform:translateX(-40px);opacity:0}}
[dir=rtl] .ah-ep__hint i{animation-name:ahEpSwipeR}
@keyframes ahEpSwipeR{0%{transform:translateX(0);opacity:0}25%{opacity:1}100%{transform:translateX(40px);opacity:0}}
@media (max-width:749px){.ah-ep__hint{display:flex}.ah-ep__deck-nav{display:none}}
@media (min-width:990px){.ah-ep__card{flex-basis:calc((100% - 48px)/4)}}
/* stacked event cards */
.ah-ep__stack{display:grid;gap:18px}
.ah-ep__ev{position:sticky;top:calc(88px + var(--k)*14px);border-radius:26px;padding:clamp(22px,4vw,40px);min-height:clamp(200px,34vw,300px);color:#fff;background:linear-gradient(135deg,var(--c1),var(--c2));display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:start;transform-origin:top center;will-change:transform;box-shadow:0 -10px 30px -20px rgba(0,0,0,.4)}
.ah-ep__ev-n{font-size:clamp(2.4rem,6vw,4rem);line-height:.9;font-weight:900;color:rgba(255,255,255,.22);font-variant-numeric:tabular-nums}
.ah-ep__ev h3{font-size:clamp(1.3rem,3vw,2rem);line-height:1.15;color:#fff;margin-bottom:10px!important}
.ah-ep__ev p{color:rgba(255,255,255,.86);max-width:38em}
.ah-ep__ev-tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.ah-ep__ev-tags span{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.14)}
.ah-ep__ev-tags .ah-ep__ic{width:20px;height:20px}
/* steps */
.ah-ep__steps{position:relative;display:grid;gap:22px;padding-inline-start:34px}
.ah-ep__line{position:absolute;inset-inline-start:11px;top:6px;bottom:6px;width:2px;background:#E3E7E4;border-radius:2px;overflow:hidden}
.ah-ep__line i{position:absolute;inset:0;background:var(--g);transform-origin:top;transform:scaleY(var(--p,1))}
.ah-ep__step{position:relative}
.ah-ep__step::before{content:"";position:absolute;inset-inline-start:-30px;top:4px;width:16px;height:16px;border-radius:50%;background:#fff;border:3px solid var(--g)}
.ah-ep__step b{display:block;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;color:var(--g)}
[dir=rtl] .ah-ep__step b{letter-spacing:0}
.ah-ep__step h3{font-size:1.15rem;margin:2px 0 4px!important}
.ah-ep__step p{color:var(--mut)}
@media (min-width:990px){.ah-ep__how{display:grid;grid-template-columns:.8fr 1.2fr;gap:48px;align-items:start}.ah-ep__how .ah-ep__h2{position:sticky;top:110px}}
/* quote builder */
.ah-ep__q{border-radius:30px;background:var(--gt);padding:clamp(22px,5vw,52px);display:grid;gap:28px}
@media (min-width:990px){.ah-ep__q{grid-template-columns:1.25fr .75fr;align-items:start}}
.ah-ep__q-sub{color:var(--mut);margin:-14px 0 22px!important}
.ah-ep__lbl{display:block;font-weight:800;margin:20px 0 10px}
.ah-ep__chips{display:flex;flex-wrap:wrap;gap:8px}
.ah-ep__chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid #CBD5CF;background:#fff;font:inherit;font-weight:700;font-size:.92rem;color:var(--ink);cursor:pointer;transition:transform .25s var(--ease),background .25s,color .25s,border-color .25s;-webkit-tap-highlight-color:transparent}
.ah-ep__chip .ah-ep__ic{width:18px;height:18px;color:var(--g)}
.ah-ep__chip:active{transform:scale(.94)}
.ah-ep__chip[aria-pressed=true]{background:var(--g);border-color:var(--g);color:#fff}
.ah-ep__chip[aria-pressed=true] .ah-ep__ic{color:var(--lime)}
.ah-ep__row{display:grid;gap:14px}
@media (min-width:600px){.ah-ep__row{grid-template-columns:1fr 1fr}}
.ah-ep__in{width:100%;min-height:50px;padding:0 16px;border-radius:14px;border:1px solid #CBD5CF;background:#fff;font:inherit;color:var(--ink)}
.ah-ep__in:focus{outline:2px solid var(--g);outline-offset:1px}
.ah-ep__range{width:100%;accent-color:var(--g)}
.ah-ep__qty{display:flex;align-items:center;gap:14px}
.ah-ep__qty output{min-width:64px;font-weight:900;font-size:1.3rem;color:var(--g);font-variant-numeric:tabular-nums}
.ah-ep__sum{position:sticky;top:96px;border-radius:24px;background:var(--gd);color:#fff;padding:26px}
.ah-ep__sum h3{color:#fff;font-size:1.2rem;margin-bottom:14px!important}
.ah-ep__sum ul{display:grid;gap:8px;margin-bottom:18px}
.ah-ep__sum li{display:flex;justify-content:space-between;gap:12px;font-size:.92rem;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:8px}
.ah-ep__sum li span:first-child{color:rgba(255,255,255,.62)}
.ah-ep__sum li span:last-child{text-align:end;font-weight:700}
.ah-ep__sum .ah-ep__btn{width:100%}
.ah-ep__sum-empty{opacity:.7;font-size:.9rem;margin-bottom:14px!important}
.ah-ep__waline{display:flex;align-items:center;gap:10px;margin-top:14px;color:rgba(255,255,255,.78);font-size:.88rem}
.ah-ep__waline a{color:#fff!important;font-weight:800}
/* faq */
.ah-ep__faq details{border-bottom:1px solid #E3E7E4;padding:16px 0}
.ah-ep__faq summary{cursor:pointer;font-weight:800;list-style:none;display:flex;justify-content:space-between;gap:12px}
.ah-ep__faq summary::-webkit-details-marker{display:none}
.ah-ep__faq summary::after{content:"+";font-size:1.4rem;line-height:1;color:var(--g);transition:transform .3s var(--ease)}
.ah-ep__faq details[open] summary::after{transform:rotate(45deg)}
.ah-ep__faq p{color:var(--mut);margin-top:8px!important}
/* sticky mobile bar */
.ah-ep__bar{position:fixed;inset-inline:12px;bottom:12px;z-index:60;display:flex;gap:10px;padding:10px;border-radius:20px;background:rgba(11,46,25,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 18px 40px -16px rgba(0,0,0,.5);transform:translate3d(0,140%,0);transition:transform .5s var(--ease)}
.ah-ep__bar.is-on{transform:none}
.ah-ep__bar .ah-ep__btn{flex:1;min-height:48px}
.ah-ep__bar .ah-ep__btn--wa{flex:0 0 48px;padding:0}
@media (min-width:990px){.ah-ep__bar{display:none}}
/* scroll reveal (only when JS is running) */
.ah-ep--js .ah-ep__rv{opacity:0;transform:translate3d(0,28px,0);transition:opacity .8s var(--ease),transform .8s var(--ease);transition-delay:calc(var(--i,0)*70ms)}
.ah-ep--js .ah-ep__rv.is-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){
  .ah-ep *,.ah-ep *::before,.ah-ep *::after{animation:none!important;transition:none!important}
  .ah-ep__w,.ah-ep__lead,.ah-ep__btns,.ah-ep__stats{opacity:1!important;transform:none!important}
  .ah-ep--js .ah-ep__rv{opacity:1;transform:none}
  .ah-ep__card,.ah-ep__ev{transform:none!important}
}
</style>
"""

JS = r"""
<script>
(function(){
  var root=document.querySelector('[data-ah-ep]'); if(!root) return;
  var calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('ah-ep--js');
  var rtl=root.getAttribute('dir')==='rtl';
  /* reveal on scroll */
  var rv=root.querySelectorAll('.ah-ep__rv');
  if('IntersectionObserver' in window && !calm){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target);}})},{threshold:.15,rootMargin:'0px 0px -8% 0px'});
    rv.forEach(function(el){io.observe(el)});
  } else rv.forEach(function(el){el.classList.add('is-in')});
  /* swipe deck: scale/tilt/opacity by distance from centre */
  var deck=root.querySelector('[data-deck]'), cards=deck?[].slice.call(deck.children):[], dots=root.querySelectorAll('.ah-ep__dot');
  function deckFx(){
    if(!deck) return; var r=deck.getBoundingClientRect(), cx=r.left+r.width/2, best=0, bd=1e9;
    cards.forEach(function(c,i){var b=c.getBoundingClientRect(), d=(b.left+b.width/2-cx)/r.width, a=Math.min(Math.abs(d),1);
      if(Math.abs(d)<bd){bd=Math.abs(d);best=i;}
      if(!calm && r.width<990){c.style.transform='scale('+(1-a*.12).toFixed(3)+') rotateY('+(-d*14).toFixed(2)+'deg)';c.style.opacity=(1-a*.45).toFixed(3);} else {c.style.transform='';c.style.opacity='';}
    });
    dots.forEach(function(dt,i){dt.classList.toggle('is-on',i===best)});
  }
  var ticking=false;
  function onDeck(){if(!ticking){ticking=true;requestAnimationFrame(function(){ticking=false;deckFx();});}}
  if(deck){deck.addEventListener('scroll',onDeck,{passive:true});window.addEventListener('resize',onDeck);deckFx();
    root.querySelectorAll('[data-deck-nav]').forEach(function(b){b.addEventListener('click',function(){var dir=b.getAttribute('data-deck-nav')==='next'?1:-1;if(rtl)dir=-dir;deck.scrollBy({left:dir*(cards[0].offsetWidth+16),behavior:calm?'auto':'smooth'});});});
    /* desktop drag-to-scroll */
    var down=false,sx=0,sl=0,moved=false;
    deck.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse')return;down=true;moved=false;sx=e.clientX;sl=deck.scrollLeft;deck.style.scrollSnapType='none';});
    window.addEventListener('pointermove',function(e){if(!down)return;var dx=e.clientX-sx;if(Math.abs(dx)>4)moved=true;deck.scrollLeft=sl-dx;});
    window.addEventListener('pointerup',function(){if(!down)return;down=false;deck.style.scrollSnapType='';});
    deck.addEventListener('click',function(e){if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
  }
  /* stacked event cards + hero parallax + steps line */
  var evs=[].slice.call(root.querySelectorAll('.ah-ep__ev')), orbit=root.querySelector('.ah-ep__orbit'), steps=root.querySelector('.ah-ep__steps'), line=root.querySelector('.ah-ep__line'), bar=root.querySelector('.ah-ep__bar'), hero=root.querySelector('.ah-ep__hero'), qbox=root.querySelector('#ah-ep-quote');
  function scrollFx(){
    var vh=window.innerHeight;
    if(!calm){
      evs.forEach(function(ev,i){var nx=evs[i+1]; if(!nx){ev.style.transform='';return;}
        var a=ev.getBoundingClientRect(), b=nx.getBoundingClientRect(), o=Math.max(0,Math.min(1,(a.bottom-b.top)/a.height));
        ev.style.transform='scale('+(1-o*.06).toFixed(4)+')';ev.style.opacity=(1-o*.35).toFixed(3);});
      if(orbit&&hero){var h=hero.getBoundingClientRect(); if(h.bottom>0) orbit.style.transform='translate3d(0,'+(h.top*-.18).toFixed(1)+'px,0)';}
    }
    if(steps&&line){var s=steps.getBoundingClientRect(), p=Math.max(0,Math.min(1,(vh*.75-s.top)/s.height)); line.style.setProperty('--p',calm?1:p.toFixed(3));}
    if(bar&&hero){var hb=hero.getBoundingClientRect().bottom, qb=qbox?qbox.getBoundingClientRect():null, inQ=qb&&qb.top<vh&&qb.bottom>0; bar.classList.toggle('is-on',hb<0&&!inQ);}
  }
  var t2=false; window.addEventListener('scroll',function(){if(!t2){t2=true;requestAnimationFrame(function(){t2=false;scrollFx();});}},{passive:true}); scrollFx();
  /* count-up stats */
  root.querySelectorAll('[data-count]').forEach(function(el){var end=parseFloat(el.getAttribute('data-count')), suf=el.getAttribute('data-suf')||''; if(calm||!('IntersectionObserver' in window))return;
    el.textContent='0'+suf; var o=new IntersectionObserver(function(es){if(!es[0].isIntersecting)return;o.disconnect();var t0=performance.now();(function f(t){var k=Math.min(1,(t-t0)/1100);el.textContent=Math.round(end*(1-Math.pow(1-k,3)))+suf;if(k<1)requestAnimationFrame(f);})(t0);});o.observe(el);});
  /* quote builder */
  var form=root.querySelector('[data-quote]'); if(!form) return;
  var L=JSON.parse(form.getAttribute('data-l')), wa=form.getAttribute('data-wa');
  var picked=[], ev='', extras=[];
  function toggle(list,v){var i=list.indexOf(v); if(i>-1) list.splice(i,1); else list.push(v);}
  function syncItems(){root.querySelectorAll('[data-item]').forEach(function(b){b.setAttribute('aria-pressed',picked.indexOf(b.getAttribute('data-item'))>-1?'true':'false');});}
  root.querySelectorAll('[data-item]').forEach(function(b){b.addEventListener('click',function(){toggle(picked,b.getAttribute('data-item'));syncItems();render();
    if(b.classList.contains('ah-ep__add')&&picked.indexOf(b.getAttribute('data-item'))>-1&&navigator.vibrate)navigator.vibrate(8);});});
  form.querySelectorAll('[data-ev]').forEach(function(b){b.addEventListener('click',function(){ev=ev===b.getAttribute('data-ev')?'':b.getAttribute('data-ev');form.querySelectorAll('[data-ev]').forEach(function(x){x.setAttribute('aria-pressed',x.getAttribute('data-ev')===ev?'true':'false')});render();});});
  form.querySelectorAll('[data-extra]').forEach(function(b){b.addEventListener('click',function(){toggle(extras,b.getAttribute('data-extra'));b.setAttribute('aria-pressed',extras.indexOf(b.getAttribute('data-extra'))>-1?'true':'false');render();});});
  var qty=form.querySelector('[name=qty]'), qout=form.querySelector('[data-qty-out]'), date=form.querySelector('[name=date]'), city=form.querySelector('[name=city]'), nm=form.querySelector('[name=org]');
  [qty,date,city,nm].forEach(function(i){i.addEventListener('input',render)});
  var sum=root.querySelector('[data-sum]'), empty=root.querySelector('[data-empty]'), send=root.querySelector('[data-send]');
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function render(){
    qout.textContent=qty.value+(qty.value==qty.max?'+':'');
    var rows=[[L.m_items,picked.join(L.sep)],[L.m_event,ev],[L.m_qty,qty.value+(qty.value==qty.max?'+':'')],[L.m_date,date.value],[L.m_city,city.value],[L.m_name,nm.value],[L.m_extra,extras.join(L.sep)]].filter(function(r){return r[1]});
    sum.innerHTML=rows.map(function(r){return '<li><span>'+esc(r[0])+'</span><span>'+esc(r[1])+'</span></li>'}).join('');
    empty.hidden=picked.length>0;
    var msg=L.head+'\n'+rows.map(function(r){return '• '+r[0]+': '+r[1]}).join('\n');
    send.href='https://wa.me/'+wa+'?text='+encodeURIComponent(msg);
    send.setAttribute('aria-disabled',picked.length?'false':'true');
  }
  send.addEventListener('click',function(e){if(!picked.length){e.preventDefault();empty.hidden=false;var s=root.querySelector('.ah-ep__chips');if(s)s.scrollIntoView({behavior:calm?'auto':'smooth',block:'center'});}});
  render();
})();
</script>
"""

EV_COLORS = [("#14532D", "#0B2E19"), ("#1d4ed8", "#0b1f5e"), ("#b91c1c", "#5f0f14"), ("#0f766e", "#073b37"), ("#0369a1", "#082f49")]
EV_TAGS = [["number", "medal", "gate", "barrier", "tshirt", "bag"], ["vest", "medal", "flag", "bracelet", "tent"], ["tshirt", "shorts", "medal", "flag", "id", "lanyard"],
           ["tent", "flag", "tshirt", "bag", "bracelet"], ["buoy", "medal", "number", "gate"]]


def build(lang):
    t = T[lang]
    pre = t["pre"]
    wa_text = t["msg_head"]
    out = [CSS, f'<div class="ah-ep" dir="{t["dir"]}" data-ah-ep>']
    # hero
    words = t["h1"].split(" ")
    h1 = " ".join(
        f'<span class="ah-ep__w" style="--i:{i}">{"<em>" + w + "</em>" if i == len(words) - 1 else w}</span>' for i, w in enumerate(words))
    stats = "".join(
        f'<div class="ah-ep__stat"><b {"data-count=" + chr(34) + v.rstrip("%") + chr(34) + (" data-suf=" + chr(34) + "%" + chr(34) if v.endswith("%") else "") if v.rstrip("%").isdigit() and int(v.rstrip("%")) > 1 else ""}>{v}</b><span>{lbl}</span></div>'
        for v, lbl in t["stats"])
    fl = "".join(f'<span class="ah-ep__fl ah-ep__fl--{i + 1}" style="--d:{i * -1.3:.1f}s">{icon(n)}</span>' for i, n in enumerate(["medal", "flag", "number", "tshirt", "gate"]))
    out.append(f'''<section class="ah-ep__hero">
<span class="ah-ep__blob ah-ep__blob--a"></span><span class="ah-ep__blob ah-ep__blob--b"></span><span class="ah-ep__grid"></span>
<div class="ah-ep__orbit" aria-hidden="true">{fl}</div>
<span class="ah-ep__eyebrow"><i></i>{t["eyebrow"]}</span>
<h1 class="ah-ep__h1">{h1}</h1>
<p class="ah-ep__lead">{t["lead"]}</p>
<div class="ah-ep__btns"><a class="ah-ep__btn" href="#ah-ep-quote">{t["cta"]}{icon("arrow", "ah-ep__ic ah-ep__arr")}</a><a class="ah-ep__btn ah-ep__btn--wa" href="https://wa.me/{WA}?text={quote(wa_text)}" target="_blank" rel="noopener">{icon("wa")}{t["cta2"]}</a></div>
<div class="ah-ep__stats">{stats}</div>
</section>''')
    mq = "".join(f'<span>{icon("spark")}{w}</span>' for w in t["marquee"])
    out.append(f'<div class="ah-ep__mq" aria-hidden="true"><div class="ah-ep__mq-track" dir="ltr">{mq}{mq}</div></div>')
    # deck
    cards = []
    for i, k in enumerate(ITEMS):
        name, desc = t["cards"][k]
        if k in PHOTO:
            media = f'<img src="{PH[PHOTO[k]]}?width=520" srcset="{PH[PHOTO[k]]}?width=360 360w, {PH[PHOTO[k]]}?width=520 520w" sizes="(min-width:990px) 280px, 78vw" alt="{name}" loading="lazy" width="520" height="520">'
        else:
            media = icon(k, "ah-ep__ic ah-ep__big")
        cards.append(f'''<article class="ah-ep__card" style="--h:{HUE[k]}"><div class="ah-ep__media">{media}<span class="ah-ep__badge">{icon(k)}</span><span class="ah-ep__num">{i + 1:02d}</span></div>
<div class="ah-ep__body"><h3>{name}</h3><p>{desc}</p><button type="button" class="ah-ep__add" data-item="{name}" aria-pressed="false">{icon("check")}<span>{t["add"]}</span></button></div></article>''')
    dots = "".join('<span class="ah-ep__dot"></span>' for _ in ITEMS)
    out.append(f'''<section class="ah-ep__sec">
<div class="ah-ep__deck-head ah-ep__rv"><div><span class="ah-ep__eyebrow"><i></i>{t["deck_eyebrow"]}</span><h2 class="ah-ep__h2">{t["deck"]}</h2></div>
<div class="ah-ep__deck-nav"><button type="button" class="ah-ep__nav ah-ep__nav--prev" data-deck-nav="prev" aria-label="Previous">{icon("arrow")}</button><button type="button" class="ah-ep__nav ah-ep__nav--next" data-deck-nav="next" aria-label="Next">{icon("arrow")}</button></div></div>
<p class="ah-ep__hint" aria-hidden="true"><i></i>{t["deck_hint"]}</p>
<div class="ah-ep__deck" data-deck>{"".join(cards)}</div>
<div class="ah-ep__dots" aria-hidden="true">{dots}</div>
</section>''')
    # stacked events
    evs = []
    for i, (h, p) in enumerate(t["events_list"]):
        c1, c2 = EV_COLORS[i]
        tags = "".join(f'<span title="{t["cards"][k][0]}">{icon(k)}</span>' for k in EV_TAGS[i])
        evs.append(f'<article class="ah-ep__ev" style="--k:{i};--c1:{c1};--c2:{c2}"><span class="ah-ep__ev-n">{i + 1:02d}</span><div><h3>{h}</h3><p>{p}</p><div class="ah-ep__ev-tags">{tags}</div></div></article>')
    out.append(f'''<section class="ah-ep__sec"><div class="ah-ep__rv"><span class="ah-ep__eyebrow"><i></i>{t["events_eyebrow"]}</span><h2 class="ah-ep__h2">{t["events"]}</h2></div>
<div class="ah-ep__stack">{"".join(evs)}</div></section>''')
    # steps
    steps = "".join(f'<div class="ah-ep__step ah-ep__rv" style="--i:{i}"><b>0{i + 1}</b><h3>{h}</h3><p>{p}</p></div>' for i, (h, p) in enumerate(t["steps"]))
    out.append(f'''<section class="ah-ep__sec ah-ep__how"><div class="ah-ep__rv"><span class="ah-ep__eyebrow"><i></i>{t["how_eyebrow"]}</span><h2 class="ah-ep__h2">{t["how"]}</h2></div>
<div class="ah-ep__steps"><span class="ah-ep__line"><i></i></span>{steps}</div></section>''')
    # quote
    chips = "".join(f'<button type="button" class="ah-ep__chip" data-item="{t["cards"][k][0]}" aria-pressed="false">{icon(k)}{t["cards"][k][0]}</button>' for k in ITEMS)
    evchips = "".join(f'<button type="button" class="ah-ep__chip" data-ev="{e}" aria-pressed="false">{e}</button>' for e in t["q_events"])
    extras = "".join(f'<button type="button" class="ah-ep__chip" data-extra="{e}" aria-pressed="false">{icon("check")}{e}</button>' for e in (t["q_logo"], t["q_names"]))
    L = {"head": t["msg_head"], "sep": "، " if lang == "ar" else ", ", **{k: t[k] for k in ("m_items", "m_event", "m_qty", "m_date", "m_city", "m_name", "m_extra")}}
    data_l = json.dumps(L, ensure_ascii=False).replace('"', "&quot;")
    out.append(f'''<section class="ah-ep__sec ah-ep__q ah-ep__rv" id="ah-ep-quote">
<div data-quote data-wa="{WA}" data-l="{data_l}">
<span class="ah-ep__eyebrow"><i></i>{t["q_eyebrow"]}</span><h2 class="ah-ep__h2">{t["q"]}</h2><p class="ah-ep__q-sub">{t["q_sub"]}</p>
<span class="ah-ep__lbl">{t["q_items"]}</span><div class="ah-ep__chips">{chips}</div>
<span class="ah-ep__lbl">{t["q_event"]}</span><div class="ah-ep__chips">{evchips}</div>
<label class="ah-ep__lbl" for="ah-ep-qty">{t["q_qty"]}</label>
<div class="ah-ep__qty"><input class="ah-ep__range" id="ah-ep-qty" name="qty" type="range" min="10" max="5000" step="10" value="200"><output data-qty-out>200</output></div>
<div class="ah-ep__row"><div><label class="ah-ep__lbl" for="ah-ep-date">{t["q_date"]}</label><input class="ah-ep__in" id="ah-ep-date" name="date" type="date"></div>
<div><label class="ah-ep__lbl" for="ah-ep-city">{t["q_city"]}</label><input class="ah-ep__in" id="ah-ep-city" name="city" type="text" placeholder="{t["q_city_ph"]}" autocomplete="address-level2"></div></div>
<label class="ah-ep__lbl" for="ah-ep-org">{t["q_name"]}</label><input class="ah-ep__in" id="ah-ep-org" name="org" type="text" placeholder="{t["q_name_ph"]}" autocomplete="organization">
<span class="ah-ep__lbl"></span><div class="ah-ep__chips">{extras}</div>
</div>
<aside class="ah-ep__sum"><h3>{t["summary"]}</h3><p class="ah-ep__sum-empty" data-empty>{t["empty"]}</p><ul data-sum></ul>
<a class="ah-ep__btn ah-ep__btn--wa" data-send href="https://wa.me/{WA}" target="_blank" rel="noopener">{icon("wa")}{t["send"]}</a>
<p class="ah-ep__waline">{icon("wa")}<span>{t["wa_line"]}: <a href="https://wa.me/{WA}" target="_blank" rel="noopener" dir="ltr">{WA_DISPLAY}</a></span></p></aside>
</section>''')
    faqs = "".join(f'<details><summary>{q}</summary><p>{a}</p></details>' for q, a in t["faqs"])
    out.append(f'<section class="ah-ep__sec ah-ep__faq ah-ep__rv"><h2 class="ah-ep__h2">{t["faq"]}</h2>{faqs}</section>')
    out.append(f'<div class="ah-ep__bar"><a class="ah-ep__btn" href="#ah-ep-quote">{t["sticky"]}{icon("arrow", "ah-ep__ic ah-ep__arr")}</a><a class="ah-ep__btn ah-ep__btn--wa" href="https://wa.me/{WA}" target="_blank" rel="noopener" aria-label="WhatsApp {WA_DISPLAY}">{icon("wa")}</a></div>')
    out.append("</div>")
    out.append(JS)
    return "\n".join(out)


if __name__ == "__main__":
    for lang in ("en", "ar"):
        p = HERE / f"event-production.{lang}.html"
        p.write_text(build(lang), encoding="utf-8")
        print(p, p.stat().st_size, "bytes")

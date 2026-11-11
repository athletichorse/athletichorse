#!/usr/bin/env python3
"""Build the Events & Team Wear Production page body (EN + AR).

Outputs pages/events-team-wear.en.html and pages/events-team-wear.ar.html.
Upload: EN as the page body, AR as the `body_html` translation (locale ar).
Motion rules: transform/opacity only, everything disabled under
prefers-reduced-motion, content fully visible without JS.
"""
import json
import pathlib

HERE = pathlib.Path(__file__).parent
IMG = "/cdn/shop/files/"
I = {
    "kit": IMG + "rn-image_picker_lib_temp_9af26313-093c-4f17-acd2-ba13589dd515.jpg",
    "vest": IMG + "553a777f-07aa-4524-b486-611c26369333.png",
    "tee": IMG + "6dc90e74-50d1-47b9-ac0e-7bfab7d4d697-1.png",
    "gi": IMG + "1cab230c-7f30-4a2c-b230-49987a99f0c9.png",
    "medal": IMG + "rn-image_picker_lib_temp_006474f0-b515-4aee-970f-a2af8766822f.png",
    "trophy": IMG + "50DCA2E6-D12D-48A1-8700-85555F137829.jpg",
    "arm": IMG + "WhatsApp-Image-2025-08-24-at-21.29.02_3c1c4b24_dd64d437-b6e4-4eec-a76d-2ff8596f404e.jpg",
}
I["trophy"] = IMG + "rn-image_picker_lib_temp_0bbe3731-7dd3-4958-b6bd-865a5a0a8c3c.png"  # football-trophy (not the World Cup replica)
WA = "966541770519"

T = {
    "en": {
        "dir": "ltr", "pre": "",
        "eyebrow": "Events & team wear production",
        "h1": "Your team. Your colours. Made for game day.",
        "lead": "Custom kits, training vests, event T-shirts, martial arts uniforms, medals and trophies for schools, academies, clubs, companies and tournaments across Saudi Arabia.",
        "cta": "Request a quote on WhatsApp",
        "cta2": "Build your quote",
        "sports": ["Football", "Basketball", "Volleyball", "Handball", "Karate", "Taekwondo", "Swimming", "Running", "Padel", "School sports days", "Corporate events", "Tournaments"],
        "what": "What we produce",
        "cards": [
            ("kit", "Team kits & jerseys", "Football, basketball and volleyball kits with names and numbers."),
            ("vest", "Training vests & bibs", "Bright, numbered vests for academies, schools and coaches."),
            ("tee", "T-shirts & tracksuits", "Event, staff and fan wear with your logo."),
            ("gi", "Martial arts uniforms", "Karate and taekwondo uniforms and belts for clubs."),
            ("medal", "Medals & trophies", "Custom-design medals, cups and trophies for every winner."),
            ("arm", "Event accessories", "Flags, captain armbands, caps and bags."),
        ],
        "how": "How it works",
        "steps": [
            ("Send your request", "Tell us the item, quantity, sizes, colours and send your logo on WhatsApp."),
            ("Quote & design preview", "You get a price and a preview of the design before anything is produced."),
            ("Approve", "Confirm the design, and production starts."),
            ("Delivery", "We deliver to your school, club or event location anywhere in Saudi Arabia."),
        ],
        "build": "Build your quote",
        "build_sub": "Pick what you need. We'll write the WhatsApp message for you.",
        "q_sport": "Sport or event", "q_items": "Items", "q_qty": "Quantity (approx.)",
        "q_colour": "Main colour", "q_extra": "Extras",
        "items": ["Team kits", "Training vests", "T-shirts", "Tracksuits", "Martial arts uniforms", "Medals", "Trophies", "Accessories"],
        "colours": [("Green", "#14574a"), ("Blue", "#1d4ed8"), ("Red", "#c81e1e"), ("Black", "#111827"), ("White", "#ffffff"), ("Yellow", "#facc15"), ("Orange", "#f97316"), ("Purple", "#7e22ce")],
        "extras": ["Names & numbers", "Logo printing"],
        "summary": "Your request", "send": "Send on WhatsApp", "pcs": "pcs",
        "msg_head": "Hello Alhisan Alriyadi, I would like a quote for events / team wear:",
        "m_sport": "Sport/event", "m_items": "Items", "m_qty": "Quantity", "m_colour": "Colour", "m_extra": "Extras",
        "none": "—", "about": "about",
        "phone": "Teams & events orders",
        "browse": "Browse ready stock",
        "links": [("trophy-cups-medals", "Trophies & Medals"), ("football-equipment", "Football Equipment"), ("referee-coach-equipment", "Referee & Coach"), ("karate-equipment", "Karate")],
        "email": "Or email us at",
    },
    "ar": {
        "dir": "rtl", "pre": "/ar",
        "eyebrow": "إنتاج ملابس الفعاليات والفرق",
        "h1": "فريقك. ألوانك. جاهز ليوم المباراة.",
        "lead": "أطقم مخصصة وصدريات تدريب وتيشيرتات فعاليات وبدل فنون قتالية وميداليات وكؤوس للمدارس والأكاديميات والأندية والشركات والبطولات في جميع أنحاء المملكة.",
        "cta": "اطلب عرض سعر عبر واتساب",
        "cta2": "صمّم طلبك",
        "sports": ["كرة القدم", "كرة السلة", "الكرة الطائرة", "كرة اليد", "الكاراتيه", "التايكوندو", "السباحة", "الجري", "البادل", "الأيام الرياضية المدرسية", "فعاليات الشركات", "البطولات"],
        "what": "ماذا ننتج",
        "cards": [
            ("kit", "أطقم وقمصان الفرق", "أطقم كرة قدم وسلة وطائرة مع الأسماء والأرقام."),
            ("vest", "صدريات التدريب", "صدريات ملونة ومرقمة للأكاديميات والمدارس والمدربين."),
            ("tee", "تيشيرتات وبدل رياضية", "ملابس للفعاليات والموظفين والجماهير بشعارك."),
            ("gi", "بدل الفنون القتالية", "بدل وأحزمة كاراتيه وتايكوندو للأندية."),
            ("medal", "ميداليات وكؤوس", "ميداليات وكؤوس ودروع بتصميم خاص لكل فائز."),
            ("arm", "إكسسوارات الفعاليات", "أعلام وشارات كابتن وكابات وشنط."),
        ],
        "how": "كيف نعمل",
        "steps": [
            ("أرسل طلبك", "أخبرنا بالمنتج والكمية والمقاسات والألوان وأرسل شعارك عبر واتساب."),
            ("عرض السعر ومعاينة التصميم", "تستلم السعر ومعاينة للتصميم قبل بدء الإنتاج."),
            ("الاعتماد", "اعتمد التصميم ونبدأ الإنتاج."),
            ("التوصيل", "نوصل إلى مدرستك أو ناديك أو موقع فعاليتك في أي مكان بالمملكة."),
        ],
        "build": "صمّم طلبك",
        "build_sub": "اختر ما تحتاجه، ونكتب لك رسالة واتساب جاهزة.",
        "q_sport": "الرياضة أو الفعالية", "q_items": "المنتجات", "q_qty": "الكمية (تقريباً)",
        "q_colour": "اللون الأساسي", "q_extra": "إضافات",
        "items": ["أطقم فرق", "صدريات تدريب", "تيشيرتات", "بدل رياضية", "بدل فنون قتالية", "ميداليات", "كؤوس", "إكسسوارات"],
        "colours": [("أخضر", "#14574a"), ("أزرق", "#1d4ed8"), ("أحمر", "#c81e1e"), ("أسود", "#111827"), ("أبيض", "#ffffff"), ("أصفر", "#facc15"), ("برتقالي", "#f97316"), ("بنفسجي", "#7e22ce")],
        "extras": ["الأسماء والأرقام", "طباعة الشعار"],
        "summary": "طلبك", "send": "أرسل عبر واتساب", "pcs": "قطعة",
        "msg_head": "مرحباً الحصان الرياضي، أرغب في عرض سعر لملابس الفعاليات / الفرق:",
        "m_sport": "الرياضة/الفعالية", "m_items": "المنتجات", "m_qty": "الكمية", "m_colour": "اللون", "m_extra": "إضافات",
        "none": "—", "about": "حوالي",
        "phone": "طلبات الفرق والفعاليات",
        "browse": "تصفح المنتجات المتوفرة",
        "links": [("trophy-cups-medals", "الكؤوس والميداليات"), ("football-equipment", "معدات كرة القدم"), ("referee-coach-equipment", "مستلزمات الحكام والمدربين"), ("karate-equipment", "الكاراتيه")],
        "email": "أو راسلنا على",
    },
}

CSS = r"""
<style>
.ah-ev{--g:#14574a;--gd:#0b3a31;--gl:#e9f4f0;--gold:#e2b33c;--wa:#25d366;--ink:#10231f;--mut:#4b5f5a;--ease:cubic-bezier(.22,1,.36,1);color:var(--ink);line-height:1.6;max-width:1180px;margin:0 auto;overflow:hidden}
.ah-ev *{box-sizing:border-box}
.ah-ev h2,.ah-ev h3,.ah-ev p{margin:0}
.ah-ev ul,.ah-ev ol{list-style:none;margin:0;padding:0}
.rte .ah-ev ul>li::before,.rte .ah-ev ol>li::before{content:none;display:none}
.rte .ah-ev li{margin:0;padding:0}
.ah-ev a{text-decoration:none}
.ah-ev img{display:block;max-width:100%;height:auto}
.ah-ev__sec{margin:72px 0}
.ah-ev__h2{font-size:clamp(1.6rem,3.2vw,2.4rem);line-height:1.15;letter-spacing:-.01em;margin-bottom:24px!important}
/* hero */
.ah-ev__hero{position:relative;border-radius:28px;background:radial-gradient(120% 140% at 0% 0%,#1c7a66 0%,var(--g) 38%,var(--gd) 100%);color:#fff;padding:clamp(28px,5vw,64px);display:grid;grid-template-columns:1.05fr .95fr;gap:32px;align-items:center;isolation:isolate;overflow:hidden}
.ah-ev__hero::before{content:"";position:absolute;inset:-30%;background:conic-gradient(from 0deg,transparent 0 70%,rgba(226,179,60,.22) 80%,transparent 90%);animation:ahEvSpin 18s linear infinite;z-index:-1}
.ah-ev__hero::after{content:"";position:absolute;inset:0;background:radial-gradient(60% 60% at 80% 30%,rgba(255,255,255,.10),transparent 70%);z-index:-1}
@keyframes ahEvSpin{to{transform:rotate(1turn)}}
.ah-ev__eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin-bottom:14px}
.ah-ev__eyebrow::before{content:"";width:28px;height:2px;background:currentColor;transform-origin:left;animation:ahEvLine 1s var(--ease) .2s both}
[dir=rtl] .ah-ev__eyebrow{letter-spacing:0}
[dir=rtl] .ah-ev__eyebrow::before{transform-origin:right}
@keyframes ahEvLine{from{transform:scaleX(0)}}
.ah-ev__h1{font-size:clamp(2rem,5vw,3.6rem);line-height:1.08;letter-spacing:-.02em;color:#fff;margin:0 0 20px!important}
.ah-ev__w{display:inline-block;opacity:0;transform:translateY(.6em);animation:ahEvUp .8s var(--ease) both;animation-delay:calc(var(--i)*70ms + 150ms)}
@keyframes ahEvUp{to{opacity:1;transform:none}}
.ah-ev__lead{font-size:1.08rem;color:rgba(255,255,255,.86);max-width:36em;margin-bottom:26px!important}
.ah-ev__btns{display:flex;flex-wrap:wrap;gap:12px}
.ah-ev__btn{position:relative;display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:999px;font-weight:700;color:#fff!important;background:var(--wa);overflow:hidden;transition:transform .35s var(--ease);will-change:transform}
.ah-ev__btn::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);transform:skewX(-20deg) translateX(0);animation:ahEvShine 3.2s ease-in-out 1.2s infinite}
@keyframes ahEvShine{0%,60%{transform:skewX(-20deg) translateX(0)}100%{transform:skewX(-20deg) translateX(420%)}}
.ah-ev__btn--ghost{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.ah-ev__btn--ghost::after{display:none}
.ah-ev__btn:active{transform:scale(.97)}
.ah-ev__btn svg{width:20px;height:20px;flex:none}
.ah-ev__collage{position:relative;aspect-ratio:1/1;max-width:520px;width:100%;justify-self:center}
.ah-ev__ph{position:absolute;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 20px 50px rgba(0,0,0,.28);will-change:transform}
.ah-ev__ph img{width:100%;height:100%;object-fit:cover}
.ah-ev__ph--a{inset:6% 22% 20% 4%;border-radius:26px}
.ah-ev__ph--b{width:34%;aspect-ratio:1;top:0;inset-inline-end:0;padding:8px}
.ah-ev__ph--c{width:30%;aspect-ratio:1;bottom:2%;inset-inline-end:4%;padding:10px}
.ah-ev__ph--d{width:26%;aspect-ratio:1;bottom:0;inset-inline-start:14%;padding:8px}
.ah-ev__ph--b img,.ah-ev__ph--c img,.ah-ev__ph--d img{object-fit:contain}
.ah-ev__float{animation:ahEvFloat 6s ease-in-out infinite}
.ah-ev__float--2{animation-duration:7.5s;animation-delay:-2s}
.ah-ev__float--3{animation-duration:8.5s;animation-delay:-4s}
@keyframes ahEvFloat{50%{transform:translateY(-10px) rotate(-2deg)}}
.ah-ev__pop{opacity:0;transform:scale(.85) translateY(20px);animation:ahEvPop .9s var(--ease) both;animation-delay:calc(var(--i)*120ms + 300ms)}
@keyframes ahEvPop{to{opacity:1;transform:none}}
/* marquee */
.ah-ev__mq{margin:28px 0 0;overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.ah-ev__mqt{display:flex;gap:12px;width:max-content;animation:ahEvMq 38s linear infinite}
[dir=rtl] .ah-ev__mqt{animation-name:ahEvMqR}
.ah-ev__mq:hover .ah-ev__mqt{animation-play-state:paused}
.ah-ev__chip{white-space:nowrap;padding:10px 18px;border-radius:999px;background:var(--gl);color:var(--g);font-weight:700;font-size:.95rem}
.ah-ev__chip:nth-child(3n+2){background:#fdf4dc;color:#8a6510}
@keyframes ahEvMq{to{transform:translateX(-50%)}}
@keyframes ahEvMqR{to{transform:translateX(50%)}}
/* reveal (only when JS is on) */
.ah-ev--js [data-rv]{opacity:0;transform:translateY(28px);transition:opacity .8s var(--ease),transform .8s var(--ease);transition-delay:calc(var(--i,0)*80ms)}
.ah-ev--js [data-rv].is-in{opacity:1;transform:none}
/* cards */
.ah-ev__cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;perspective:1000px}
.ah-ev__card{position:relative;border-radius:22px;background:#fff;box-shadow:0 1px 0 rgba(16,35,31,.06),0 10px 30px rgba(16,35,31,.08);overflow:hidden;transform-style:preserve-3d}
.ah-ev__tilt{transition:transform .5s var(--ease);will-change:transform;height:100%}
.ah-ev__cimg{aspect-ratio:4/3;background:linear-gradient(180deg,#f3f8f6,#e3efeb);overflow:hidden}
.ah-ev__cimg img{width:100%;height:100%;object-fit:contain;padding:12px;transition:transform .7s var(--ease)}
.ah-ev__cimg--cover img{object-fit:cover;padding:0}
.ah-ev__card:hover .ah-ev__cimg img{transform:scale(1.07)}
.ah-ev__cb{padding:16px 18px 20px}
.ah-ev__cb h3{font-size:1.1rem;color:var(--g);margin-bottom:4px}
.ah-ev__cb p{color:var(--mut);font-size:.95rem}
.ah-ev__num{position:absolute;top:12px;inset-inline-start:12px;width:30px;height:30px;border-radius:50%;background:var(--g);color:#fff;font-weight:700;font-size:.85rem;display:flex;align-items:center;justify-content:center;transform:translateZ(30px)}
.ah-ev__glare{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at var(--gx,50%) var(--gy,0%),rgba(255,255,255,.55),transparent 45%);opacity:0;transition:opacity .4s}
.ah-ev__card:hover .ah-ev__glare{opacity:1}
/* steps */
.ah-ev__steps{position:relative;padding-inline-start:64px}
.ah-ev__stepl{display:grid;gap:26px}
.ah-ev__rail,.ah-ev__prog{position:absolute;inset-inline-start:21px;top:8px;bottom:8px;width:4px;border-radius:4px;background:var(--gl)}
.ah-ev__prog{background:linear-gradient(var(--gold),var(--g));transform-origin:top;transform:scaleY(var(--p,0))}
.ah-ev__step{position:relative}
.ah-ev__dot{position:absolute;inset-inline-start:-64px;top:0;width:46px;height:46px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 3px var(--gl);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--g);transition:transform .5s var(--ease)}
.ah-ev__dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--g);transform:scale(0);transition:transform .5s var(--ease);z-index:-1}
.ah-ev__dot{isolation:isolate}
.ah-ev__step.is-on .ah-ev__dot{color:#fff;transform:scale(1.06)}
.ah-ev__step.is-on .ah-ev__dot::after{transform:scale(1)}
.ah-ev__step h3{font-size:1.15rem;margin-bottom:2px}
.ah-ev__step p{color:var(--mut)}
/* builder */
.ah-ev__build{display:grid;grid-template-columns:1.25fr .75fr;gap:24px;align-items:start}
.ah-ev__panel{background:#fff;border-radius:24px;padding:24px;box-shadow:0 10px 30px rgba(16,35,31,.08)}
.ah-ev__fs{border:0;margin:0 0 22px;padding:0;min-width:0}
.ah-ev__fs legend{font-weight:700;margin-bottom:10px;padding:0}
.ah-ev__opts{display:flex;flex-wrap:wrap;gap:8px}
.ah-ev__opt{position:relative}
.ah-ev__opt input{position:absolute;opacity:0;pointer-events:none}
.ah-ev__opt span{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;border:1.5px solid #d6e3df;cursor:pointer;font-weight:600;font-size:.92rem;transition:transform .25s var(--ease),background-color .25s,color .25s,border-color .25s;user-select:none}
.ah-ev__opt span:active{transform:scale(.95)}
.ah-ev__opt input:checked+span{background:var(--g);border-color:var(--g);color:#fff}
.ah-ev__opt input:focus-visible+span{outline:3px solid var(--gold);outline-offset:2px}
.ah-ev__sw{width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
.ah-ev__qty{display:flex;align-items:center;gap:16px}
.ah-ev__qty input{flex:1;accent-color:var(--g)}
.ah-ev__qv{min-width:4.5em;text-align:center;font-weight:800;font-size:1.3rem;color:var(--g);font-variant-numeric:tabular-nums}
.ah-ev__sum{position:sticky;top:90px;border-radius:24px;padding:24px;color:#fff;background:linear-gradient(160deg,var(--g),var(--gd))}
.ah-ev__sum h3{color:#fff;font-size:1.2rem;margin-bottom:14px}
.ah-ev__sum dl{margin:0 0 18px;display:grid;gap:10px}
.ah-ev__sum dt{font-size:.78rem;opacity:.7;text-transform:uppercase;letter-spacing:.08em}
[dir=rtl] .ah-ev__sum dt{letter-spacing:0}
.ah-ev__sum dd{margin:0;font-weight:700}
.ah-ev__bump{animation:ahEvBump .45s var(--ease)}
@keyframes ahEvBump{40%{transform:scale(1.06)}}
.ah-ev__swatch{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-inline-end:6px;box-shadow:0 0 0 2px rgba(255,255,255,.6)}
.ah-ev__sum .ah-ev__btn{width:100%;justify-content:center}
/* footer bits */
.ah-ev__band{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;border-radius:24px;padding:24px 28px;background:var(--gl)}
.ah-ev__band strong{color:var(--g);font-size:1.1rem}
.ah-ev__links{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px!important}
.ah-ev__links a{padding:8px 14px;border-radius:999px;background:#fff;color:var(--g);font-weight:600;box-shadow:inset 0 0 0 1px #d6e3df;transition:transform .25s var(--ease)}
.ah-ev__links a:hover{transform:translateY(-2px)}
.ah-ev__tel{unicode-bidi:isolate;direction:ltr;display:inline-block}
@media (max-width:900px){
.ah-ev__hero{grid-template-columns:1fr}
.ah-ev__collage{max-width:420px}
.ah-ev__cards{grid-template-columns:repeat(2,1fr)}
.ah-ev__build{grid-template-columns:1fr}
.ah-ev__sum{position:relative;top:0}
}
@media (max-width:560px){
.ah-ev__sec{margin:48px 0}
.ah-ev__hero{border-radius:22px}
.ah-ev__cards{grid-template-columns:1fr 1fr;gap:12px}
.ah-ev__cb{padding:12px 12px 14px}
.ah-ev__cb h3{font-size:.98rem}
.ah-ev__cb p{font-size:.85rem}
.ah-ev__btn{width:100%;justify-content:center}
}
@media (prefers-reduced-motion:reduce){
.ah-ev *,.ah-ev *::before,.ah-ev *::after{animation:none!important;transition:none!important}
.ah-ev__w,.ah-ev__pop{opacity:1;transform:none}
.ah-ev--js [data-rv]{opacity:1;transform:none}
.ah-ev__mqt{flex-wrap:wrap;width:auto}
.ah-ev__mq{-webkit-mask:none;mask:none}
.ah-ev__prog{transform:scaleY(1)}
}
</style>
"""

JS = r"""
<script>
(function(){
var root=document.currentScript&&document.currentScript.previousElementSibling;
if(!root||!root.classList.contains('ah-ev'))root=document.querySelector('.ah-ev');
if(!root)return;
var RM=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var FINE=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
root.classList.add('ah-ev--js');
/* reveal */
var rv=root.querySelectorAll('[data-rv]');
if(RM||!('IntersectionObserver' in window)){rv.forEach(function(e){e.classList.add('is-in')})}
else{var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -6% 0px'});rv.forEach(function(e){io.observe(e)})}
/* scroll-linked: hero parallax + steps progress */
var par=root.querySelectorAll('[data-par]'),steps=root.querySelector('.ah-ev__steps'),prog=root.querySelector('.ah-ev__prog'),items=root.querySelectorAll('.ah-ev__step'),tick=false;
function frame(){tick=false;var vh=window.innerHeight;
 if(!RM){par.forEach(function(el){var r=el.parentNode.getBoundingClientRect();if(r.bottom<0||r.top>vh)return;var c=(r.top+r.height/2-vh/2)/vh;el.style.transform='translate3d(0,'+(c*parseFloat(el.dataset.par)*-60).toFixed(1)+'px,0)'})}
 if(steps&&prog){var s=steps.getBoundingClientRect();var p=Math.min(1,Math.max(0,(vh*0.6-s.top)/s.height));prog.style.setProperty('--p',RM?1:p.toFixed(3));
  items.forEach(function(it){var r=it.getBoundingClientRect();it.classList.toggle('is-on',RM||r.top<vh*0.6)})}}
function onScroll(){if(!tick){tick=true;requestAnimationFrame(frame)}}
window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onScroll);frame();
/* 3D tilt + glare on cards */
if(FINE&&!RM){root.querySelectorAll('.ah-ev__card').forEach(function(c){var t=c.querySelector('.ah-ev__tilt'),g=c.querySelector('.ah-ev__glare');
 c.addEventListener('pointermove',function(e){var r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;
  t.style.transition='transform .15s ease-out';t.style.transform='rotateX('+((.5-y)*10).toFixed(2)+'deg) rotateY('+((x-.5)*12).toFixed(2)+'deg) translateZ(0)';
  g.style.setProperty('--gx',(x*100)+'%');g.style.setProperty('--gy',(y*100)+'%')});
 c.addEventListener('pointerleave',function(){t.style.transition='';t.style.transform=''})})
/* magnetic buttons */
 root.querySelectorAll('[data-mag]').forEach(function(b){b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+((e.clientX-r.left-r.width/2)*.18).toFixed(1)+'px,'+((e.clientY-r.top-r.height/2)*.25).toFixed(1)+'px)'});
  b.addEventListener('pointerleave',function(){b.style.transform=''})})}
/* quote builder */
var f=root.querySelector('.ah-ev__form');if(!f)return;var L=JSON.parse(f.dataset.l);
var qty=f.querySelector('input[type=range]'),qv=root.querySelector('.ah-ev__qv'),shown=+qty.value;
function vals(n){return Array.prototype.map.call(f.querySelectorAll('input[name='+n+']:checked'),function(i){return i.value})}
function bump(el){if(RM||!el)return;el.classList.remove('ah-ev__bump');void el.offsetWidth;el.classList.add('ah-ev__bump')}
function count(to){if(RM){qv.textContent=to;return}var from=shown,t0=performance.now();shown=to;
 (function st(now){var k=Math.min(1,(now-t0)/350),e=1-Math.pow(1-k,3);qv.textContent=Math.round(from+(to-from)*e);if(k<1)requestAnimationFrame(st)})(t0)}
function upd(ev){var sp=vals('sp')[0]||L.none,it=vals('it'),co=f.querySelector('input[name=co]:checked'),ex=vals('ex'),q=+qty.value;
 if(ev&&ev.target===qty)count(q);
 var d={sp:sp,it:it.length?it.join(L.sep):L.none,q:L.about+' '+q+' '+L.pcs,co:co?co.value:L.none,ex:ex.length?ex.join(L.sep):L.none};
 Object.keys(d).forEach(function(k){var el=root.querySelector('[data-s='+k+']');if(!el)return;var html=(k==='co'&&co?'<span class="ah-ev__swatch" style="background:'+co.dataset.hex+'"></span>':'')+d[k].replace(/</g,'&lt;');
  if(el.innerHTML!==html){el.innerHTML=html;bump(el)}});
 var msg=L.head+'\n• '+L.sp+': '+d.sp+'\n• '+L.it+': '+d.it+'\n• '+L.q+': '+d.q+'\n• '+L.co+': '+d.co+'\n• '+L.ex+': '+d.ex;
 root.querySelector('.ah-ev__send').href='https://wa.me/'+L.wa+'?text='+encodeURIComponent(msg)}
f.addEventListener('input',upd);f.addEventListener('change',upd);upd();
})();
</script>
"""

WA_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5 5.1-1.3A9.9 9.9 0 1 0 12.04 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-3-.2-.3a8.2 8.2 0 1 1 6.9 3.8zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z"/></svg>'


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def img(key, w=600, cls=""):
    return f'<img src="{I[key]}?width={w}" srcset="{I[key]}?width={w//2} {w//2}w, {I[key]}?width={w} {w}w" sizes="(max-width:560px) 50vw, 360px" alt="" loading="lazy" decoding="async"{cls}>'


def build(lang):
    t = T[lang]
    sep = "، " if lang == "ar" else ", "
    first_msg = t["msg_head"]
    wa_link = f"https://wa.me/{WA}?text=" + __import__("urllib.parse").parse.quote(first_msg)
    words = t["h1"].split(" ")
    h1 = " ".join(f'<span class="ah-ev__w" style="--i:{i}">{esc(w)}</span>' for i, w in enumerate(words))
    chips = "".join(f'<li class="ah-ev__chip">{esc(s)}</li>' for s in t["sports"])
    cards = ""
    for i, (k, h, p) in enumerate(t["cards"]):
        cover = " ah-ev__cimg--cover" if k == "kit" else ""
        cards += (f'<li class="ah-ev__card" data-rv style="--i:{i % 3}"><div class="ah-ev__tilt">'
                  f'<span class="ah-ev__num">{i + 1}</span>'
                  f'<div class="ah-ev__cimg{cover}">{img(k)}</div>'
                  f'<div class="ah-ev__cb"><h3>{esc(h)}</h3><p>{esc(p)}</p></div></div>'
                  f'<span class="ah-ev__glare"></span></li>')
    steps = "".join(
        f'<li class="ah-ev__step" data-rv style="--i:{i}"><span class="ah-ev__dot">{i + 1}</span><h3>{esc(h)}</h3><p>{esc(p)}</p></li>'
        for i, (h, p) in enumerate(t["steps"]))
    def opts(name, vals, typ, checked=()):
        return "".join(
            f'<label class="ah-ev__opt"><input type="{typ}" name="{name}" value="{esc(v)}"{" checked" if v in checked else ""}><span>{esc(v)}</span></label>'
            for v in vals)
    colours = "".join(
        f'<label class="ah-ev__opt"><input type="radio" name="co" value="{esc(n)}" data-hex="{h}"{" checked" if i == 0 else ""}><span><i class="ah-ev__sw" style="background:{h}"></i>{esc(n)}</span></label>'
        for i, (n, h) in enumerate(t["colours"]))
    L = {"head": t["msg_head"], "sp": t["m_sport"], "it": t["m_items"], "q": t["m_qty"], "co": t["m_colour"], "ex": t["m_extra"],
         "none": t["none"], "about": t["about"], "pcs": t["pcs"], "sep": sep, "wa": WA}
    links = "".join(f'<a href="{t["pre"]}/collections/{h}">{esc(n)}</a>' for h, n in t["links"])
    html = f"""{CSS}
<div class="ah-ev" dir="{t['dir']}">
<section class="ah-ev__hero">
 <div>
  <p class="ah-ev__eyebrow">{esc(t['eyebrow'])}</p>
  <h2 class="ah-ev__h1">{h1}</h2>
  <p class="ah-ev__lead">{esc(t['lead'])}</p>
  <div class="ah-ev__btns">
   <a class="ah-ev__btn" data-mag href="{wa_link}" target="_blank" rel="noopener">{WA_SVG}{esc(t['cta'])}</a>
   <a class="ah-ev__btn ah-ev__btn--ghost" data-mag href="#ah-ev-build">{esc(t['cta2'])}</a>
  </div>
 </div>
 <div class="ah-ev__collage" aria-hidden="true">
  <div class="ah-ev__ph ah-ev__ph--a ah-ev__pop" style="--i:0"><div data-par="0.6" style="height:100%">{img('kit', 800)}</div></div>
  <div class="ah-ev__ph ah-ev__ph--b ah-ev__pop" style="--i:1"><div class="ah-ev__float" style="height:100%"><div data-par="1.4" style="height:100%">{img('medal', 400)}</div></div></div>
  <div class="ah-ev__ph ah-ev__ph--c ah-ev__pop" style="--i:2"><div class="ah-ev__float ah-ev__float--2" style="height:100%"><div data-par="1" style="height:100%">{img('trophy', 400)}</div></div></div>
  <div class="ah-ev__ph ah-ev__ph--d ah-ev__pop" style="--i:3"><div class="ah-ev__float ah-ev__float--3" style="height:100%"><div data-par="1.8" style="height:100%">{img('arm', 400)}</div></div></div>
 </div>
</section>
<div class="ah-ev__mq"><ul class="ah-ev__mqt">{chips}{chips.replace('<li class', '<li aria-hidden="true" class')}</ul></div>

<section class="ah-ev__sec">
 <h2 class="ah-ev__h2" data-rv>{esc(t['what'])}</h2>
 <ul class="ah-ev__cards">{cards}</ul>
</section>

<section class="ah-ev__sec">
 <h2 class="ah-ev__h2" data-rv>{esc(t['how'])}</h2>
 <div class="ah-ev__steps"><span class="ah-ev__rail" aria-hidden="true"></span><span class="ah-ev__prog" aria-hidden="true"></span><ol class="ah-ev__stepl">{steps}</ol></div>
</section>

<section class="ah-ev__sec" id="ah-ev-build">
 <h2 class="ah-ev__h2" data-rv>{esc(t['build'])}</h2>
 <p data-rv style="color:var(--mut);margin:-12px 0 22px">{esc(t['build_sub'])}</p>
 <div class="ah-ev__build">
  <form class="ah-ev__panel ah-ev__form" data-rv data-l='{esc(json.dumps(L, ensure_ascii=False)).replace("'", "&#39;")}' onsubmit="return false">
   <fieldset class="ah-ev__fs"><legend>{esc(t['q_sport'])}</legend><div class="ah-ev__opts">{opts('sp', t['sports'], 'radio', (t['sports'][0],))}</div></fieldset>
   <fieldset class="ah-ev__fs"><legend>{esc(t['q_items'])}</legend><div class="ah-ev__opts">{opts('it', t['items'], 'checkbox', (t['items'][0],))}</div></fieldset>
   <fieldset class="ah-ev__fs"><legend>{esc(t['q_qty'])}</legend><div class="ah-ev__qty"><input type="range" min="10" max="500" step="5" value="25" aria-label="{esc(t['q_qty'])}"><output class="ah-ev__qv">25</output></div></fieldset>
   <fieldset class="ah-ev__fs"><legend>{esc(t['q_colour'])}</legend><div class="ah-ev__opts">{colours}</div></fieldset>
   <fieldset class="ah-ev__fs" style="margin:0"><legend>{esc(t['q_extra'])}</legend><div class="ah-ev__opts">{opts('ex', t['extras'], 'checkbox')}</div></fieldset>
  </form>
  <aside class="ah-ev__sum" data-rv style="--i:1" aria-live="polite">
   <h3>{esc(t['summary'])}</h3>
   <dl>
    <div><dt>{esc(t['m_sport'])}</dt><dd data-s="sp">{esc(t['sports'][0])}</dd></div>
    <div><dt>{esc(t['m_items'])}</dt><dd data-s="it">{esc(t['items'][0])}</dd></div>
    <div><dt>{esc(t['m_qty'])}</dt><dd data-s="q">{esc(t['about'])} 25 {esc(t['pcs'])}</dd></div>
    <div><dt>{esc(t['m_colour'])}</dt><dd data-s="co">{esc(t['colours'][0][0])}</dd></div>
    <div><dt>{esc(t['m_extra'])}</dt><dd data-s="ex">{t['none']}</dd></div>
   </dl>
   <a class="ah-ev__btn ah-ev__send" data-mag href="{wa_link}" target="_blank" rel="noopener">{WA_SVG}{esc(t['send'])}</a>
  </aside>
 </div>
</section>

<section class="ah-ev__sec" style="margin-bottom:24px">
 <div class="ah-ev__band" data-rv>
  <div><strong>{esc(t['phone'])}:</strong> <a class="ah-ev__tel" href="https://wa.me/{WA}" target="_blank" rel="noopener" style="color:var(--g);font-weight:700">+966 54 177 0519</a></div>
  <div>{esc(t['email'])} <a href="mailto:info@athletic-horse.com" style="color:var(--g);font-weight:700">info@athletic-horse.com</a></div>
 </div>
 <p style="margin-top:20px;font-weight:700">{esc(t['browse'])}</p>
 <div class="ah-ev__links">{links}</div>
</section>
</div>
{JS}"""
    return html


if __name__ == "__main__":
    for lang in ("en", "ar"):
        (HERE / f"events-team-wear.{lang}.html").write_text(build(lang), encoding="utf-8")
    print("built")

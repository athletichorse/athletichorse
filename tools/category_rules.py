# Category rules used by tools/CATALOG_VALIDATION.md (reference: PRIMARY regex order + targets()).
"""Classify ACTIVE products into a clean collection set.
Primary category = first matching rule (exactly one). Secondary memberships
(parents, departments, cross-cutting type collections) are added on top.
Outputs plan.json: {collection_handle: {"add": [...ids], "remove": [...ids]}}"""
import json, re, collections

P = json.load(open('products.json'))
A = [p for p in P if p['status'] == 'ACTIVE']

# (handle, regex) — order matters: most specific first
PRIMARY = [
    ('trophy-cups-medals', r'troph|medal|oscar|golden (boot|shoe|glove|ball)\b|award|honor cup|figurine|world cup trophy|club world cup trophy'),
    ('referee-coach-equipment', r'referee|whistle|stopwatch|tactics.*board|training agenda|scoreboard|number markers'),
    ('toys-games', r'\brc\b|truck set|building (set|blocks)|car track|drawing|beads|baby foot|frisbee|kids mini ball'),
    ('flags', r'\bflag\b'),
    ('goggles', r'goggle'),
    ('swim-caps', r'swim(ming)? cap|swim cap'),
    ('fins', r'\bfins?\b'),
    ('snorkeling-diving', r'snorkel|diving|full mask'),
    ('women-burkini', r'burkini|modest|swim cover|cover up|waterproof swimsuit'),
    ('kids-swimwear', r'(girls|kids|disney|la ?mer).*swim|swimsuit.*(girls|kids)'),
    ('men-swimwear', r'swim (short|brief)|swimsuit|swim shorts'),
    ('swim-training', r'arm bands|swimming board|kick ?board|parachute|pool buoy|hand paddles|foam noodle|swim'),
    ('billiard-equipment', r'billiard|pool cue|cue tip|pool triangle|\bcue\b'),
    ('ping-pong-equipment', r'table tennis|ping ?pong|tennis table'),
    ('paddle-equipment', r'padel|paddle (racket|net)|padel court'),
    ('tennis-equipment', r'tennis'),
    ('racket-equipment', r'^racket|racket (set|handle|grip)'),
    ('badminton-equipment', r'badminton|shuttlecock'),
    ('squash-equipment', r'squash'),
    ('basketball-equipment', r'basketball'),
    ('volleyball-equipment', r'volleyball'),
    ('handball-equipment', r'handball'),
    ('hockey-equipment', r'hockey'),
    ('cricket-equipment', r'cricket|baseball bat'),
    ('karate-equipment', r'karate'),
    ('taekwondo-martial-arts-equipment', r'taekwondo|mooto|mma|kickboxing|mouth ?guard|headguard|head guard'),
    ('boxing-equipment', r'boxing|punching|(?<!fitness )sandbag|speed ball|hand wraps|venum|rebound ball stand|combat'),
    ('roller-skating-equipment', r'skat|protective gear'),
    ('scooters', r'scooter|ride-?on'),
    ('camping-equipment', r'tent|camping'),
    ('treadmills', r'treadmill'),
    ('exercise-bikes', r'exercise bike|spin bike|stationary bike'),
    ('football-equipment', r'football|soccer|shin guard|goal(keeper)?\b|goal net|rebounder|rebound wall|(?<!weighted )training (cone|marker|ladder|pole|vest|rings|plate|hoop)|\bcones?\b|agility|jump hurdle|training ladder|ball bag|ball pump|foot pump|sports training vest'),
    ('resistance-band', r'resistance|power band|power tube|thera ?band|stretch band|toning tube|hip band|exercise band|elastic band|trx force|loop band'),
    ('yoga-equipment', r'yoga|pilates|foam roller|yoga block'),
    ('weights-and-bars', r'dumbbell|weight bar|\bbar 1[28]0|olympic|hex bar|curl.*bar|weight plate|weight bag|kettlebell|ankle.*weight|wrist weights|weighted|medicine ball|sandbag|barbell|weight training bench'),
    ('home-workout-equipment', r'jump rope|skipping|hula hoop|ab wheel|aerobic step|step (bench|platform|68)|chest expander|home gym|trampoline|bosu|hand ?grip|gripper|arm grip|wrist exerciser|push.?up'),
    ('medical-equipment', r'support|brace|knee|elbow|posture|acl|patella|slimming|postpartum|wrist guard'),
    ('gloves', r'glove'),
    ('water-bottles', r'bottle|shaker'),
    ('handbags', r'handbag|shoulder bag|magic bag'),
    ('bags-backpacks', r'backpack|bag'),
    ('socks', r'sock'),
    ('pants', r'pants|leggings'),
    ('set', r'tracksuit|jersey set|\bset\b.*(shirt|short)'),
    ('shirts', r't-?shirt|shirt|sleeveless|jersey'),
    ('men-shorts', r'shorts'),
    ('gym-equipment', r'pull.?up|bench|\brack\b|cable|tricep rope|lifting strap|weightlifting belt|flooring|floor mat|gym|chalk|head ?band|wristband|sweatband|handle|high pulling|spring set|multi-station'),
]
CATCH_ALL = 'training-accessories'

def primary(t):
    for h, rx in PRIMARY:
        if re.search(rx, t, re.I):
            return h
    return CATCH_ALL

WATER = {'goggles', 'swim-caps', 'fins', 'snorkeling-diving', 'swim-training', 'women-burkini', 'kids-swimwear', 'men-swimwear'}
MARTIAL = {'karate-equipment', 'boxing-equipment'}
FITNESS_GYM = {'weights-and-bars', 'treadmills', 'exercise-bikes'}

def targets(p):
    t = p['title']; pri = primary(t); s = {pri}
    if pri in WATER: s.add('water-sports')
    if pri in MARTIAL: s.add('taekwondo-martial-arts-equipment')
    if pri in FITNESS_GYM: s.add('gym-equipment')
    if pri in ('tennis-equipment', 'paddle-equipment', 'badminton-equipment', 'squash-equipment', 'ping-pong-equipment'): s.add('racket-equipment')
    if re.search(r'glove', t, re.I): s.add('gloves')
    if re.search(r'\bkids?\b|junior|boys|girls|child|baby|disney|cartoon|mini ball|kids\'', t, re.I): s.add('kids')
    if re.search(r'women|burkini|modest|ladies|girls\' tracksuit', t, re.I) or pri == 'women-burkini' or 'handbag' in pri: s.add('women')
    if (re.search(r"\bmen'?s?\b|\bmen\b", t, re.I) and not re.search(r'women', t, re.I)) or pri in ('men-swimwear', 'men-shorts'): s.add('men')
    if pri == 'men-swimwear' or (pri == 'men-shorts'): s.add('men-shorts') if re.search('short', t, re.I) else None
    if pri == 'set' and re.search(r'kids|boys|girls', t, re.I): s.add('kids-suit')
    if pri in ('kids-swimwear', 'toys-games'): s.add('kids')
    return s, pri

MANAGED = {h for h, _ in PRIMARY} | {CATCH_ALL, 'water-sports', 'racket-equipment', 'kids', 'women', 'men', 'kids-suit'}
plan = collections.defaultdict(lambda: {'add': [], 'remove': []})
moves = []
for p in A:
    tgt, pri = targets(p)
    cur = {c for c in p['cols'] if c in MANAGED}
    for c in tgt - cur: plan[c]['add'].append(p['id'])
    for c in cur - tgt: plan[c]['remove'].append(p['id'])
    if tgt != cur: moves.append((p['title'], sorted(cur), sorted(tgt)))

json.dump(plan, open('plan.json', 'w'), indent=1)
json.dump(moves, open('moves.json', 'w'), ensure_ascii=False, indent=1)
dist = collections.Counter(primary(p['title']) for p in A)
print('active products:', len(A), '| changed:', len(moves))
print('primary distribution:', dist.most_common())

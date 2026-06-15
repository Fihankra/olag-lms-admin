#!/usr/bin/env python3
"""
Transforms question JSON files:
  1. MCQ: answer string → answer list  e.g. "Gold" → ["Gold"]
  2. short_answer: expands keywords to cover natural-language variants
     - Splits comma-separated items stored as a single string
     - Adds lowercase/stripped variants
     - Adds symbol-free versions (no ², ³, °, etc.)
     - Adds common synonyms / abbreviation expansions
     - For single-number answers, adds "= 70", "x = 70", "answer is 70" variants
"""

import json, re, glob, os, sys

TARGET_DIR = os.path.join(os.path.dirname(__file__), '..', 'old_questions')
NEW_QUESTIONS_DIR = os.path.dirname(__file__)  # questions/ folder

# ── helpers ──────────────────────────────────────────────────────────────────

SUPERSCRIPT = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789')
SUBSCRIPT   = str.maketrans('₀₁₂₃₄₅₆₇₈₉', '0123456789')

SYMBOL_TO_WORD = {
    '×': 'x', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',
    '∞': 'infinity', '°': ' degrees', '℃': ' degrees celsius',
    '₂': '2', '₃': '3', '₄': '4', '₆': '6', 'α': 'alpha', 'β': 'beta',
    'γ': 'gamma', 'δ': 'delta', 'μ': 'mu', 'σ': 'sigma', 'π': 'pi',
    'θ': 'theta', 'λ': 'lambda', 'Ω': 'omega', '√': 'sqrt',
    '→': 'to', '←': 'from', '↔': 'to and from',
    '∑': 'sum', '∫': 'integral', '∂': 'd',
}

ABBREV_EXPAND = {
    'dna': 'deoxyribonucleic acid',
    'rna': 'ribonucleic acid',
    'atp': 'adenosine triphosphate',
    'adp': 'adenosine diphosphate',
    'co2': 'carbon dioxide',
    'o2': 'oxygen',
    'h2o': 'water',
    'hcl': 'hydrochloric acid',
    'h2so4': 'sulphuric acid',
    'naoh': 'sodium hydroxide',
    'nacl': 'sodium chloride',
    'gdp': 'gross domestic product',
    'gnp': 'gross national product',
    'imf': 'international monetary fund',
    'un': 'united nations',
    'ecowas': 'economic community of west african states',
    'hiv': 'human immunodeficiency virus',
    'aids': 'acquired immune deficiency syndrome',
    'ict': 'information and communications technology',
    'cpu': 'central processing unit',
    'ram': 'random access memory',
    'rom': 'read only memory',
    'lan': 'local area network',
    'wan': 'wide area network',
    'http': 'hypertext transfer protocol',
    'html': 'hypertext markup language',
    'css': 'cascading style sheets',
    'www': 'world wide web',
    'url': 'uniform resource locator',
    'ip': 'internet protocol',
    'os': 'operating system',
    'gui': 'graphical user interface',
    'pdf': 'portable document format',
    'usb': 'universal serial bus',
    'wi-fi': 'wireless fidelity',
    'wifi': 'wireless fidelity',
    'ac': 'alternating current',
    'dc': 'direct current',
    'emf': 'electromotive force',
    'pd': 'potential difference',
    'ohm': 'ohm',
    'rbc': 'red blood cells',
    'wbc': 'white blood cells',
    'gh': 'ghana',
    'ged': 'ghana education service',
    'ges': 'ghana education service',
    'oau': 'organisation of african unity',
    'au': 'african union',
    'nato': 'north atlantic treaty organisation',
    'ussr': 'union of soviet socialist republics',
    'usa': 'united states of america',
    'uk': 'united kingdom',
}

def clean_symbol(s):
    """Replace superscripts, subscripts, and special symbols with plain text."""
    s = s.translate(SUPERSCRIPT).translate(SUBSCRIPT)
    for sym, word in SYMBOL_TO_WORD.items():
        s = s.replace(sym, word)
    return re.sub(r'\s+', ' ', s).strip()

def plain(s):
    """Lowercase and strip punctuation except spaces."""
    return re.sub(r'[^a-z0-9\s]', '', s.lower()).strip()

def split_comma_string(s):
    """Split a comma/semicolon-separated string into individual items."""
    parts = re.split(r'[,;]\s*', s)
    return [p.strip() for p in parts if p.strip()]

def number_variants(num_str):
    """For a bare number like '70', return several natural phrasings."""
    n = num_str.strip().rstrip('.')
    variants = [n, f'= {n}', f'={n}', f'x = {n}', f'x={n}']
    # If it looks like an integer, add word form for small numbers
    try:
        v = float(n)
        if v == int(v) and 0 <= v <= 20:
            words = ['zero','one','two','three','four','five','six','seven','eight',
                     'nine','ten','eleven','twelve','thirteen','fourteen','fifteen',
                     'sixteen','seventeen','eighteen','nineteen','twenty']
            variants.append(words[int(v)])
    except (ValueError, IndexError):
        pass
    return variants

def expand_keywords(raw_keywords):
    """
    raw_keywords: list from JSON (may contain comma-separated strings inside items)
    Returns: expanded deduplicated list, original items first
    """
    # Step 1: normalise — split any comma-separated items
    base = []
    for item in raw_keywords:
        item = item.strip()
        if not item:
            continue
        # If item itself contains a comma and is longer, split it
        if ',' in item or ';' in item:
            parts = split_comma_string(item)
            # Keep the original too if it's meaningful as a phrase
            if len(item) > 30:
                base.append(item)
            base.extend(parts)
        else:
            base.append(item)

    seen = set()
    result = []
    for kw in base:
        key = kw.lower().strip()
        if key and key not in seen:
            seen.add(key)
            result.append(kw)

    # Step 2: add variants for each base keyword
    extras = []

    for kw in list(result):
        kl = kw.lower().strip()

        # plain no-punctuation version
        p = plain(kw)
        if p and p not in seen:
            extras.append(p); seen.add(p)

        # symbol-free version
        sf = clean_symbol(kw)
        sfl = sf.lower().strip()
        if sfl and sfl not in seen and sfl != kl:
            extras.append(sf); seen.add(sfl)

        # plain of symbol-free
        psf = plain(sf)
        if psf and psf not in seen:
            extras.append(psf); seen.add(psf)

        # If single word/number, add abbreviation expansions
        abbr_key = kl.replace(' ', '').replace('-', '')
        if abbr_key in ABBREV_EXPAND:
            exp = ABBREV_EXPAND[abbr_key]
            if exp not in seen:
                extras.append(exp); seen.add(exp)
        # reverse: long form → abbreviation
        for abbr, exp in ABBREV_EXPAND.items():
            if kl == exp and abbr not in seen:
                extras.append(abbr); seen.add(abbr)

        # If the keyword looks like a bare number (answer to a maths question)
        if re.fullmatch(r'-?\d+(\.\d+)?', kl):
            for v in number_variants(kl):
                vl = v.lower().strip()
                if vl not in seen:
                    extras.append(v); seen.add(vl)

        # Add version without leading "the " or "a "
        for article in ('the ', 'a ', 'an '):
            if kl.startswith(article):
                stripped = kw[len(article):]
                sl = stripped.lower()
                if sl and sl not in seen:
                    extras.append(stripped); seen.add(sl)

        # Add "is X", "are X" prefix variants for single-word answers
        if ' ' not in kl and len(kl) > 2:
            for prefix in (f'is {kl}', f'are {kl}', f'it is {kl}', f'they are {kl}'):
                if prefix not in seen:
                    extras.append(prefix); seen.add(prefix)

    return result + extras


def transform_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    mcq_fixed = 0
    short_fixed = 0

    for q in questions:
        if q.get('type') == 'mcq':
            if isinstance(q.get('answer'), str):
                q['answer'] = [q['answer']]
                mcq_fixed += 1

        elif q.get('type') == 'short_answer':
            if isinstance(q.get('keywords'), list):
                original_len = len(q['keywords'])
                q['keywords'] = expand_keywords(q['keywords'])
                if len(q['keywords']) > original_len:
                    short_fixed += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    return mcq_fixed, short_fixed


def main():
    # Process old_questions
    old_files = sorted(glob.glob(os.path.join(TARGET_DIR, '*.json')))
    # Process new questions/ folder too
    new_files = sorted(glob.glob(os.path.join(NEW_QUESTIONS_DIR, '*.json')))
    all_files = old_files + [f for f in new_files if f not in old_files]

    total_mcq = 0
    total_short = 0

    for fp in all_files:
        try:
            mc, sh = transform_file(fp)
            name = os.path.relpath(fp, os.path.join(NEW_QUESTIONS_DIR, '..'))
            print(f'{name}: {mc} MCQ answers → array, {sh} short_answer sets expanded')
            total_mcq += mc
            total_short += sh
        except Exception as e:
            print(f'ERROR {fp}: {e}', file=sys.stderr)

    print(f'\nTotal: {total_mcq} MCQ answers converted to arrays, {total_short} short_answer keyword sets expanded.')


if __name__ == '__main__':
    main()

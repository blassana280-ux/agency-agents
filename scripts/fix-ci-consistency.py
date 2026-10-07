#!/usr/bin/env python3
"""fix-ci-consistency.py — rend le fork coherent avec ses checks CI upstream.

1. NON_DIVISION_DIRS (scripts/check-divisions.sh) : ajoute augmentations, docs
   (dossiers propres au fork, pas des divisions d'agents).
2. divisions.json : enregistre la division "orchestration" (agents OmniBrain).
3. AGENT_DIRS (scripts/convert.sh, scripts/lint-agents.sh) : + orchestration.
4. .github/workflows/lint-agents.yml : clone les filtres spatial-computing -> orchestration.
"""
import json, re

def edit(path, fn, label):
    t = open(path, encoding='utf-8').read()
    try:
        t2 = fn(t)
    except Exception as e:
        print('ERR  ' + path + ': ' + str(e))
        return
    if t2 != t:
        open(path, 'w', encoding='utf-8', newline='').write(t2)
        print('OK   ' + label)
    else:
        print('SKIP ' + label)

def fix_non_div(t):
    m = re.search(r'NON_DIVISION_DIRS=\(([^)]*)\)', t)
    if not m:
        raise SystemExit('NON_DIVISION_DIRS introuvable')
    inner = m.group(1)
    add = [x for x in ('augmentations', 'docs') if not re.search(r'\b' + x + r'\b', inner)]
    if not add:
        return t
    return t.replace(m.group(0), 'NON_DIVISION_DIRS=(' + inner.rstrip() + ' ' + ' '.join(add) + ')')

edit('scripts/check-divisions.sh', fix_non_div, 'check-divisions.sh NON_DIVISION_DIRS + augmentations docs')

d = json.load(open('divisions.json', encoding='utf-8'))
if 'orchestration' not in d['divisions']:
    d['divisions']['orchestration'] = {"label": "Orchestration", "icon": "Bot", "color": "#F43F5E"}
    open('divisions.json', 'w', encoding='utf-8', newline='').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
    print('OK   divisions.json + orchestration')
else:
    print('SKIP divisions.json (orchestration deja present)')

def add_agent_dir(t):
    m = re.search(r'AGENT_DIRS=\(([^)]*)\)', t)
    if not m:
        raise SystemExit('AGENT_DIRS introuvable')
    if re.search(r'\borchestration\b', m.group(1)):
        return t
    return t[:m.start()] + 'AGENT_DIRS=(' + m.group(1).rstrip() + '\n  orchestration\n)' + t[m.end():]

edit('scripts/convert.sh', add_agent_dir, 'convert.sh AGENT_DIRS + orchestration')
edit('scripts/lint-agents.sh', add_agent_dir, 'lint-agents.sh AGENT_DIRS + orchestration')

p = '.github/workflows/lint-agents.yml'
lines = open(p, encoding='utf-8').read().split('\n')
if not any('orchestration' in l for l in lines):
    out = []
    for l in lines:
        out.append(l)
        if 'spatial-computing' in l:
            out.append(l.replace('spatial-computing', 'orchestration'))
    open(p, 'w', encoding='utf-8', newline='').write('\n'.join(out))
    print('OK   lint-agents.yml filtres + orchestration')
else:
    print('SKIP lint-agents.yml')
print('fix-ci-consistency: termine')

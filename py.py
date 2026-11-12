python3 - <<'EOF'
import glob, json, os
files = sorted(glob.glob(os.path.expanduser('~/.claude/projects/*') + '/*.jsonl'), key=os.path.getmtime)
nom = [f for f in files if 'nom' in f.lower()] or files
f = nom[-1]; print('SESSION FILE:', f)
last = []
for line in open(f, encoding='utf-8'):
    try: e = json.loads(line)
    except: continue
    c = (e.get('message') or {}).get('content')
    if not isinstance(c, list): continue
    for b in c:
        if b.get('type') == 'tool_use' and b.get('name') == 'Bash':
            print('$', b['input'].get('command', '')[:300])
        elif b.get('type') == 'text' and e.get('type') == 'assistant':
            last.append(b['text'])
print('\n--- LAST MESSAGES ---\n' + '\n\n'.join(t[:800] for t in last[-3:]))
EOF

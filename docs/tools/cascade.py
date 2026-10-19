# Prints the ?v= cascade for changed modules (dry run unless --apply).
import re, os, sys, glob
os.chdir(os.environ.get("REPO") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))   # the repository root
changed = set(sys.argv[1].split(","))
apply = "--apply" in sys.argv
files = glob.glob("*.js")
imp = re.compile(r'\./([\w]+\.js)\?v=(\d+)')
cur = {}
for f in files:
    for m in imp.finditer(open(f).read()): cur.setdefault(m.group(1), set()).add(int(m.group(2)))
todo = list(changed); done = set()
while todo:
    c = todo.pop()
    if c in done: continue
    done.add(c)
    for f in files:
        if f != c and re.search(r'\./' + re.escape(c) + r'\?v=', open(f).read()):
            todo.append(f)
done.discard("app.js") if False else None
for c in sorted(done):
    if c not in cur: print(c, "(not imported with ?v=)"); continue
    if len(cur[c]) > 1: print("MISMATCH", c, cur[c])
    v = max(cur[c]); print(c, v, "->", v + 1)
    if apply:
        for f in files:
            s = open(f).read(); n = re.sub(r'(\./' + re.escape(c) + r'\?v=)\d+', lambda m: m.group(1) + str(v + 1), s)
            if n != s: open(f, "w").write(n)
        s = open("index.html").read(); n = re.sub(r'(' + re.escape(c) + r'\?v=)\d+', lambda m: m.group(1) + str(v + 1), s)
        if n != s: open("index.html", "w").write(n)

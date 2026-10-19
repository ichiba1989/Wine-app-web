# Resolves conflicts made only of import lines: keeps every module imported on either side, at the higher ?v=, ours' order first.
import re, subprocess, sys
files = sys.argv[1:] or subprocess.check_output(["git","diff","--name-only","--diff-filter=U"]).decode().split()
mod = re.compile(r'from "\./([\w]+\.js)\?v=(\d+)"')
left = []
for f in files:
    s = open(f).read()
    def fix(m):
        ours, theirs = m.group(1).split("\n"), m.group(2).split("\n")
        if not all(l.startswith("import ") for l in ours + theirs if l.strip()):
            left.append(f); return m.group(0)
        best = {}
        for l in ours + theirs:
            mm = mod.search(l)
            if mm: best[mm.group(1)] = max(best.get(mm.group(1), 0), int(mm.group(2)))
        names = {}
        for l in ours + theirs:   # every name imported from a module on either side
            mm = mod.search(l); nb = re.match(r"import \{([^}]*)\}", l)
            if mm and nb: names.setdefault(mm.group(1), [])
            if mm and nb:
                for n in [x.strip() for x in nb.group(1).split(",") if x.strip()]:
                    if n not in names[mm.group(1)]: names[mm.group(1)].append(n)
        out, seen = [], set()
        for l in ours + theirs:
            mm = mod.search(l)
            if not mm or mm.group(1) in seen: continue
            seen.add(mm.group(1)); l2 = mod.sub(lambda x: f'from "./{x.group(1)}?v={best[x.group(1)]}"', l)
            if names.get(mm.group(1)): l2 = re.sub(r"import \{[^}]*\}", "import { " + ", ".join(names[mm.group(1)]) + " }", l2, count=1)
            out.append(l2)
        return "\n".join(out) + "\n"
    s = re.sub(r"<<<<<<< ours\n(.*?)\n=======\n(.*?)\n>>>>>>> theirs\n", fix, s, flags=re.S)
    open(f, "w").write(s)
print("left:", sorted(set(left)))

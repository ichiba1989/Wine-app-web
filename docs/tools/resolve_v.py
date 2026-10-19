# Resolves merge conflicts whose two sides differ only in ?v= numbers, taking the higher number; leaves other conflicts marked.
import re, subprocess
files = subprocess.check_output(["git","diff","--name-only","--diff-filter=U"]).decode().split()
vre = re.compile(r'(\?v=)(\d+)'); strip = lambda l: vre.sub(r'\1N', l)
left=[]
for f in files:
    lines=open(f).read().split("\n"); out=[]; i=0
    while i < len(lines):
        l=lines[i]
        if l.startswith("<<<<<<< "):
            ours=[];theirs=[];i+=1
            while not lines[i].startswith("======="): ours.append(lines[i]); i+=1
            i+=1
            while not lines[i].startswith(">>>>>>> "): theirs.append(lines[i]); i+=1
            if len(ours)==len(theirs) and all(strip(a)==strip(b) for a,b in zip(ours,theirs)):
                for a,b in zip(ours,theirs):
                    k=iter([int(m.group(2)) for m in vre.finditer(b)])
                    out.append(vre.sub(lambda m: m.group(1)+str(max(int(m.group(2)), next(k))), a))
            else:
                out+=["<<<<<<< ours"]+ours+["======="]+theirs+[">>>>>>> theirs"]; left.append(f)
        else: out.append(l)
        i+=1
    open(f,"w").write("\n".join(out))
print("left:", sorted(set(left)))

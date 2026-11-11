import fnmatch, os, subprocess, sys
allow = [l.strip() for l in open('.github/size-allowlist.txt')] if os.path.exists('.github/size-allowlist.txt') else []
allow = [a for a in allow if a and not a.startswith('#')]
files = [f for f in subprocess.run(['git','ls-files','-z'],capture_output=True,check=True).stdout.decode().split('\0') if f and os.path.isfile(f)]
big = [(f, os.path.getsize(f)) for f in files if os.path.getsize(f) > 1_000_000 and not any(fnmatch.fnmatch(f, a) for a in allow)]
total, budget = sum(os.path.getsize(f) for f in files), int(os.environ['TREE_BUDGET_MB']) * 1_000_000
for f, s in big: print(f'::error file={f}::{s} bytes exceeds 1 MB (add to .github/size-allowlist.txt only if it is product data)')
if total > budget: print(f'::error::tracked tree {total} bytes exceeds budget {budget}')
sys.exit(1 if big or total > budget else 0)

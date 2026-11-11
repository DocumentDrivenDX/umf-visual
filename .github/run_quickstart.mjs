// Runs the README quickstart (the js block between <!-- quickstart --> markers) in the current directory.
// Usage (from a directory where @documentdrivendx/umf-visual is installed): node run_quickstart.mjs README.md
import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const readme = readFileSync(process.argv[2], 'utf8');
const match = readme.match(/<!-- quickstart -->\s*```js\n([\s\S]*?)```\s*<!-- \/quickstart -->/);
if (!match) throw new Error('quickstart block not found');
writeFileSync('q.mjs', match[1]);
const run = spawnSync(process.execPath, ['q.mjs'], {encoding: 'utf8'});
process.stdout.write(run.stdout);
process.stderr.write(run.stderr);
if (run.status !== 0) throw new Error(`quickstart exited with ${run.status}`);
if (!run.stdout.trim()) throw new Error('quickstart printed no Mermaid source');

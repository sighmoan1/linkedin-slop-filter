import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const root = new URL('../', import.meta.url);
for (const directory of [root, new URL('./', import.meta.url)]) {
  for (const name of readdirSync(directory).filter(name => /\.(?:js|mjs|cjs)$/.test(name))) {
    const result = spawnSync(process.execPath, ['--check', new URL(name, directory).pathname], {encoding: 'utf8'});
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status || 1);
    }
  }
}
console.log('PASS: JavaScript syntax for extension and tests');

import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const archives = process.argv.slice(2);
const root = resolve('dist/client/_next/static');
if (!archives.length || !existsSync(root)) throw new Error('Build the site and pass one or more previous deployment archives');

const prefix = 'dist/client/_next/static/';
const allowed = /^(?:[\w.-]+\/)*[\w.-]+\.(?:js|css|wasm|woff2?|ttf|svg|png|webp|jpg|avif)$/;
const tempRoot = realpathSync(tmpdir());
const staging = mkdtempSync(join(tempRoot, 'pi-previous-assets-'));
let retained = 0;
try {
  for (const archive of archives) {
    const source = resolve(archive);
    const entries = execFileSync('tar', ['-tf', source], {encoding:'utf8'}).split(/\r?\n/);
    const files = entries.filter(entry => {
      if (!entry.startsWith(prefix)) return false;
      const name = entry.slice(prefix.length);
      return allowed.test(name) && !name.split('/').some(part => part === '.' || part === '..') && !existsSync(join(root,name));
    });
    if (!files.length) continue;
    const list = join(staging, 'asset-list');
    writeFileSync(list, files.join('\n') + '\n');
    execFileSync('tar', ['-xf', source, '-C', staging, '-T', list]);
    for (const entry of files) {
      const file = join(staging,entry);
      if (!lstatSync(file).isFile()) throw new Error(`Expected a static asset: ${entry}`);
      const destination = join(root,entry.slice(prefix.length));
      mkdirSync(dirname(destination),{recursive:true});
      copyFileSync(file,destination,constants.COPYFILE_EXCL);
      retained++;
    }
  }
} finally {
  const resolved = realpathSync(staging);
  const child = relative(tempRoot,resolved);
  if (/^pi-previous-assets-[\w]+$/.test(child) && !isAbsolute(child)) rmSync(resolved,{recursive:true,force:true});
}
console.log(`Retained ${retained} previous static assets`);

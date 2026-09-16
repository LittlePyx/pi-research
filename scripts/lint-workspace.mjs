import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Release the AST of each large legacy module before linting the next batch.
// Every source file still receives the same ESLint configuration and rules.
const eslint = fileURLToPath(new URL('../node_modules/eslint/bin/eslint.js', import.meta.url));
const large = ['app/api/monitor/route.ts', 'app/research-app.tsx'];
for (const files of [...large.map(file => [file]), ['.', ...large.flatMap(file => ['--ignore-pattern', file])]]) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=6144', eslint, ...files, '--ignore-pattern', 'dist', '--ignore-pattern', '.next'], { stdio: 'inherit' });
  if (result.error) { process.stderr.write(`${result.error.message}\n`); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}

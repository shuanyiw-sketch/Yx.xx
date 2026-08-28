const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');

function collectJavaScriptFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
}

async function main() {
  const files = [
    'eslint.config.js',
    ...collectJavaScriptFiles('miniprogram'),
    ...collectJavaScriptFiles('cloudfunctions'),
  ];
  const eslint = new ESLint();
  const results = await eslint.lintFiles(files);
  const formatter = await eslint.loadFormatter('stylish');
  const output = formatter.format(results);
  if (output) process.stdout.write(output);
  if (results.some((result) => result.errorCount > 0)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(repoRoot, 'contracts');
const targetDir = path.join(repoRoot, 'functions', 'src', 'contracts', 'shared');

const files = ['apiContracts.ts', 'bookSearch.ts', 'errorCodes.ts', 'version.ts'];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing contract source: ${sourcePath}`);
  }

  fs.copyFileSync(sourcePath, targetPath);
}

console.log('[contracts] synced runtime-agnostic contracts into functions/src/contracts/shared');

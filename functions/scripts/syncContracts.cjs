const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const sourceDir = path.join(repoRoot, 'contracts');
const targetDir = path.join(repoRoot, 'functions', 'src', 'contracts', 'shared');

const files = ['apiContracts.ts', 'bookSearch.ts', 'errorCodes.ts', 'version.ts'];
const directories = ['entityPlatform'];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing contract source: ${sourcePath}`);
  }

  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectory(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing contract source directory: ${sourcePath}`);
  }

  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });

  for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourceEntryPath, targetEntryPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourceEntryPath, targetEntryPath);
    }
  }
}

for (const directory of directories) {
  copyDirectory(path.join(sourceDir, directory), path.join(targetDir, directory));
}

console.log('[contracts] synced runtime-agnostic contracts into functions/src/contracts/shared');

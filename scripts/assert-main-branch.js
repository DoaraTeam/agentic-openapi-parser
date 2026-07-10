const { execSync } = require('child_process');

const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

if (branch !== 'main') {
  console.error(
    `\nRefusing to publish from branch "${branch}" — npm publish is only allowed from "main".\n` +
      'Merge your changes into main first, then publish from there.\n',
  );
  process.exit(1);
}

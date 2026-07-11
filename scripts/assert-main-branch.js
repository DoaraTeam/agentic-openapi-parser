const { execSync } = require('child_process');

// This guard only protects against a human running `npm publish` locally from the wrong branch.
// It would also misfire in CI regardless: actions/checkout leaves the repo in detached HEAD at
// the tag's commit, so `git rev-parse --abbrev-ref HEAD` returns the literal string "HEAD", never
// "main". CI is already gated by its own trigger (only a pushed v*.*.* tag runs the workflow) plus
// the tag protection ruleset restricting who can push one, so skip this check there.
if (process.env.GITHUB_ACTIONS === 'true') {
  process.exit(0);
}

const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

if (branch !== 'main') {
  console.error(
    `\nRefusing to publish from branch "${branch}" — npm publish is only allowed from "main".\n` +
      'Merge your changes into main first, then publish from there.\n',
  );
  process.exit(1);
}

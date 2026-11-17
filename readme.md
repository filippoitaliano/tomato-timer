# tomato-timer

Simple and cute tomato timer app.

## Building stage

To produce distribution package run `npm run build`. It compresses the js file and prepare the dist files in the dedicated un-versioned folder.

## Deploy

The published app lives in the `tomato-timer/` sub-directory of the
`filippoitaliano.github.io` repository: copy the content of `dist/` there.

## Version

CalVer `<year>.<month>.<build>`, where `build` is `git rev-list --count origin/main`.
It lives in `package.json` and the build writes it in the page footer.
See `CLAUDE.md` for the rules.

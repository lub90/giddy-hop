# Contributing

Ideas, bug reports and pull requests are welcome.

- **License of contributions:** by submitting a contribution you agree that it
  is licensed under the same license as the project, the GNU Affero General
  Public License v3.0 or later ([LICENSE](LICENSE)).
- **Third-party code and assets** (libraries, sounds, pictures, models) may only
  be added when their license allows it and is compatible with the AGPL-3.0
  (e.g. MIT, BSD, ISC, Apache-2.0, GPL-3.0, CC0, CC BY, CC BY-SA 4.0). Add them
  to [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Recordings without such
  a license belong in the git-ignored `local-assets/` folder, never in the
  repository.
- **Privacy:** the game must never send the camera picture or any other data
  anywhere, and must not load anything from external servers at runtime (an
  e2e test checks this).
- Code, comments and documentation in English; texts for the children in
  German and English (`src/i18n/`).
- Please run `npm test` and `npm run e2e` before opening a pull request.

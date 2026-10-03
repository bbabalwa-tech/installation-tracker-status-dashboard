# Tests

Automated checks that run against local fakes of Google's services. They do not touch the real demo Sheet or Drive, and they do not test Google's real locking, caching or concurrent submissions. Real-world testing was done by hand on Android and iPhone.

- `fakegas.js`: an in-memory stand-in for SpreadsheetApp, DriveApp and the other Apps Script services, which loads `apps-script/Code.gs`.
- `test-backend.js`: the backend rules (passcode, lockout, partial updates, no duplicate rows, repeat submissions, file replacement, video upload, the column check, the LIVE guard). Needs only Node.js: `node tests/test-backend.js`
- `test-ui.js`: the phone app at iPhone size against the fake backend (sign-in, pre-fill, photo compression, double tap, network failure and retry, new site, video upload, evidence view). Needs Playwright.
- `test-dash.js`: the connected dashboard against a mocked Sheet feed. Needs Playwright.

Run the Playwright tests with `NODE_PATH=$(npm root -g) node tests/test-ui.js` when Playwright is installed globally.

# Water Champions Dashboard (sheet-driven)

`index.html` reads its content from a Google Sheet and renders the funder dashboard. No build step.

- **Data:** a Google Sheet (tabs `Champions`, `Milestones`, `Settings`), read through the Sheets `gviz` CSV
  endpoint. The sheet must be shared as "Anyone with the link can view".
- **Password:** the data Sheet's ID is never in this (public) code. It is AES-GCM encrypted with the dashboard
  password (PBKDF2-SHA256, 250k iterations, see `access.js`) and the resulting access code sits in cell A2 of a
  separate "Dashboard Access" sheet (`CONFIG.accessSheetId`, tab `Access`). The viewer types the password, the
  page decrypts the Sheet ID and loads the data; the unlock is remembered per device until the code changes.
  `admin.html` makes a new access code, so the owner changes the password by pasting a new code into A2.
  This is a password gate, not strong access control: anyone who unlocks it can see the Sheet and Drive links.
- **Local testing:** with `accessSheetId` and `sheetId` both empty the page reads `sample-data/*.csv` with no password.
- **Media:** photos, videos and lab PDFs live in Google Drive. Paste a file's "Copy link" into the sheet; the page
  shows photos through Drive's thumbnail service and videos and PDFs through Drive's preview player. Plain file names
  are still looked up in `CONFIG.mediaBase` (`media/`), which holds the test placeholders.
- **Status:** first milestone. Test data and placeholder media only. No real participant data may be committed to
  this repository, because it is public.

Column notes for the `Champions` tab: keep `Deployment Date` as real dates and put pipeline weeks in `Scheduled Week`
(the gviz endpoint drops values whose type differs from the rest of the column). `Settings` values are stored as plain text.

## Where things stand (for the next working session)

- Live data: the Kusini-owned test Sheet is wired in `CONFIG.sheetId`. The owner's Kusini Drive is bworkmailer@gmail.com.
- Media plan agreed with the owner: all photos, videos and lab PDFs live in Google Drive, in the Kusini account:
  `Water Champions Installation Dashboard backend / Champion Media / <Champion full name> / ` with files named
  `<Full name> Photo 1.jpg`, `Photo 2`, `Photo 3`, `<Full name> Video.mp4`, `<Full name> Lab Report.pdf`,
  plus a `Spare` subfolder per champion. The Sheet cells hold each file's Drive share link.
- Done: the folder tree exists in the Kusini Drive (Champion Media, 20 champion folders, each with a Spare
  subfolder), all private to the owner. Next: fill links into the Sheet as media arrives. Needs the Google Drive
  connector signed in as the Kusini account.
- Privacy decision (owner): a forwardable link protected by a shared password. Implemented as above.
- The test data Sheet's ID appeared in earlier commits of this public repo, so real data must go into a NEW Sheet
  whose ID is only ever stored inside an access code. Never commit a real Sheet ID, Drive link or name here.

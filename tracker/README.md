# Water Champions Dashboard (sheet-driven)

`index.html` reads its content from a Google Sheet and renders the funder dashboard. No build step.

- **Data:** the Google Sheet set in `CONFIG.sheetId` (tabs `Champions`, `Milestones`, `Settings`), read through the
  Sheets `gviz` CSV endpoint. The sheet must be shared as "Anyone with the link can view".
  Leave `sheetId` empty to read the CSV files in `sample-data/` instead (useful for local testing).
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
- Open decision: how to keep the real-data version private (brief, Privacy section). Do not share real media
  folders as "Anyone with the link" and do not put real names in this public repo until that is settled.

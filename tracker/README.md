# Water Champions Dashboard (sheet-driven)

`index.html` reads its content from a Google Sheet and renders the funder dashboard. No build step.

- **Data:** the Google Sheet set in `CONFIG.sheetId` (tabs `Champions`, `Milestones`, `Settings`), read through the
  Sheets `gviz` CSV endpoint. The sheet must be shared as "Anyone with the link can view".
  Leave `sheetId` empty to read the CSV files in `sample-data/` instead (useful for local testing).
- **Media:** file names in the sheet are looked up in `CONFIG.mediaBase` (currently `media/`). A full `https://` link is used as is.
- **Status:** first milestone. Test data and placeholder media only. No real participant data may be committed to
  this repository, because it is public.

Column notes for the `Champions` tab: keep `Deployment Date` as real dates and put pipeline weeks in `Scheduled Week`
(the gviz endpoint drops values whose type differs from the rest of the column). `Settings` values are stored as plain text.

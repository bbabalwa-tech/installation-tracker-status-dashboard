# Portfolio
_

## Water Programme Funder Dashboard (demo)

`index.html`: the funder dashboard, built on fictional sample data.

## Water Champions Intake App (demo)

A mobile web app that lets a field technician submit a site's details, photos, video and lab reports from their phone. It files everything into Google Drive and the Google Sheet the dashboard reads.

- `intake/`: the phone app (one HTML page, one JavaScript file, no framework).
- `apps-script/Code.gs`: the Google Apps Script backend.
- `docs/SETUP.md`: step-by-step setup on a demo Sheet and Drive folder.
- `docs/CASE_STUDY.md`: one-page case study.
- `docs/HOW_IT_WORKS.md`: a short explanation for interviews.

### Definition of done (v1)

- [x] Technician signs in with a shared passcode and picks their name from a list kept in the Sheet.
- [x] Champion picked from a list kept in the Sheet, or added as new; details entered with dropdowns and the phone's date picker.
- [x] Up to 3 photos, 1 video and 2 lab PDFs, each optional, taken with the camera or chosen from the phone.
- [x] Files saved to the champion's Drive folder as "<Full Name> Photo 1.jpg" and so on; the Sheet row is created or updated in the dashboard's exact 13 columns.
- [x] Updating an existing champion changes only what was sent and never erases evidence.
- [x] Photos compressed on the phone; videos over 20 MB refused with a clear message.
- [x] Clear saved and not-saved messages; a double tap or retry never saves twice.
- [x] Water quality is always chosen by a person.
- [x] Evidence completeness view showing what each champion is missing.
- [ ] Owner deploys the script on the demo Sheet and pastes its URL into `intake/app.js` (see `docs/SETUP.md`).
- [ ] Tested on a real iPhone and Android phone.

Not in v1, by choice: offline queuing, automated lab reading, notifications, WhatsApp intake.

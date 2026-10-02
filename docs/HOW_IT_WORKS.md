# How it works (the short version)

For explaining the app in an interview or to a client.

## In one sentence

A technician fills in a phone form at the site, and a small Google script files the photos, video and lab report into the right Drive folder and updates the champion's row in the Sheet the dashboard reads.

## The three parts

1. **The phone app** (`intake/index.html` and `intake/app.js`). A web page that installs to the home screen. It shows the form, shrinks photos, and sends everything in one request.
2. **The script** (`apps-script/Code.gs`). Lives inside the Google Sheet. It checks the passcode, saves each file as "<Full Name> Photo 1.jpg" and so on in that champion's folder, and writes only the cells that changed.
3. **The Sheet and Drive folder.** The same places the dashboard already reads. Nothing new to look after.

## What happens when Submit is tapped

1. The app checks the form makes sense (for example, a new champion needs a province).
2. Photos have already been shrunk on the phone. Everything goes to the script in one request.
3. The script checks the passcode and that the Sheet columns still match the dashboard.
4. It finds the champion's row, ignoring capital letters, or adds a new row if they are new.
5. It saves the files to Drive. A file already in that slot goes to the Drive bin (recoverable for 30 days) and the new one replaces it.
6. It writes only the fields that were sent. Blank fields are never written, so nothing is ever erased.
7. It logs the submission in the Submissions tab and sends back what it saved. The phone shows a green confirmation, or a red "Not saved" message.

## Questions people ask

**Why not a native app?** App stores, paid accounts and two builds, for a handful of users. The web app does the same job with none of that.

**Why not a Google Form?** A Form cannot update an existing row, file media by name into folders, or show what is missing.

**What if the signal drops?** The phone says "Not saved" and keeps everything filled in. Tapping Submit again is safe: each submission carries an ID, so a repeat is recognised and not saved twice.

**Who decides Pass or Fail?** A person. Lab reports need interpretation, so the app deliberately does not read them.

**Is it secure?** It needs the team passcode, and the passcode lockout pauses guessing. The script runs as the owner, so technicians never get access to the Drive or Sheet themselves. For v1, a shared passcode is a sensible level for a small trusted team. Individual logins would be a later step.

**What does it cost?** Nothing. GitHub Pages and Apps Script are free at this volume.

**What would you add next?** Offline queuing, only if technicians hit dead zones. Then a one-page instruction card for technicians.

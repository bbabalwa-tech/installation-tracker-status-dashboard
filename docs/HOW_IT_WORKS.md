# How it works (the short version)

For explaining the app in an interview or to a client.

## In one sentence

A technician fills in a phone form at the site, and a small Google script files the photos, video and lab report into the right Drive folder and updates the site's row in the Sheet the dashboard reads.

## The three parts

1. **The phone app** (`intake/index.html` and `intake/app.js`). A web page that installs to the home screen. It shows the form, shrinks photos, and sends everything in one request.
2. **The script** (`apps-script/Code.gs`). Lives inside the Google Sheet. It checks the passcode, saves each file as "<Site name> Photo 1.jpg" and so on in that site's folder, and writes only the cells that changed.
3. **The Sheet and Drive folder.** The same places the dashboard already reads. Nothing new to look after.

## What happens when Submit is tapped

1. The app checks the form makes sense (for example, a new site needs a province).
2. Photos have already been shrunk on the phone. The details, photos and PDFs go to the script first, in one quick request, so they are saved within seconds.
3. Then the video, on its own. Videos recorded in the app are kept small (720p, about 6 MB for 30 seconds) whatever the phone's own camera settings are, because technicians use their personal phones. It is too big for the script, so the script asks Drive for a one-time upload address and the phone sends the video straight to Drive, showing a percentage. If the video fails, everything else is already saved and the app keeps just the video ready to try again.
4. Each time, the script checks the passcode and that the Sheet columns still match the dashboard.
5. It finds the site's row, ignoring capital letters, or adds a new row if it is new.
6. It checks every file, then saves the new ones to Drive. The old file in each slot stays until the Sheet is updated, then goes to the Drive bin (recoverable for 30 days).
7. It writes only the fields that were sent. Blank fields are never written, so nothing is ever erased.
8. It bins the files that were replaced, logs the submission in the Submissions tab and sends back what it saved. The phone shows a green confirmation. If anything failed, the phone shows a red "Not saved" message and the Submissions tab gets a NOT SAVED row explaining why.

## Questions people ask

**Why not a native app?** App stores, paid accounts and two builds, for a handful of users. The web app does the same job with none of that.

**Why not a Google Form?** A Form cannot update an existing row, file media by name into folders, or show what is missing.

**What if the signal drops?** The phone says "Not saved" and keeps everything filled in. Tapping Submit again is safe: each submission carries an ID, so a repeat is recognised and not saved twice. If only the video fails, the rest is already saved and only the video is retried.

**Who decides Pass or Fail?** A person. Lab reports need interpretation, so the app deliberately does not read them.

**Is it secure?** It needs the team passcode. Ten wrong guesses lock that phone for 15 minutes, and a hundred across all phones pause sign-in for everyone. Each phone names itself, so a determined attacker could still trigger the shared pause; individual logins would be the full fix. The script runs as the owner, so technicians never get access to the Drive or Sheet themselves. For v1, a shared passcode is a sensible level for a small trusted team.

**What does it cost?** Nothing. GitHub Pages and Apps Script are free at this volume.

**What would you add next?** Offline queuing, only if technicians hit dead zones. Then a one-page instruction card for technicians.

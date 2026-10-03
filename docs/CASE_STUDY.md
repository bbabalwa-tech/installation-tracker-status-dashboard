# Case study: Water Programme Intake App

**Babalwa Bam, Programme Manager at a water purification organisation in South Africa. Portfolio build on fictional demo data; programme and organisation names are withheld.**

> Built with Claude Code. I wrote the requirements, set the constraints (demo data only, no framework, a non-developer must be able to follow the main file), made the scoping decisions below, and tested on Android and iPhone. The AI assistant wrote the code under that direction.

## The problem

The programme's funder dashboard shows each installed water purification site with its photos, walkthrough video and lab report. Keeping it current was manual. After every installation, someone filed the photos, video and lab PDF into Google Drive by hand, renamed them, then edited a row in the Google Sheet and pasted in the links. It was slow and it was easy to get wrong: a misspelled name, a file in the wrong folder, a missing link. Nobody could easily see what evidence was still outstanding.

## What was built

Two features, nothing more:

1. **A mobile intake app.** At the site, the technician picks the champion, sets the details from dropdowns, takes the photos and video with the phone camera, attaches the lab PDF and taps Submit. The app files each file into that champion's Drive folder under a fixed naming convention ("Aya Ndlovu Photo 1.jpg") and writes the Sheet row the dashboard reads. The technician never touches Drive or the Sheet.
2. **An evidence completeness view.** Every champion, with what is present and what is missing. The system now shows what still needs doing, not only what has happened.

## Why a web app (PWA) and not a native app

Technicians add the app to their home screen from a link, and it behaves like an app: its own icon, full screen, direct camera access. A native iOS and Android app would have needed paid developer accounts, app store review, two separate builds and a resubmission for every change, all for a handful of users. A PWA gives the same field experience with none of that overhead. Changes to the phone app go live when its files are updated on GitHub; changes to the backend script need a redeploy in Apps Script, which is a few deliberate steps (see SETUP.md).

## Why an app and not a Google Form

A Form can collect answers and files, but it cannot do the part that mattered. It cannot update an existing champion's row instead of adding a duplicate, cannot name and file media into each champion's folder, cannot write into the exact column layout the dashboard depends on, and cannot show what evidence is missing. Evidence arrives in pieces, for example a lab report weeks after installation, so updating in place was the core requirement.

## Architecture

- **Front end:** one HTML page and one JavaScript file, hosted free on GitHub Pages. No framework and no build step, so there is nothing to install or keep up to date.
- **Backend:** a Google Apps Script attached to the Sheet and deployed as a web app. It checks the passcode, saves files to Drive, and writes the row.
- **Data:** the existing Google Sheet and Drive folder. No new database and no new storage service. The data stays where the team already works, and it all stays free.

The Sheet is treated as a contract. The script checks that the 13 column headers exactly match what the dashboard reads, and refuses to write if they do not, so the app can never silently break the dashboard.

## Designed for real field conditions

- **Dropdowns instead of typing.** Existing champions and technicians are picked from lists kept in the Sheet, which the owner maintains without touching code. A new name is still typed once. If it is within two letters of an existing name, the app asks whether it is really a different person before saving. A typo that gets past that question still creates a second record, to be merged by hand in the Sheet.
- **Partial updates that never erase.** Only the fields and files sent this time are written. A blank never overwrites anything.
- **Photo compression on the phone.** A photo of several megabytes goes up as a few hundred kilobytes, which is quick on mobile data and keeps the dashboard fast.
- **Videos straight to Drive.** A minute of video is too big for the script to accept, so the script asks Drive for a one-time upload address that takes only that one file, and the phone uploads to it directly. The owner's Drive access never leaves the script.
- **Clear save confirmation, no duplicates.** Every submission carries an ID. If the signal drops and the technician taps Submit again, the backend recognises the repeat and does not save twice.
- **Access control.** The technician picks their name and enters a shared passcode. Ten wrong guesses lock that phone for 15 minutes. A hundred wrong guesses across all phones pause sign-in for everyone, to stop mass guessing.
- **Built and tested on fake data only.** A script check refuses to run against any sheet with LIVE in its name. It is a seatbelt against an honest mistake, not a security control.

## My role and decisions

- **Constraints I set:** the simplest thing that works, vanilla JavaScript, no framework, a non-developer must be able to follow the main file, demo data only, never touch the live Sheet.
- **Decisions after real testing:**
  - I made the lab report optional.
  - I kept water quality as a human call.
  - When a one-minute iPhone video took about 3 minutes to submit, I chose shorter videos over building background upload.
- **Field testing:** I tested on Android and iPhone myself, including a timed test on mobile data instead of Wi-Fi. A submission with a 30-second video ran for over 6 minutes and then failed on a signal drop, and because the video was sent first, the details and photos were lost with it. I had the order changed: details, photos and PDFs now save first in one quick step, and the video follows on its own. If the video fails, everything else is already saved and the video can be retried, or added later on Wi-Fi. The video itself was about 70 MB for 30 seconds because of the phone's camera settings. Technicians use their own phones, so asking them to change settings was not acceptable; instead the app now records the video itself, at a size it controls (720p, about 6 MB for 30 seconds).

  | Test on mobile data, details plus 3 photos plus a 30-second video | Video size | Result |
  |---|---|---|
  | Before: phone camera app, video sent first | 69.6 MB | Over 6 minutes, then failed; nothing saved |
  | After: video recorded in the app, details and photos sent first | 6.4 MB | Saved in 1 minute 50 seconds, on an Android phone with poor signal |
- **Acting on an independent review:** I had the finished build reviewed by a separate AI reviewer, checked its findings against the code, and had these fixed: the lockout now applies per phone instead of to everyone; failed submissions are now logged; a failure part way through no longer leaves the Sheet pointing at a binned file; new names close to existing ones now trigger a check; and abandoned video uploads are cleaned up.
- **A real mistake, caught and documented:** creating a "New deployment" instead of a new version gives the backend a new address while the app keeps calling the old code. I hit this, diagnosed it, and wrote it into the setup guide.

## A deliberate human in the loop

The app does not read the lab PDF to decide Pass or Fail. A person chooses water quality. Lab reports here need judgment: chemistry-only reports, borehole versus treated water samples, elevated plate counts, sampling errors. The app automates the deterministic work (filing, naming, record-keeping) and leaves the judgment with a person. The form says so on screen.

## A deliberate choice to stay online-only in v1

Version 1 needs signal at the moment of submitting. Offline queuing (storing a submission on the phone and sending it later) is real added complexity and a new class of bugs. I scoped it as a separate phase, to build only if technicians actually hit dead zones in use.

## Known limits (v1)

- **Not ready for real participant data.** The demo dashboard reads the Sheet directly, so the Sheet and the media folder are shared by link and uploaded photos are publicly viewable. Moving to real data first needs a private way for the dashboard to read them.
- **A shared passcode has limits.** Each phone identifies itself, so a determined attacker could pretend to be many phones and trigger the shared 100-guess pause for everyone. During a pause, even the correct passcode is refused. Individual technician logins would fix this properly.
- **Failures are logged but nobody is alerted.** A failed submission shows the technician a red "Not saved" message and is recorded in the Submissions tab as NOT SAVED, but the owner has to look there to find it.
- **A failure part way through leaves extra files, not missing ones.** New files are saved before old ones are binned, so a failed submission can leave a spare copy in the folder until it is retried.
- **Abandoned videos are cleaned up slowly.** A video uploaded but never submitted stays in the champion's folder, named "(uploading)", until that champion's next video is saved more than a day later. A video upload for a brand-new name can create its folder before the row exists.
- **Names are the record key.** Two different people with exactly the same name would share one record. The dashboard's column layout has no ID column.
- **Videos from the gallery are not shrunk.** Videos recorded in the app are kept to about 6 MB for 30 seconds, but a video chosen from the phone's gallery is sent at full size, often 70 MB or more, which can take several minutes on mobile data. The app warns when a video is over 40 MB. A video that fails part way has to start again from the beginning.
- **The recorder is confirmed on Android only.** It produced a 6.4 MB video on a real Android phone. iPhones sometimes ignore the quality an app asks for, so the size on an iPhone still has to be confirmed.
- **Testing used stand-ins.** Automated tests ran against local fakes of Google's services (see `tests/`), plus manual end-to-end tests on real phones. Google's real locking, caching and concurrent submissions were not tested automatically.

## Outcome

Filing an installation goes from a manual, multi-step desk task to one submission made at the site. The dashboard stays current without anyone re-keying data, and the completeness view turns the evidence list into a to-do list.

# Case study: Water Champions Intake App

**Babalwa Bam, Programme Manager, Water Champions programme (Kusini Water). Portfolio build on fictional demo data.**

## The problem

The Water Champions funder dashboard shows each installed water purification site with its photos, walkthrough video and lab report. Keeping it current was manual. After every installation, someone filed the photos, video and lab PDF into Google Drive by hand, renamed them, then edited a row in the Google Sheet and pasted in the links. It was slow and it was easy to get wrong: a misspelled name, a file in the wrong folder, a missing link. Nobody could easily see what evidence was still outstanding.

## What I built

Two features, nothing more:

1. **A mobile intake app.** At the site, the technician picks the champion, sets the details from dropdowns, takes the photos and video with the phone camera, attaches the lab PDF and taps Submit. The app files each file into that champion's Drive folder under a fixed naming convention ("Aya Ndlovu Photo 1.jpg") and writes the Sheet row the dashboard reads. The technician never touches Drive or the Sheet.
2. **An evidence completeness view.** Every champion, with what is present and what is missing. The system now shows what still needs doing, not only what has happened.

## Why a web app (PWA) and not a native app

Technicians add the app to their home screen from a link, and it behaves like an app: its own icon, full screen, direct camera access. A native iOS and Android app would have needed paid developer accounts, app store review, two separate builds and a resubmission for every change, all for a handful of users. A PWA gives the same field experience with none of that overhead, and I can update it by editing one file.

## Why an app and not a Google Form

A Form can collect answers and files, but it cannot do the part that mattered. It cannot update an existing champion's row instead of adding a duplicate, cannot name and file media into each champion's folder, cannot write into the exact column layout the dashboard depends on, and cannot show what evidence is missing. Evidence arrives in pieces, for example a lab report weeks after installation, so updating in place was the core requirement.

## Architecture

- **Front end:** one HTML page and one JavaScript file, hosted free on GitHub Pages. No framework and no build step, so there is nothing to install or keep up to date.
- **Backend:** a Google Apps Script attached to the Sheet and deployed as a web app. It checks the passcode, saves files to Drive, and writes the row.
- **Data:** the existing Google Sheet and Drive folder. No new database and no new storage service. The data stays where the team already works, and it all stays free.

The Sheet is treated as a contract. The script checks that the 13 column headers exactly match what the dashboard reads, and refuses to write if they do not, so the app can never silently break the dashboard.

## Designed for real field conditions

- **Dropdowns instead of typing.** Champion and technician lists come from the Sheet, so names cannot drift in spelling, and the owner maintains them without touching code.
- **Partial updates that never erase.** Only the fields and files sent this time are written. A blank never overwrites anything.
- **Photo compression on the phone.** A photo of several megabytes goes up as a few hundred kilobytes, which is quick on mobile data and keeps the dashboard fast.
- **Clear save confirmation, no duplicates.** Every submission carries an ID. If the signal drops and the technician taps Submit again, the backend recognises the repeat and does not save twice.
- **Access control.** The technician picks their name and enters a shared passcode. Repeated wrong guesses trigger a lockout.
- **Built and tested on fake data only.** A script safety check refuses to run against any sheet named LIVE.

## A deliberate human in the loop

The app does not read the lab PDF to decide Pass or Fail. A person chooses water quality. Lab reports here need judgment: chemistry-only reports, borehole versus treated water samples, elevated plate counts, sampling errors. The app automates the deterministic work (filing, naming, record-keeping) and leaves the judgment with a person. The form says so on screen.

## A deliberate choice to stay online-only in v1

Version 1 needs signal at the moment of submitting. Offline queuing (storing a submission on the phone and sending it later) is real added complexity and a new class of bugs. I scoped it as a separate phase, to build only if technicians actually hit dead zones in use.

## Outcome

Filing an installation goes from a manual, multi-step desk task to one submission made at the site. The dashboard stays current without anyone re-keying data, and the completeness view turns the evidence list into a to-do list.

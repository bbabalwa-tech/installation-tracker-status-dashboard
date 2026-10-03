# Field to Funder: a site installation reporting system

A mobile intake app and a live funder dashboard for a national water installation programme. Built by an operations manager, not a software team, to take the manual work out of programme reporting.

> **How this was built:** with Claude Code, an AI coding assistant. I wrote the requirements, set the constraints (demo data only, no framework, a non-developer must be able to follow the main file), made the scoping decisions, and tested it in the field on Android and iPhone. The AI assistant wrote the code under that direction. My role and decisions are set out in the [case study](docs/CASE_STUDY.md#my-role-and-decisions).

Everything in this repository runs on fictional demo data. No real participants, faces or lab reports.

## Try it

- **Live dashboard** (reads from the demo spreadsheet): https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/dashboard/
- **Intake app** (sign-in needs a demo passcode, available on request): https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/intake/
- The original single-file demo dashboard, kept for reference: https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/

## The problem

The programme installs community water-purification sites across the country. Every site produces evidence: photos, a walkthrough video, lab results and site details. That evidence has to prove to funders that the work happened.

The first version of the funder report was a single file with all of that evidence packed inside it. It grew to about 93 MB and had to be squeezed down just to be shareable, which wrecked the photos and videos. Updating it meant someone filing media by hand, rebuilding the file, and sending the whole thing again. It could not scale and it could not be shared reliably.

## What I built

A system that keeps itself up to date, in two parts.

1. **A mobile intake app for field technicians.** On site, the technician opens it on their phone, selects the site, takes up to three photos, records a short walkthrough video, adds the lab documents, enters the details, and submits. The app files every item into the right place with the right name and updates that site's record. The technician never touches a spreadsheet or a shared drive.
2. **A live funder dashboard.** Funders open one link in a browser and see every site, its status, its water-quality result and its evidence. It reads straight from a spreadsheet, so after a technician submits and the page is refreshed, the new site appears. Nobody recompiles anything.

In the middle sits a spreadsheet the programme owner can edit by hand if they ever need to. That is the only "back end" a non-developer has to understand.

## Decisions that shaped it

- **A human always decides the water-quality result.** Lab reports need judgment, so the app never reads a PDF and guesses Pass or Fail. It automates the filing and the record-keeping, which are mechanical, and leaves the call to a person. This is stated in the app itself.
- **Demo data only, on purpose.** An app that renames and moves files had to be proven on fake data first, and real participant data must never sit on a public link. As a safety catch, the backend refuses to run against a sheet whose name contains "LIVE". That guards against an honest mistake; it is not a security control.
- **The simplest thing that works.** Plain HTML, CSS and JavaScript, no framework and no build step, so the owner can open the main file and broadly follow it. Fewer moving parts means fewer things that break.
- **Built for weak signal and personal phones.** Details and photos save first, in seconds; the video follows on its own, so a slow video never costs the technician the rest. Technicians use their own phones, so instead of asking them to change camera settings, the app records the video itself at a small, fixed size.

## Tested in the field

A timed test on mobile data, submitting details, three photos and a 30-second video:

| | Video size | Result |
|---|---|---|
| Before: phone camera app, video sent first | 69.6 MB | Over 6 minutes, then failed; nothing saved |
| After: video recorded in the app, details and photos sent first | 6.4 MB | Saved in 1 minute 50 seconds, on an Android phone with poor signal |

## Known limits

This is a v1 built for a demo. It is not ready for real participant data: the demo dashboard needs the spreadsheet and photos shared by link. The full list, including the shared passcode, failure alerts and what was only tested against stand-ins, is in the [case study's Known limits](docs/CASE_STUDY.md#known-limits-v1).

## More detail

- [Case study](docs/CASE_STUDY.md): the problem, the decisions, my role and the known limits, on one page.
- [How it works](docs/HOW_IT_WORKS.md): a plain explanation, written to explain in an interview.
- [Setup guide](docs/SETUP.md): step-by-step setup on a demo spreadsheet and Drive folder.
- [Tests](tests/README.md): automated checks against stand-ins for Google's services.

## Built with

Plain HTML, CSS and JavaScript. A Google Apps Script backend bound to a Google Sheet. Media stored in Google Drive. Hosted on GitHub Pages. No framework, no build toolchain.

| Folder | What is in it |
|---|---|
| `intake/` | The phone app: one HTML page and one JavaScript file |
| `apps-script/` | The Google Apps Script backend |
| `dashboard/` | The live demo dashboard |
| `demo-assets/` | Placeholder photos, video and PDFs, all marked DEMO DATA |
| `docs/` | Case study, how it works, setup guide |
| `tests/` | Automated tests |

## Status

Working end to end on demo data. Tested on Android and iPhone; the in-app video recorder is confirmed on Android and still to be confirmed on iPhone. Submit through the intake app, refresh the dashboard, and the new site appears.

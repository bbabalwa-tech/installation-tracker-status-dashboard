Field to Funder: a site installation reporting system

A mobile intake app and a live funder dashboard for a national water installation programme. Built by an operations manager, not a software team, to take the manual work out of programme reporting.

Everything in this repository runs on fictional demo data. No real participants, faces or lab reports.

The problem

The programme installs community water-purification sites across the country. Every site produces evidence: photos, a walkthrough video, lab results and site details. That evidence has to prove to funders that the work happened.

The first version of the funder report was a single file with all of that evidence packed inside it. It grew to about 93 MB and had to be squeezed down just to be shareable, which wrecked the photos and videos. Updating it meant someone filing media by hand, rebuilding the file, and sending the whole thing again. It could not scale and it could not be shared reliably.

What I built

A system that keeps itself up to date, in two parts.

1. A mobile intake app for field technicians. On site, the technician opens it on their phone, selects the site, captures or uploads up to three photos, a short walkthrough video and the lab documents, enters the details, and submits. The app files every item into the right place with the right name and updates that site's record. The technician never touches a spreadsheet or a shared drive.

2. A live funder dashboard. Funders open one link in a browser and see every site, its status, its water-quality result and its evidence. It reads straight from a spreadsheet, so the moment a technician submits and the page is refreshed, the new site appears. Nobody recompiles anything.

In the middle sits a spreadsheet the programme owner can edit by hand if they ever need to. That is the only "back end" a non-developer has to understand.

Try it
Intake app: https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/intake/
Live dashboard (reads from the demo spreadsheet): https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/dashboard/
The original single-file demo dashboard, kept for reference: https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/
The decisions I am proud of
A human always decides the water-quality result. Lab reports need judgment, so the app never reads a PDF and guesses Pass or Fail. It automates the filing and the record-keeping, which are mechanical, and leaves the call to a person. This is stated in the app itself.
Demo data only, on purpose. An app that renames and moves files had to be proven on fake data first, and real participant data must never sit on a public link. The backend even refuses to run against a sheet whose name contains "LIVE," so it can never touch a production copy by accident.
The simplest thing that works. Plain HTML, CSS and JavaScript, no framework and no build step, so the owner can open the main file and broadly follow it. Fewer moving parts means fewer things that break.
Video goes straight to storage, not through the server, so a technician can upload a real walkthrough video without hitting the request-size limits a small backend has.
How it works, in more detail
One-page case study: docs/CASE_STUDY.md
How it works, written to explain in an interview: docs/HOW_IT_WORKS.md
Built with

Plain HTML, CSS and JavaScript. A Google Apps Script backend bound to a Google Sheet. Media stored in Google Drive. Hosted on GitHub Pages. No framework, no build toolchain.

Status

Working end to end on demo data, tested on Android and iPhone. Submit through the intake app, refresh the dashboard, and the new site appears.

# Setup: connecting the intake app to the demo Sheet and Drive

About 20 minutes. You do every step yourself, in your own Google account, so the app only ever has the access you give it. Everything here uses a DEMO Sheet with fictional champions. Do not use the live "Water Champions Dashboard (LIVE)" sheet. As a safety catch, the script refuses to run on any sheet with "LIVE" in its name.

## Step 1: Create the demo Sheet

1. Go to sheets.google.com and click **Blank spreadsheet**.
2. Click the title "Untitled spreadsheet" at the top left and rename it to **Water Champions Dashboard (DEMO)**.

## Step 2: Add the script

1. In the demo Sheet, click **Extensions**, then **Apps Script**. A new tab opens with a file called `Code.gs`.
2. Delete everything in that file.
3. Open `apps-script/Code.gs` from this repository, copy all of it, and paste it into the editor.
4. Click the **Save** icon (the floppy disk).
5. At the top, click **Untitled project** and rename it to **Water Champions Intake**.

## Step 3: Build the demo tabs and media folder

1. In the toolbar, find the dropdown that lists function names. Choose **setupDemo**.
2. Click **Run**.
3. Google asks for permission. Click **Review permissions**, choose your account, then **Advanced**, then **Go to Water Champions Intake (unsafe)**, then **Allow**. ("Unsafe" only means Google has not reviewed a script you wrote yourself.)
4. When it finishes, go back to the Sheet. You now have three tabs: **Champions** (six fictional champions), **Technicians** (three fictional technicians) and **Submissions** (the log, empty for now).
5. In Google Drive, you now have a folder called **Water Champions DEMO media**. If the dashboard needs to show these files publicly, right-click the folder, choose **Share**, and set General access to **Anyone with the link: Viewer**. Files the app adds inherit this.

You can delete the empty "Sheet1" tab.

## Step 4: Set the passcode

1. In the Apps Script tab, click the **gear icon** (Project Settings) on the left.
2. Scroll to **Script Properties** and click **Add script property**.
3. Property: `PASSCODE`. Value: a passcode for technicians, for example 6 or more digits or letters. Click **Save script properties**.

You will also see `MEDIA_FOLDER_ID` there. setupDemo filled it in; leave it alone.

To change the passcode later (for example if a phone is lost), edit this value. Everyone then signs in with the new one.

## Step 5: Deploy the web app

1. Click **Deploy** (top right), then **New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Description: `Intake v1`.
4. **Execute as: Me**. This means the script writes to the Sheet and Drive as you, so technicians do not need Google access.
5. **Who has access: Anyone**. This lets the phone app reach it. The passcode is what keeps strangers out.
6. Click **Deploy**, then authorise again if asked.
7. Copy the **Web app URL**. It ends in `/exec`.
8. Optional check: paste that URL into a browser tab. You should see "Water Champions Intake backend is running."

## Step 6: Connect the app

1. On GitHub, open `intake/app.js` in this repository and click the pencil icon to edit.
2. Find the line `const API_URL = '';` near the top.
3. Paste your URL between the quotes, so it reads `const API_URL = 'https://script.google.com/macros/s/.../exec';`
4. Click **Commit changes**.
5. After a minute or two, the app is live at
   `https://bbabalwa-tech.github.io/installation-tracker-status-dashboard/intake/`

(If GitHub Pages is not on yet: repository **Settings**, then **Pages**, Source **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.)

## Step 7: Put it on a phone

1. Open the link above on the phone.
2. **iPhone (Safari):** tap the Share button, then **Add to Home Screen**.
   **Android (Chrome):** tap the three-dot menu, then **Add to Home screen** or **Install app**.
3. Open it from the new icon. Sign in with the passcode.
4. Try one submission for a fictional champion: take a photo, choose Pass or Pending, tap Submit. Then check the Sheet row and the champion's Drive folder.

Test on a real phone before trusting it. The camera and file upload behave differently on phones than on a desktop browser.

## Changing the script later

If you edit `Code.gs`, the live app does not pick up the change until you redeploy: **Deploy**, then **Manage deployments**, the pencil icon, Version **New version**, then **Deploy**. This keeps the same URL, so the app does not need changing.

## Moving to the real Sheet (later, deliberately)

Only after the demo has been proven on real phones. Make a copy of the real Sheet to test first. The real Champions tab must have exactly the same 13 column headers. The "LIVE" safety check in `championsSheet()` and `setupDemo()` would then need removing on purpose; that is a decision to make, not a step to rush.

## Limits worth knowing

- **Video size:** the app refuses videos over 20 MB, because Apps Script cannot reliably accept bigger uploads. About 30 seconds of phone video fits.
- **Daily quotas:** a free Google account allows roughly 20,000 script runs and 90 minutes of total script time per day. A submission uses a few seconds. This programme will not come near it.
- **Passcode lockout:** after 10 wrong passcodes, sign-in pauses for everyone for 15 minutes.

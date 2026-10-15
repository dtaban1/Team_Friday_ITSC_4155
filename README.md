# Team_Friday_ITSC_4155
## Team Roles
<b>Scrum Master</b> - Stephen Johnson<br>
<b>Product Owner</b> - Michael Taillon<br>
<b>Developers</b> - David Taban, Prahlad Rai

<br>
This guide explains how to get the OnTrack React page running locally.

## 1. Install Node.js

Download and install the current LTS version of Node.js from:

https://nodejs.org/

After installation, verify Node.js and npm are available:

```bash
node -v
npm -v
```

## 2. Open the Project Folder

If the project is zipped, extract it first.

Then open the project folder in VS Code.

Example project structure:

```text
ontrack-react-app/
├── public/
│   └── ontrack-logo.png
├── src/
│   ├── pages/
│   │   ├── Home.jsx
│   ├── styles/
│   │   └── global.css
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 3. Open a Terminal

In VS Code, open:

```text
Terminal > New Terminal
```

Make sure the terminal is inside the project folder.

Example:

```bash
cd ontrack-react-app
```

## 4. Install Dependencies

Run:

```bash
npm install
```

This installs React, Vite, React Router, and the other packages listed in `package.json`.

## 5. Start the Development Server

Run:

```bash
npm run dev
```

Vite should display a local address similar to:

```text
http://localhost:5173/
```

Open that address in your browser.

## Habit groups

On `/habits/manage`, browse preset groups by category, select or deselect
individual habits, and click **Add Group**. Added habits appear on `/dashboard`
using the existing custom-habit tracking fields. Presets are defined in
`server/habitGroups.js` and saved per-account by the backend. Removed habits
can be restored and duplicates are skipped. No additional database migration
is required beyond the habit-management setup in `README_DATABASE.md`.

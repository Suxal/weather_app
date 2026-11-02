# Daylight Weather

A standalone Windows desktop weather app with the original web version included.
The desktop app contains only the weather experience; it does not include or link
to Quiz Builder. The web version keeps its existing Quiz Builder navigation.

## Requirements

For development and builds, install Node.js 20.19+ (or 22.13+) and npm. The
portable Windows app includes its own runtime; end users do not need Node.js.

## Run the web app locally

```powershell
npm ci
npm start
```

Open http://localhost:4173. The web page uses Open-Meteo for current forecasts
and city lookup, so live weather requires internet access.

## Run or build the Windows app

```powershell
npm ci
npm run desktop
npm run build:windows
```

The portable x64 executable is
`dist\Daylight-Weather-1.0.0-win-x64.exe`. It runs on Windows 10 or later; no
separate installer or Node.js runtime is required. Internet access is needed for
live forecasts. The executable is unsigned and may trigger a SmartScreen or
unknown-publisher warning. `npm test` checks the desktop, UI, and server
JavaScript syntax. `npm run test:desktop` builds and launches the actual
executable to check the forecast, units, offline fallback, and standalone
weather-only UI.

## Publish source to GitHub

This folder is the complete, independent source for the weather app. Create a
GitHub repository for it and upload the **contents of this folder**. Or, from
this folder, initialize Git and connect the remote repository:

```powershell
git init
git add .
git commit -m "Initial Daylight Weather app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/daylight-weather.git
git push -u origin main
```

Source belongs in the GitHub repository. To distribute the large Windows
executable, build it and attach the `.exe` to a GitHub Release instead; generated
builds and executables are excluded from Git by `.gitignore`. No repository is
created or uploaded by this source folder. Choose and add a license before
publishing publicly if you intend to grant reuse rights.

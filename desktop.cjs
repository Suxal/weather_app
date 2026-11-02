const { app, BrowserWindow, dialog, net, protocol, shell } = require("electron");
const { resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");
const metadata = require("./package.json");
const section = metadata.desktopSection;
if (!["weather", "quiz"].includes(section)) throw new Error("Invalid desktop app section");
const isWeather = section === "weather";
const title = isWeather ? "Daylight Weather" : "Quiz Builder";
const entryPage = isWeather ? "index.html" : "quiz.html";
app.setName(title);
if (!app.commandLine.hasSwitch("user-data-dir")) {
  app.setPath("userData", resolve(app.getPath("appData"), title));
}
app.setAppUserModelId(isWeather ? "local.daylight.weather" : "local.daylight.quizbuilder");

protocol.registerSchemesAsPrivileged([{
  scheme: "daylight",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

const origin = "daylight://app";
let window;
const isAppUrl = value => {
  try {
    const url = new URL(value);
    return url.protocol === "daylight:" && url.hostname === "app";
  } catch {
    return false;
  }
};

async function openExternal(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return;
    await shell.openExternal(url.href);
  } catch (error) {
    console.error("Could not open external link:", error);
    dialog.showErrorBox("Unable to open link", "Open the link in your web browser instead.");
  }
}

function createWindow() {
  window = new BrowserWindow({
    width: 1040,
    height: 900,
    minWidth: 400,
    minHeight: 600,
    title,
    backgroundColor: "#edf9ff",
    show: false,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url) || new URL(url).pathname !== "/" + entryPage) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  window.webContents.on("will-attach-webview", event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.on("render-process-gone", (_event, details) => {
    if (details.reason !== "clean-exit") dialog.showErrorBox(title + " stopped responding", "Close and reopen the app to continue. Unsaved work will need to be recreated.");
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { window = null; });
  window.loadURL(origin + "/" + entryPage).catch(error => {
    console.error("Unable to open " + title + ":", error);
    dialog.showErrorBox("Unable to open " + title, error.message);
    app.quit();
  });
}

app.whenReady().then(() => {
  const root = app.getAppPath();
  const pages = new Set(["desktop-ui.js", ...(isWeather ? ["index.html"] : ["quiz.html", "quiz.css", "quiz.mjs", "quiz-engine.mjs"])]);
  protocol.handle("daylight", request => {
    try {
      const url = new URL(request.url);
      if (!isAppUrl(url.href)) return new Response("Not found", { status: 404 });
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || entryPage;
      const path = resolve(root, relative);
      const dependency = !isWeather && (relative === "node_modules/mammoth/mammoth.browser.js" || relative.startsWith("node_modules/pdfjs-dist/"));
      if (!path.startsWith(root + sep) || (!pages.has(relative) && !dependency)) {
        return new Response("Not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(path).href);
    } catch (error) {
      console.error("Unable to load app resource:", error);
      return new Response("Unable to load resource", { status: 500 });
    }
  });
  createWindow();
  app.on("activate", () => { if (!window) createWindow(); });
}).catch(error => {
  console.error("Unable to start Daylight:", error);
  dialog.showErrorBox("Unable to start Daylight", error.message);
  app.quit();
});
app.on("window-all-closed", () => app.quit());

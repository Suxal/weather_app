module.exports = {
  appId: "local.daylight.weather",
  productName: "Daylight Weather",
  directories: { output: "dist" },
  asar: true,
  npmRebuild: false,
  files: ["desktop.cjs", "desktop-ui.js", "index.html", "package.json"],
  win: { target: "portable", signAndEditExecutable: false },
  portable: { artifactName: "Daylight-Weather-${version}-win-${arch}.exe" }
};

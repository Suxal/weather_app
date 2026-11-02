if (location.protocol === "daylight:") {
  document.querySelector(".app-nav")?.remove();
  if (location.pathname === "/quiz.html") {
    const brand = document.querySelector(".brand");
    brand.removeAttribute("href");
    brand.textContent = "Quiz Builder";
    document.title = "Quiz Builder";
    document.querySelector('footer a[href="index.html"]')?.remove();
  } else {
    document.title = "Daylight Weather";
  }
}

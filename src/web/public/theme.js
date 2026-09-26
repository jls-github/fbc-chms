// Applies the saved light/dark preference before first paint (no flash).
(function () {
  var pref = "system";
  try { pref = localStorage.getItem("theme") || "system"; } catch (e) {}
  var dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();

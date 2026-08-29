// RWF WIKI — tiny page behaviour: nav current-page + screenshot lightbox.
// Vanilla, no deps. Loaded by every wiki page.
(() => {
  // highlight the nav link matching this page (cheap: compare filenames)
  const here = location.pathname.split("/").pop() || "index.html";
  for (const a of document.querySelectorAll(".wnav a.wnav__link")) {
    const target = a.getAttribute("href");
    if (target === here || (here === "" && target === "index.html")) a.setAttribute("aria-current", "page");
  }

  // lightbox for every screenshot
  const lb = document.createElement("div");
  lb.className = "lb";
  lb.innerHTML = '<img alt="screenshot zoom" />';
  document.body.appendChild(lb);
  const lbImg = lb.querySelector("img");
  for (const img of document.querySelectorAll(".shot img")) {
    img.addEventListener("click", () => {
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lb.classList.add("open");
    });
  }
  lb.addEventListener("click", () => lb.classList.remove("open"));
  addEventListener("keydown", e => { if (e.key === "Escape") lb.classList.remove("open"); });
})();

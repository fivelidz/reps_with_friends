// RWF app entry — hash router + bottom nav. Vanilla TS, engine runs client-side.
import "./styles.css";
import { getState, setRenderer } from "./state.ts";
import { el, icon } from "./ui.ts";
import { renderOnboard } from "./screens/onboard.ts";
import { renderCrew } from "./screens/crew.ts";
import { renderHome } from "./screens/home.ts";
import { renderNewMatch } from "./screens/newmatch.ts";
import { renderLink } from "./screens/link.ts";
import { renderMatch } from "./screens/match.ts";
import { renderResult } from "./screens/result.ts";
import { renderProfile } from "./screens/profile.ts";

let cleanup: (() => void) | null = null;
let lastKey = "__boot__";

function renderNav(): void {
  const nav = document.getElementById("nav");
  if (!nav) return;
  const st = getState();
  nav.innerHTML = "";
  if (!st.me || !st.crew) return; // nav appears once onboarded + in a crew

  const hash = location.hash || "#/";
  const tabs: { hash: string; label: string; ico: string; match: (h: string) => boolean }[] = [
    { hash: "#/", label: "Matches", ico: "home", match: (h) => h === "#/" || h.startsWith("#/match") || h.startsWith("#/result") },
    { hash: "#/new", label: "New", ico: "plus", match: (h) => h.startsWith("#/new") || h.startsWith("#/link") },
    { hash: "#/profile", label: "Profile", ico: "user", match: (h) => h.startsWith("#/profile") },
  ];
  for (const t of tabs) {
    nav.append(
      el("button", {
        class: `navtab ${t.match(hash) ? "active" : ""}`,
        html: icon(t.ico, 21) + `<span>${t.label}</span>`,
        "aria-label": t.label,
        onClick: () => {
          location.hash = t.hash;
        },
      })
    );
  }
}

function route(): void {
  cleanup?.();
  cleanup = null;

  const key = location.hash || "#/";
  const sameRoute = key === lastKey;
  lastKey = key;

  const app = document.getElementById("app");
  if (!app) return;
  const scrollTop = app.scrollTop;

  const st = getState();
  const parts = key.replace(/^#\//, "").split("/");
  const screen = parts[0] || "home";
  const id = parts[1] ?? "";

  app.innerHTML = "";
  let screenEl: HTMLElement | null = null;

  // Guards: onboard → crew → everything else.
  if (!st.me) {
    cleanup = renderOnboard(app);
  } else if (!st.crew && screen !== "profile") {
    cleanup = renderCrew(app);
  } else {
    switch (screen) {
      case "home":
        cleanup = renderHome(app);
        break;
      case "crew":
        cleanup = renderCrew(app);
        break;
      case "new":
        cleanup = renderNewMatch(app);
        break;
      case "link":
        cleanup = renderLink(app, id);
        break;
      case "match":
        cleanup = renderMatch(app, id);
        break;
      case "result":
        cleanup = renderResult(app, id);
        break;
      case "profile":
        cleanup = renderProfile(app);
        break;
      default:
        cleanup = renderHome(app);
    }
  }

  screenEl = app.querySelector(".screen");
  if (screenEl && sameRoute) screenEl.classList.add("no-anim"); // no replay on data updates
  renderNav();
  app.scrollTop = scrollTop;
}

window.addEventListener("hashchange", route);
setRenderer(route);
route();

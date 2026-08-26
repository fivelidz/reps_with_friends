// Link chats — the friction killer. Big crew/match code, WhatsApp + Slack cards,
// "add the bot, then send link <CODE>". Demo crew button for solo testing.
import { addDemoCrew, getState } from "../state.ts";
import { copyText, el, icon, toast, topbar } from "../ui.ts";

export function renderLink(root: HTMLElement, matchId: string): () => void {
  const st = getState();
  const match = st.matches.find((m) => m.config.id === matchId);
  const code = st.crew?.code ?? "------";
  if (!match) {
    location.hash = "#/";
    return () => {};
  }

  const linkMsg = `link ${code}`;

  async function copy(text: string, label: string): Promise<void> {
    (await copyText(text)) ? toast(`${label} copied`, "ok") : toast("Copy failed", "warn");
  }

  const chatCard = (
    platform: "whatsapp" | "slack",
    iconName: string,
    title: string,
    tone: string
  ): HTMLElement =>
    el(
      "div",
      { class: `rwf-card card-pad chatcard chatcard--${tone}` },
      el(
        "div",
        { class: "chatcard-head" },
        el("span", { class: `chatcard-ico chatcard-ico--${tone}`, html: icon(iconName, 20) }),
        el("span", { class: "h-display chatcard-title", text: title })
      ),
      el("ol", { class: "steps" },
        el("li", { text: "Add the RWF bot to your group chat" }),
        el("li", { text: `Send ${linkMsg} in the chat` }),
        el("li", { text: "The bot keeps score — reps logged from chat or app" })
      ),
      el(
        "button",
        {
          class: "rwf-btn btn-sm btn-block",
          html: icon("copy", 14) + `<span>Copy “${linkMsg}”</span>`,
          onClick: () => copy(linkMsg, "Message"),
        }
      )
    );

  const hasDemo = match.players.some((p) => p.id.startsWith("sim_"));

  root.append(
    el(
      "section",
      { class: "screen" },
      topbar("Link your chats", { back: `#/match/${matchId}` }),

      el("p", { class: "lead", text: "No new app for your mates — the ref lives in the group chat you already have." }),

      el(
        "div",
        { class: "rwf-card card-pad code-box" },
        el("div", { class: "seclabel", text: "Match link code" }),
        el("div", { class: "code", text: code }),
        el(
          "button",
          {
            class: "rwf-btn rwf-btn--primary btn-sm",
            html: icon("copy", 15) + "<span>Copy code</span>",
            onClick: () => copy(code, "Code"),
          }
        )
      ),

      chatCard("whatsapp", "chat", "WhatsApp", "wa"),
      chatCard("slack", "hash", "Slack", "sl"),

      el(
        "div",
        { class: "rwf-card card-pad democard" },
        el("div", { class: "seclabel", text: "No group handy? (demo)" }),
        el("p", { class: "muted small", text: "Add Sam, Priya & Dex — they'll log reps while you watch." }),
        el(
          "button",
          {
            class: "rwf-btn btn-sm",
            text: hasDemo ? "DEMO CREW ADDED ✓" : "ADD DEMO CREW",
            disabled: hasDemo,
            onClick: () => {
              const n = addDemoCrew(matchId);
              toast(n > 0 ? "Sam, Priya & Dex joined the match" : "Already joined", "ok");
            },
          }
        )
      ),

      el(
        "button",
        {
          class: "rwf-btn rwf-btn--primary btn-block btn-lg",
          text: "GO TO MATCH →",
          onClick: () => {
            location.hash = `#/match/${matchId}`;
          },
        }
      )
    )
  );
  return () => {};
}

#!/usr/bin/env bash
# RWF hosting kit — run ON the target box (minirig or any Ubuntu/Arch Linux VM).
# Sets up: repo, bun (if missing), systemd user services, lingering.
# Idempotent — safe to re-run.
set -euo pipefail

REPO_DIR="$HOME/reps_with_friends"
SERVICE_SRC="$(cd "$(dirname "$0")" && pwd)"

echo "▸ 1/5 repo"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" pull --ff-only || echo "  (pull failed — continuing with local state)"
else
  git clone https://github.com/fivelidz/reps_with_friends.git "$REPO_DIR" \
    || echo "  ⚠ private repo: clone manually (ssh) then re-run"
fi

echo "▸ 2/5 bun"
if ! command -v bun >/dev/null 2>&1 && [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME/.bun/bin:$PATH"
bun --version

echo "▸ 3/5 secrets dir"
mkdir -p "$HOME/.config/rwf"
if [ ! -f "$HOME/.config/rwf/bot-slack.env" ]; then
  cat > "$HOME/.config/rwf/bot-slack.env" <<'EOF'
# Fill these in when the Slack app exists (see rwf.qalarc.com/slack)
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
EOF
  echo "  created ~/.config/rwf/bot-slack.env (fill tokens when ready)"
fi

echo "▸ 4/5 systemd user units"
mkdir -p "$HOME/.config/systemd/user"
for unit in rwf-serve rwf-bot-slack rwf-bot-whatsapp; do
  cp "$SERVICE_SRC/$unit.service" "$HOME/.config/systemd/user/"
done
systemctl --user daemon-reload

echo "▸ 5/5 enable + start"
# linger so services survive logout
loginctl enable-linger "$USER" 2>/dev/null || true
systemctl --user enable --now rwf-serve
# bots start when their tokens/config exist:
systemctl --user enable rwf-bot-slack rwf-bot-whatsapp || true
grep -q "SLACK_BOT_TOKEN=xoxb" "$HOME/.config/rwf/bot-slack.env" 2>/dev/null \
  && systemctl --user start rwf-bot-slack \
  || echo "  slack bot: enabled, will start once tokens are in ~/.config/rwf/bot-slack.env"

echo
echo "✓ done. status:"
systemctl --user --no-pager status rwf-serve | head -5 || true
echo
echo "local system → http://$(hostname -I 2>/dev/null | awk '{print $1}'):4173 (or via Tailscale IP)"
echo "updates: cd $REPO_DIR && git pull && systemctl --user restart rwf-serve"

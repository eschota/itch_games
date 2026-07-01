const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#messageForm");
const roleInput = document.querySelector("#roleInput");
const messageInput = document.querySelector("#messageInput");
const versionEl = document.querySelector("#version");
const gitEl = document.querySelector("#git");
const telegramEl = document.querySelector("#telegram");
const branchesEl = document.querySelector("#branches");
const commitsEl = document.querySelector("#commits");
const refreshButton = document.querySelector("#refreshButton");

const api = (path) => `api/${path}`;

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

async function getJson(path) {
  const response = await fetch(api(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function loadStatus() {
  const status = await getJson("status");
  versionEl.textContent = status.project_version || "version unknown";
  const git = status.git || {};
  gitEl.textContent = `${git.branch || "unknown"} @ ${git.commit || "unknown"}${git.dirty ? " dirty" : ""}`;
  const telegram = status.telegram || {};
  telegramEl.textContent = `telegram ${telegram.enabled ? "on" : "off"}`;
}

async function loadMessages() {
  const payload = await getJson("messages?limit=250");
  const messages = payload.messages || [];
  messagesEl.innerHTML = messages.map((item) => `
    <article class="message">
      <header>
        <strong>${escapeText(item.role || "Agent")}</strong>
        <span>${escapeText(formatDate(item.created_at))}</span>
      </header>
      <p>${escapeText(item.message || "")}</p>
      <footer>
        <span>${escapeText(item.project_version || "version unknown")}</span>
        <span>${escapeText(item.branch || "branch unknown")} @ ${escapeText(item.commit || "commit unknown")}</span>
      </footer>
    </article>
  `).join("");
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function loadCommits() {
  const payload = await getJson("commits");
  const branches = payload.branches || [];
  branchesEl.innerHTML = branches.map((branch) => `
    <div class="branch">
      <strong>${escapeText(branch.name)}</strong>
      <span>${escapeText(branch.commit)}</span>
      <small>${escapeText(branch.subject || "")}</small>
    </div>
  `).join("");

  const commits = payload.commits || [];
  commitsEl.innerHTML = commits.map((commit) => `
    <div class="commit">
      <strong>${escapeText(commit.short)}</strong>
      <span>${escapeText(formatDate(commit.date))}</span>
      <p>${escapeText(commit.subject || "")}</p>
      <small>${escapeText(commit.refs || "no branch label")}</small>
    </div>
  `).join("");
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadMessages(), loadCommits()]);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = roleInput.value.trim();
  const message = messageInput.value.trim();
  if (!role || !message) return;
  const response = await fetch(api("messages"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, message }),
  });
  if (!response.ok) {
    const text = await response.text();
    alert(`Message failed: ${text}`);
    return;
  }
  messageInput.value = "";
  await refreshAll();
});

refreshButton.addEventListener("click", refreshAll);
refreshAll().catch((error) => {
  messagesEl.innerHTML = `<article class="message error"><p>${escapeText(error.message)}</p></article>`;
});
setInterval(() => {
  loadMessages().catch(() => {});
  loadStatus().catch(() => {});
}, 10000);

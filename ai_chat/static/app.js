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
const tasksEl = document.querySelector("#tasks");
const taskForm = document.querySelector("#taskForm");
const taskActorInput = document.querySelector("#taskActorInput");
const taskRoleInput = document.querySelector("#taskRoleInput");
const taskPriorityInput = document.querySelector("#taskPriorityInput");
const taskTitleInput = document.querySelector("#taskTitleInput");
const taskDescriptionInput = document.querySelector("#taskDescriptionInput");
const taskScopeInput = document.querySelector("#taskScopeInput");
const taskAcceptanceInput = document.querySelector("#taskAcceptanceInput");
const taskRoleFilter = document.querySelector("#taskRoleFilter");
const taskStatusFilter = document.querySelector("#taskStatusFilter");
const seedTasksButton = document.querySelector("#seedTasksButton");

const api = (path) => `api/${path}`;
let taskOptionsReady = false;

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

async function postJson(path, payload) {
  const response = await fetch(api(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${path}: ${text}`);
  }
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

function syncTaskOptions(payload) {
  if (taskOptionsReady) return;
  for (const role of payload.roles || []) {
    const option = document.createElement("option");
    option.value = role;
    option.textContent = role;
    taskRoleFilter.append(option);
  }
  for (const status of payload.statuses || []) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    taskStatusFilter.append(option);
  }
  taskOptionsReady = true;
}

function listText(values) {
  if (!Array.isArray(values) || !values.length) return "";
  return values.join(", ");
}

function taskMeta(task) {
  const parts = [
    task.id,
    task.priority || "normal",
    task.status || "new",
    task.owner ? `owner ${task.owner}` : "",
    task.lease_until ? `lease ${formatDate(task.lease_until)}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function renderComments(task) {
  const comments = Array.isArray(task.comments) ? task.comments.slice(-2) : [];
  if (!comments.length) return "";
  return `
    <div class="task-comments">
      ${comments.map((comment) => `
        <p><strong>${escapeText(comment.role || "Agent")}</strong>: ${escapeText(comment.text || "")}</p>
      `).join("")}
    </div>
  `;
}

async function loadTasks() {
  const role = encodeURIComponent(taskRoleFilter.value || "all");
  const status = encodeURIComponent(taskStatusFilter.value || "all");
  const payload = await getJson(`tasks?role=${role}&status=${status}`);
  syncTaskOptions(payload);
  const tasks = payload.tasks || [];
  tasksEl.innerHTML = tasks.map((task) => `
    <article class="task task-${escapeText(task.status || "new")}">
      <header>
        <strong>${escapeText(task.role || "Role")}</strong>
        <span>${escapeText(taskMeta(task))}</span>
      </header>
      <h4>${escapeText(task.title || "")}</h4>
      ${task.description ? `<p>${escapeText(task.description)}</p>` : ""}
      ${task.scope && task.scope.length ? `<small>Scope: ${escapeText(listText(task.scope))}</small>` : ""}
      ${task.acceptance ? `<small>Acceptance: ${escapeText(task.acceptance)}</small>` : ""}
      ${task.parallel_plan ? `<small>Parallel Plan: ${escapeText(task.parallel_plan)}</small>` : ""}
      ${renderComments(task)}
      <div class="task-actions">
        <button type="button" data-task-action="claim" data-task-id="${escapeText(task.id)}">Claim</button>
        <button type="button" data-task-action="status" data-status="in_progress" data-task-id="${escapeText(task.id)}">Start</button>
        <button type="button" data-task-action="status" data-status="review" data-task-id="${escapeText(task.id)}">Review</button>
        <button type="button" data-task-action="status" data-status="done" data-task-id="${escapeText(task.id)}">Done</button>
        <button type="button" data-task-action="status" data-status="blocked" data-task-id="${escapeText(task.id)}">Blocked</button>
        <button type="button" data-task-action="comment" data-task-id="${escapeText(task.id)}">Note</button>
      </div>
    </article>
  `).join("") || `<p class="empty">No tasks match this filter.</p>`;
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
  await Promise.all([loadStatus(), loadMessages(), loadTasks(), loadCommits()]);
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

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await postJson("tasks", {
      created_by_role: taskActorInput.value.trim() || "Orchestrator",
      created_by: taskActorInput.value.trim() || "Orchestrator",
      role: taskRoleInput.value,
      priority: taskPriorityInput.value,
      title: taskTitleInput.value.trim(),
      description: taskDescriptionInput.value.trim(),
      scope: taskScopeInput.value,
      acceptance: taskAcceptanceInput.value.trim(),
    });
    taskTitleInput.value = "";
    taskDescriptionInput.value = "";
    taskScopeInput.value = "";
    taskAcceptanceInput.value = "";
    await refreshAll();
  } catch (error) {
    alert(`Task failed: ${error.message}`);
  }
});

seedTasksButton.addEventListener("click", async () => {
  try {
    await postJson("tasks/seed", { actor_role: taskActorInput.value.trim() || "Orchestrator" });
    await refreshAll();
  } catch (error) {
    alert(`Seed failed: ${error.message}`);
  }
});

tasksEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-task-action]");
  if (!button) return;
  const id = button.dataset.taskId;
  const action = button.dataset.taskAction;
  const actor = taskActorInput.value.trim() || roleInput.value.trim() || "Agent";
  try {
    if (action === "claim") {
      await postJson(`tasks/${encodeURIComponent(id)}/claim`, {
        actor_role: actor,
        owner: actor,
        owner_role: actor,
      });
    } else if (action === "status") {
      const status = button.dataset.status;
      const note = status === "blocked" ? prompt("Blocker note?") || "" : "";
      await postJson(`tasks/${encodeURIComponent(id)}/status`, {
        actor_role: actor,
        status,
        note,
      });
    } else if (action === "comment") {
      const comment = prompt("Task note");
      if (!comment) return;
      await postJson(`tasks/${encodeURIComponent(id)}/comment`, {
        actor_role: actor,
        comment,
      });
    }
    await refreshAll();
  } catch (error) {
    alert(`Task action failed: ${error.message}`);
  }
});

taskRoleFilter.addEventListener("change", () => loadTasks().catch(() => {}));
taskStatusFilter.addEventListener("change", () => loadTasks().catch(() => {}));
refreshButton.addEventListener("click", refreshAll);
refreshAll().catch((error) => {
  messagesEl.innerHTML = `<article class="message error"><p>${escapeText(error.message)}</p></article>`;
});
setInterval(() => {
  loadMessages().catch(() => {});
  loadStatus().catch(() => {});
  loadTasks().catch(() => {});
}, 10000);

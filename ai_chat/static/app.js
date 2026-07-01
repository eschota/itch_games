const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#messageForm");
const roleInput = document.querySelector("#roleInput");
const messageInput = document.querySelector("#messageInput");
const mediaInput = document.querySelector("#mediaInput");
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
const todosEl = document.querySelector("#todos");
const todoForm = document.querySelector("#todoForm");
const todoActorInput = document.querySelector("#todoActorInput");
const todoPriorityInput = document.querySelector("#todoPriorityInput");
const todoTitleInput = document.querySelector("#todoTitleInput");
const todoDescriptionInput = document.querySelector("#todoDescriptionInput");
const todoAcceptanceInput = document.querySelector("#todoAcceptanceInput");
const todoStatusFilter = document.querySelector("#todoStatusFilter");
const todoGateEl = document.querySelector("#todoGate");

const api = (path) => `api/${path}`;
let taskOptionsReady = false;
let todoOptionsReady = false;
const ROLE_BADGES = [
  { label: "Producer", icon: "👑", match: ["producer", "продюсер"] },
  { label: "Orchestrator", icon: "🧭", match: ["orchestrator"] },
  { label: "Art", icon: "🎨", match: ["art director"] },
  { label: "Game", icon: "🎲", match: ["game designer"] },
  { label: "UI", icon: "🖼️", match: ["ui designer"] },
  { label: "Code", icon: "💻", match: ["programmer", "developer", "engineer"] },
  { label: "QA", icon: "🔍", match: ["tester", "qa"] },
  { label: "Sound", icon: "🎧", match: ["sound designer", "audio"] },
  { label: "Tasks", icon: "📋", match: ["task queue"] },
  { label: "Deploy", icon: "🚀", match: ["deploy webhook", "deploy"] },
  { label: "Telegram", icon: "💬", match: ["telegram"] },
];

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

function roleBadge(role, item = {}) {
  if (item.role_badge && item.role_icon && item.role_label) {
    return { icon: item.role_icon, label: item.role_label, text: item.role_badge };
  }
  const clean = String(role || "Agent").trim();
  const key = clean.toLowerCase();
  const badge = ROLE_BADGES.find((entry) => entry.match.some((part) => key.includes(part)));
  if (badge) return { icon: badge.icon, label: badge.label, text: `${badge.icon} ${badge.label}` };
  const fallback = clean.split(/[/:|-]/)[0].trim().split(/\s+/).slice(0, 2).join(" ") || "Agent";
  return { icon: "🤖", label: fallback.slice(0, 18), text: `🤖 ${fallback.slice(0, 18)}` };
}

function renderRoleBadge(role, item = {}) {
  const badge = roleBadge(role, item);
  return `
    <span class="role-badge" title="${escapeText(role || badge.label)}">
      <span class="role-icon" aria-hidden="true">${escapeText(badge.icon)}</span>
      <span>${escapeText(badge.label)}</span>
    </span>
  `;
}

function safeMediaUrl(value) {
  try {
    const url = new URL(String(value || ""), window.location.href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "#";
    return url.href;
  } catch (_) {
    return "#";
  }
}

function attachmentLabel(attachment) {
  const name = attachment.original_name || attachment.file_name || "media";
  const size = Number(attachment.size || 0);
  if (!size) return name;
  if (size > 1024 * 1024) return `${name} (${(size / 1024 / 1024).toFixed(1)} MB)`;
  if (size > 1024) return `${name} (${Math.ceil(size / 1024)} KB)`;
  return `${name} (${size} B)`;
}

function renderAttachment(attachment) {
  const url = safeMediaUrl(attachment.url);
  const label = escapeText(attachmentLabel(attachment));
  const kind = attachment.kind || "file";
  if (kind === "image") {
    return `
      <a class="attachment attachment-image" href="${escapeText(url)}" target="_blank" rel="noopener">
        <img src="${escapeText(url)}" alt="${label}" loading="lazy">
        <span>${label}</span>
      </a>
    `;
  }
  if (kind === "video") {
    return `
      <div class="attachment attachment-player">
        <video src="${escapeText(url)}" controls preload="metadata"></video>
        <a href="${escapeText(url)}" target="_blank" rel="noopener">${label}</a>
      </div>
    `;
  }
  if (kind === "audio") {
    return `
      <div class="attachment attachment-player">
        <audio src="${escapeText(url)}" controls preload="metadata"></audio>
        <a href="${escapeText(url)}" target="_blank" rel="noopener">${label}</a>
      </div>
    `;
  }
  return `
    <a class="attachment attachment-file" href="${escapeText(url)}" target="_blank" rel="noopener">
      <span>${label}</span>
    </a>
  `;
}

function renderAttachments(item) {
  const attachments = Array.isArray(item.attachments) ? item.attachments : [];
  if (!attachments.length) return "";
  return `
    <div class="attachments">
      ${attachments.map(renderAttachment).join("")}
    </div>
  `;
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
  renderTodoGate(status.todo_gate || {});
}

async function loadMessages() {
  const payload = await getJson("messages?limit=250");
  const messages = payload.messages || [];
  messagesEl.innerHTML = messages.map((item) => `
    <article class="message">
      <header>
        <strong>${renderRoleBadge(item.role || "Agent", item)}</strong>
        <span>${escapeText(formatDate(item.created_at))}</span>
      </header>
      <p>${escapeText(item.message || "")}</p>
      ${renderAttachments(item)}
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
    const badge = roleBadge(role);
    option.value = role;
    option.textContent = `${badge.icon} ${role}`;
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

function syncTodoOptions(payload) {
  if (todoOptionsReady) return;
  for (const status of payload.statuses || []) {
    const option = document.createElement("option");
    option.value = status;
    option.textContent = status;
    todoStatusFilter.append(option);
  }
  todoOptionsReady = true;
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

function todoMeta(todo) {
  const parts = [
    todo.id,
    todo.priority || "normal",
    todo.status || "open",
    todo.promoted_task_id ? `task ${todo.promoted_task_id}` : "",
  ].filter(Boolean);
  return parts.join(" В· ");
}

function renderTodoGate(gate) {
  if (!todoGateEl) return;
  const active = Number(gate.active_task_count || 0);
  const open = Number(gate.open_todo_count || 0);
  todoGateEl.classList.toggle("todo-gate-required", Boolean(gate.required));
  if (gate.required && gate.mandatory_next_todo) {
    todoGateEl.textContent = `mandatory next: ${gate.mandatory_next_todo.title}`;
    return;
  }
  todoGateEl.textContent = `${active} active tasks, ${open} open todos`;
}

function renderComments(task) {
  const comments = Array.isArray(task.comments) ? task.comments.slice(-2) : [];
  if (!comments.length) return "";
  return `
    <div class="task-comments">
      ${comments.map((comment) => `
        <p><strong>${renderRoleBadge(comment.role || "Agent")}</strong>: ${escapeText(comment.text || "")}</p>
      `).join("")}
    </div>
  `;
}

function renderTodoComments(todo) {
  const comments = Array.isArray(todo.comments) ? todo.comments.slice(-2) : [];
  if (!comments.length) return "";
  return `
    <div class="task-comments">
      ${comments.map((comment) => `
        <p><strong>${renderRoleBadge(comment.role || "Agent")}</strong>: ${escapeText(comment.text || "")}</p>
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
        <strong>${renderRoleBadge(task.role || "Role", task)}</strong>
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

async function loadTodos() {
  const status = encodeURIComponent(todoStatusFilter.value || "all");
  const payload = await getJson(`todos?status=${status}`);
  syncTodoOptions(payload);
  renderTodoGate(payload.gate || {});
  const gate = payload.gate || {};
  const mandatoryId = gate.mandatory_next_todo ? gate.mandatory_next_todo.id : "";
  const todos = payload.todos || [];
  todosEl.innerHTML = todos.map((todo) => `
    <article class="task todo todo-${escapeText(todo.status || "open")} ${mandatoryId === todo.id ? "todo-mandatory" : ""}">
      <header>
        <strong>Todo</strong>
        <span>${escapeText(todoMeta(todo))}</span>
      </header>
      <h4>${escapeText(todo.title || "")}</h4>
      ${todo.description ? `<p>${escapeText(todo.description)}</p>` : ""}
      ${todo.acceptance ? `<small>Acceptance: ${escapeText(todo.acceptance)}</small>` : ""}
      ${todo.tags && todo.tags.length ? `<small>Tags: ${escapeText(listText(todo.tags))}</small>` : ""}
      ${todo.created_by_role ? `<small>Created by: ${escapeText(todo.created_by_role)}</small>` : ""}
      ${renderTodoComments(todo)}
      <div class="task-actions">
        <button type="button" data-todo-action="promote" data-todo-id="${escapeText(todo.id)}" ${todo.status !== "open" || !gate.required ? "disabled" : ""}>Promote</button>
        <button type="button" data-todo-action="status" data-status="done" data-todo-id="${escapeText(todo.id)}">Done</button>
        <button type="button" data-todo-action="status" data-status="blocked" data-todo-id="${escapeText(todo.id)}">Blocked</button>
        <button type="button" data-todo-action="status" data-status="open" data-todo-id="${escapeText(todo.id)}">Reopen</button>
        <button type="button" data-todo-action="comment" data-todo-id="${escapeText(todo.id)}">Note</button>
      </div>
    </article>
  `).join("") || `<p class="empty">No todos match this filter.</p>`;
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
  await Promise.all([loadStatus(), loadMessages(), loadTasks(), loadTodos(), loadCommits()]);
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const role = roleInput.value.trim();
  const message = messageInput.value.trim();
  const files = Array.from(mediaInput.files || []);
  if (!role || (!message && !files.length)) return;
  let response;
  if (files.length) {
    const formData = new FormData();
    formData.append("role", role);
    formData.append("message", message);
    files.forEach((file) => formData.append("files", file, file.name));
    response = await fetch(api("messages"), {
      method: "POST",
      body: formData,
    });
  } else {
    response = await fetch(api("messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, message }),
    });
  }
  if (!response.ok) {
    const text = await response.text();
    alert(`Message failed: ${text}`);
    return;
  }
  messageInput.value = "";
  mediaInput.value = "";
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

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await postJson("todos", {
      created_by_role: todoActorInput.value.trim() || taskActorInput.value.trim() || "Orchestrator",
      created_by: todoActorInput.value.trim() || taskActorInput.value.trim() || "Orchestrator",
      priority: todoPriorityInput.value,
      title: todoTitleInput.value.trim(),
      description: todoDescriptionInput.value.trim(),
      acceptance: todoAcceptanceInput.value.trim(),
    });
    todoTitleInput.value = "";
    todoDescriptionInput.value = "";
    todoAcceptanceInput.value = "";
    await refreshAll();
  } catch (error) {
    alert(`Todo failed: ${error.message}`);
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

todosEl.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-todo-action]");
  if (!button || button.disabled) return;
  const id = button.dataset.todoId;
  const action = button.dataset.todoAction;
  const actor = todoActorInput.value.trim() || taskActorInput.value.trim() || "Orchestrator";
  try {
    if (action === "promote") {
      const role = prompt("Task role?", taskRoleInput.value || "Orchestrator") || "";
      if (!role) return;
      const scope = prompt("Task file scope?", "") || "";
      await postJson(`todos/${encodeURIComponent(id)}/promote`, {
        actor_role: actor,
        role,
        scope,
      });
    } else if (action === "status") {
      const status = button.dataset.status;
      const note = status === "blocked" ? prompt("Blocker note?") || "" : "";
      await postJson(`todos/${encodeURIComponent(id)}/status`, {
        actor_role: actor,
        status,
        note,
      });
    } else if (action === "comment") {
      const comment = prompt("Todo note");
      if (!comment) return;
      await postJson(`todos/${encodeURIComponent(id)}/comment`, {
        actor_role: actor,
        comment,
      });
    }
    await refreshAll();
  } catch (error) {
    alert(`Todo action failed: ${error.message}`);
  }
});

taskRoleFilter.addEventListener("change", () => loadTasks().catch(() => {}));
taskStatusFilter.addEventListener("change", () => loadTasks().catch(() => {}));
todoStatusFilter.addEventListener("change", () => loadTodos().catch(() => {}));
refreshButton.addEventListener("click", refreshAll);
refreshAll().catch((error) => {
  messagesEl.innerHTML = `<article class="message error"><p>${escapeText(error.message)}</p></article>`;
});
setInterval(() => {
  loadMessages().catch(() => {});
  loadStatus().catch(() => {});
  loadTasks().catch(() => {});
  loadTodos().catch(() => {});
}, 10000);

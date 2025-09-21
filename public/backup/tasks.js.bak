// tasks.js

// === USER INFO & ROLE ===
let isAdmin = false;
let userId = null;
let editingTaskId = null;

// Fetch and display user info
function fetchUserInfo() {
  fetch('/api/user-info')
    .then(res => res.json())
    .then(data => {
      const user = data.user;
      userId = user.userId;
      isAdmin = user.isAdmin === true;
      document.getElementById('user-name').textContent = user.fullName;
      document.getElementById('user-job-title').textContent = user.jobTitle;
      const userPhoto = document.getElementById('user-photo');
      if (userPhoto) {
        userPhoto.onerror = function () {
          userPhoto.src = 'images/default-profile.png';
        };
        userPhoto.src = `/api/user-photo/${user.userId}`;
      }
      if (isAdmin) {
        document.getElementById('admin-create-task-btn').style.display = 'inline-block';
      }
    })
    .catch(() => {
      document.getElementById('user-name').textContent = "Unknown User";
      document.getElementById('user-job-title').textContent = "";
    });
}

// Logout logic
document.getElementById('logout-btn').addEventListener('click', () => {
  fetch('/logout', { method: 'POST' })
    .then(() => (window.location.href = '/'));
});

function createChecklistItemInput(value = '') {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.marginBottom = '6px';

  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'item[]';
  input.placeholder = 'Checklist Item';
  input.required = true;
  input.value = value;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '✕';
  removeBtn.className = 'remove-checklist-item-btn';
  removeBtn.addEventListener('click', () => {
    // Only remove if more than 1 item
    if (checklistItemsDiv.querySelectorAll('input[name="item[]"]').length > 1) {
      wrapper.remove();
    } else {
      input.value = '';
    }
  });

  wrapper.appendChild(input);
  wrapper.appendChild(removeBtn);
  return wrapper;
}


// === TASK RENDERING ===

const loadingDiv = document.getElementById('tasks-loading');
const errorDiv = document.getElementById('tasks-error');
const tasksListDiv = document.getElementById('tasks-list');

function showLoading() {
  loadingDiv.style.display = 'block';
  errorDiv.style.display = 'none';
  tasksListDiv.innerHTML = '';
}
function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.style.display = 'block';
  loadingDiv.style.display = 'none';
}
function hideLoadingError() {
  loadingDiv.style.display = 'none';
  errorDiv.style.display = 'none';
}

// Format a date as "MMM DD, YYYY HH:mm"
function humanDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false
  });
}

// Get renewal label
function renewalLabel(type) {
  switch (type) {
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'yearly': return 'Yearly';
    default: return '';
  }
}

// Render progress bar (fraction = 0..1)
function renderProgressBar(fraction) {
  const percent = Math.round(fraction * 100);
  return `
    <div class="task-progress-bar-bg">
      <div class="task-progress-bar" style="width:${percent}%"></div>
    </div>
    <div style="font-size:0.95rem;color:#7F8C8D;margin-top:3px;text-align:right;">
      ${percent}% complete
    </div>
  `;
}

// Render all tasks
function renderTasks(tasks) {
  tasksListDiv.innerHTML = '';
  if (!tasks.length) {
    tasksListDiv.innerHTML = `<div style="text-align:center; color:#7F8C8D;">No tasks available.</div>`;
    return;
  }
  tasks.forEach(task => {
    // Checklist rendering
    let completedCount = 0;
    const checklistHTML = (task.items || []).map(item => {
      if (item.completed) completedCount++;
      return `
        <li class="checklist-item${item.completed ? ' completed' : ''}">
          <input type="checkbox" data-item-id="${item.id}" ${item.completed ? 'checked' : ''}>
          <span class="checklist-text">${item.text}</span>
          <span class="item-date">${item.completed ? humanDate(item.completed_at) : ''}</span>
        </li>
      `;
    }).join('');

    // Progress
    const progress = task.items && task.items.length
      ? completedCount / task.items.length
      : 0;

    // Admin controls
    let actionsHTML = '';
    if (isAdmin) {
  actionsHTML = `
    <div class="task-actions">
      <button class="task-edit-btn" data-task-id="${task.id}">Edit</button>
      <button class="task-delete-btn" data-task-id="${task.id}">Delete</button>
    </div>
  `;
}

    // Task Card
    tasksListDiv.innerHTML += `
      <div class="task-card" data-task-id="${task.id}">
        <div class="task-card-header">
          <div>
            <span class="task-title">${task.title}</span>
            <span class="task-type">${renewalLabel(task.type)}</span>
            <div class="task-dates">
              Created: ${humanDate(task.created_at)}<br>
              Last Updated: ${humanDate(task.updated_at)}
            </div>
          </div>
          ${actionsHTML}
        </div>
        <ul class="checklist">
          ${checklistHTML}
        </ul>
        ${task.items && task.items.length > 0 ? renderProgressBar(progress) : ''}
      </div>
    `;
  });
}

// === TASK LOADING LOGIC ===
function loadTasks() {
  showLoading();
  // Optional: check for renewal/reset logic before loading
  fetch('/tsk-renew-check-v5s3').then(() =>
    fetch('/tsk-mgt-view-x7k2')
      .then(res => res.json())
      .then(data => {
        hideLoadingError();
        renderTasks(data.tasks || []);
      })
      .catch(() => {
        showError('Could not load tasks. Try again.');
      })
  );
}

// === CHECKLIST ITEM UPDATE ===
tasksListDiv.addEventListener('change', (e) => {
  if (e.target.matches('input[type="checkbox"][data-item-id]')) {
    const itemId = e.target.getAttribute('data-item-id');
    const completed = e.target.checked ? 1 : 0;
    fetch('/tsk-update-item-q4n8', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, completed })
    })
      .then(res => {
        if (!res.ok) throw new Error();
        // Re-render all tasks to update UI/progress/date
        loadTasks();
      })
      .catch(() => {
        showError('Failed to update checklist status.');
        // Optionally revert UI:
        e.target.checked = !completed;
      });
  }
});

// === ADMIN: CREATE TASK MODAL ===
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');
const modalClose = document.getElementById('modal-close');
const createTaskBtn = document.getElementById('admin-create-task-btn');
const checklistItemsDiv = document.getElementById('checklist-items');

if (createTaskBtn) {
  createTaskBtn.addEventListener('click', () => {
    taskForm.reset();
    checklistItemsDiv.innerHTML = '';
    checklistItemsDiv.appendChild(createChecklistItemInput());
    editingTaskId = null;
    document.getElementById('modal-title').textContent = 'Create Task';
    document.getElementById('task-save-btn').textContent = 'Save Task';
    taskModal.style.display = 'flex';
  });
}


if (modalClose) {
  modalClose.addEventListener('click', () => {
    taskModal.style.display = 'none';
    editingTaskId = null;
    document.getElementById('modal-title').textContent = 'Create Task';
    document.getElementById('task-save-btn').textContent = 'Save Task';
  });
}

// Add checklist item field
document.getElementById('add-checklist-item').addEventListener('click', () => {
  checklistItemsDiv.appendChild(createChecklistItemInput());
});

// Handle create task form submit
taskForm.addEventListener('submit', function (e) {
  e.preventDefault();
  const title = document.getElementById('task-title').value.trim();
  const type = document.getElementById('task-type').value;
  const itemInputs = checklistItemsDiv.querySelectorAll('input[name="item[]"]');
  const items = Array.from(itemInputs).map(inp => inp.value.trim()).filter(v => v);

  if (!title || !type || items.length === 0) {
    alert('Fill all fields and add at least one checklist item.');
    return;
  }

  // If in edit mode, use PUT endpoint
  if (editingTaskId) {
    fetch('/tsk-update-admin-b7u2', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: editingTaskId, title, type, items })
    })
      .then(res => {
        if (!res.ok) throw new Error();
        taskModal.style.display = 'none';
        editingTaskId = null;
        document.getElementById('modal-title').textContent = 'Create Task';
        document.getElementById('task-save-btn').textContent = 'Save Task';
        loadTasks();
      })
      .catch(() => {
        showError('Failed to update task.');
      });
  } else {
    // New task
    fetch('/tsk-create-admin-p9m1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, type, items })
    })
      .then(res => {
        if (!res.ok) throw new Error();
        taskModal.style.display = 'none';
        loadTasks();
      })
      .catch(() => {
        showError('Failed to create task.');
      });
  }
});

// === ADMIN: DELETE TASK ===
tasksListDiv.addEventListener('click', (e) => {
    if (e.target.matches('.task-delete-btn')) {
      const taskId = e.target.getAttribute('data-task-id');
      if (!confirm('Are you sure you want to delete this task?')) return;
      fetch('/tsk-remove-admin-w2r7', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      })
        .then(res => {
          if (!res.ok) throw new Error();
          loadTasks();
        })
        .catch(() => showError('Failed to delete task.'));
    }
  });
  
  tasksListDiv.addEventListener('click', (e) => {
  // Edit Task Handler
  if (e.target.matches('.task-edit-btn')) {
    const taskId = e.target.getAttribute('data-task-id');
    // Find this task from loaded tasks
    fetch('/tsk-mgt-view-x7k2')
      .then(res => res.json())
      .then(data => {
        const task = (data.tasks || []).find(t => String(t.id) === String(taskId));
        if (!task) return;
        // Fill modal fields
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-type').value = task.type;
        const checklistDiv = document.getElementById('checklist-items');
        checklistDiv.innerHTML = '';
(task.items || []).forEach(item => {
  checklistDiv.appendChild(createChecklistItemInput(item.text));
});
if ((task.items || []).length === 0) {
  checklistDiv.appendChild(createChecklistItemInput());
}
        // If no items, add one blank
        if ((task.items || []).length === 0) {
          const input = document.createElement('input');
          input.type = 'text';
          input.name = 'item[]';
          input.placeholder = 'Checklist Item';
          input.required = true;
          checklistDiv.appendChild(input);
        }
        // Mark edit mode
        editingTaskId = task.id;
        document.getElementById('modal-title').textContent = 'Edit Task';
        document.getElementById('task-save-btn').textContent = 'Save Changes';
        document.getElementById('task-modal').style.display = 'flex';
      });
    return;
  }
});

// === INITIALIZE ON PAGE LOAD ===
fetchUserInfo();
loadTasks();

// === TASKS VIEW SWITCHER ===
const viewListBtn = document.getElementById('view-list-btn');
const viewGridBtn = document.getElementById('view-grid-btn');
const tasksList = document.getElementById('tasks-list');

// Set initial view
let currentView = localStorage.getItem('tasksViewMode') || 'list';
setTasksView(currentView);

function setTasksView(mode) {
  if (mode === 'grid') {
    tasksList.classList.remove('list-view');
    tasksList.classList.add('grid-view');
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
  } else {
    tasksList.classList.remove('grid-view');
    tasksList.classList.add('list-view');
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
  }
  localStorage.setItem('tasksViewMode', mode);
}

// Button listeners
viewListBtn.addEventListener('click', () => setTasksView('list'));
viewGridBtn.addEventListener('click', () => setTasksView('grid'));

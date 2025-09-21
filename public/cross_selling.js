document.addEventListener('DOMContentLoaded', () => {
  const buttonList = document.getElementById('button-list');
  const topicContent = document.getElementById('topic-content');
  const topicTitle = document.getElementById('topic-title');
  const searchInput = document.getElementById('search-input');
  const addBtn = document.getElementById('add-btn');
  const editBtn = document.getElementById('edit-btn');
  const deleteBtn = document.getElementById('delete-btn');

  const modal = document.getElementById('edit-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalInputTitle = document.getElementById('modal-topic-title');
  const modalInputContent = document.getElementById('modal-topic-content');
  const saveModalBtn = document.getElementById('save-modal-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');

  let allTopics = [];
  let modalMode = 'add';
  let editingTopicId = null;

  function renderButtons(filter = '') {
    buttonList.innerHTML = '';
    const filtered = allTopics.filter(topic =>
      topic.title.toLowerCase().includes(filter.toLowerCase())
    );

    filtered.forEach(topic => {
      const btn = document.createElement('button');
      btn.textContent = topic.title;
      btn.classList.add('topic-btn');
      btn.addEventListener('click', () => {
        fetch(`/api/cross-selling?title=${encodeURIComponent(topic.title)}`)
          .then(res => res.json())
          .then(data => {
            topicTitle.textContent = topic.title;
            topicContent.innerHTML = data.content || 'No content found.';
          });
      });
      buttonList.appendChild(btn);
    });
  }

  fetch('/api/cross-selling/all')
    .then(res => res.json())
    .then(data => {
      allTopics = data;
      renderButtons();
    })
    .catch(err => {
      console.error('Error loading topics:', err);
    });

  searchInput.addEventListener('input', (e) => {
    renderButtons(e.target.value);
  });

  function openModal(mode, topic = {}) {
    modalMode = mode;
    modal.classList.remove('hidden');
    modalTitle.textContent = mode === 'add' ? 'Add Topic' : 'Edit Topic';
    modalInputTitle.value = topic.title || '';
    modalInputContent.value = topic.content || '';
    editingTopicId = topic.id || null;
  }

  function closeModal() {
    modal.classList.add('hidden');
    modalInputTitle.value = '';
    modalInputContent.value = '';
    editingTopicId = null;
  }

  addBtn.addEventListener('click', () => openModal('add'));

  editBtn.addEventListener('click', () => {
    const title = topicTitle.textContent.trim();
    if (!title) return alert('Please select a topic first.');
    const topic = allTopics.find(t => t.title === title);
    if (!topic) return alert('Topic not found.');
    fetch(`/api/cross-selling?title=${encodeURIComponent(topic.title)}`)
      .then(res => res.json())
      .then(data => {
        openModal('edit', { id: topic.id, title: topic.title, content: data.content });
      });
  });

  saveModalBtn.addEventListener('click', () => {
    const title = modalInputTitle.value.trim();
    const content = modalInputContent.value.trim();
    if (!title || !content) return alert('Please fill out both fields.');

    const method = modalMode === 'add' ? 'POST' : 'PUT';
    const url = modalMode === 'add' ? '/api/cross-selling' : `/api/cross-selling/${editingTopicId}`;

    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    }).then(() => {
      closeModal();
      location.reload();
    });
  });

  cancelModalBtn.addEventListener('click', closeModal);

  deleteBtn.addEventListener('click', () => {
    const title = topicTitle.textContent.trim();
    if (!title) return alert('Please select a topic first.');
    const topic = allTopics.find(t => t.title === title);
    if (!topic || !confirm(`Delete topic "${title}"?`)) return;
    fetch(`/api/cross-selling/${topic.id}`, {
      method: 'DELETE'
    }).then(() => location.reload());
  });
});

//user info
document.addEventListener('DOMContentLoaded', () => {
  const userInfoString = sessionStorage.getItem('userInfo');
  if (!userInfoString) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const userInfo = JSON.parse(userInfoString);
    document.getElementById('pharmacist-name').textContent =
      userInfo.fullName || userInfo.username;
    document.getElementById('job-title').textContent =
      userInfo.jobTitle || 'Staff';
    document.getElementById('user-photo-img').src =
      '/api/user-photo/' + userInfo.userId;
  } catch (error) {
    console.error('Invalid userInfo JSON:', error);
    window.location.href = 'index.html';
  }
});

function logout() {
  sessionStorage.removeItem('userInfo');
  window.location.href = 'index.html';
}

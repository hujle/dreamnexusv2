document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('loginSection');
  const adminRoot = document.getElementById('adminRoot');
  const btnLogin = document.getElementById('btnLogin');
  const loginMsg = document.getElementById('loginMsg');

  function isAuthed(){ return !!sessionStorage.getItem('admin-token'); }
  function setAuthed(token){ sessionStorage.setItem('admin-token', token); }
  function clearAuth(){ sessionStorage.removeItem('admin-token'); }

  // Render admin UI after auth
  function renderPanel(){
    adminRoot.innerHTML = '';
    const panelWrap = document.createElement('div');

    // Controls
    const controlsRow = document.createElement('div');
    controlsRow.style.display = 'flex';
    controlsRow.style.justifyContent = 'space-between';
    controlsRow.style.alignItems = 'center';
    controlsRow.style.gap = '12px';
    controlsRow.style.marginBottom = '12px';

    const leftControls = document.createElement('div');
    leftControls.style.display = 'flex';
    leftControls.style.gap = '8px';
    leftControls.style.alignItems = 'center';

    const btnLogout = document.createElement('button');
    btnLogout.className = 'btn small';
    btnLogout.textContent = 'Logout';

    const btnCheckAll = document.createElement('button');
    btnCheckAll.className = 'btn small';
    btnCheckAll.textContent = 'Check all servers';

    leftControls.appendChild(btnLogout);
    leftControls.appendChild(btnCheckAll);
    controlsRow.appendChild(leftControls);
    panelWrap.appendChild(controlsRow);

    // Add server form
    const formSection = document.createElement('section');
    formSection.className = 'server-form';
    formSection.style.marginBottom = '16px';
    const formInner = document.createElement('div');
    formInner.style.padding = '8px';
    const h3 = document.createElement('h3');
    h3.textContent = 'Add server';
    h3.style.margin = '0 0 8px 0';
    formInner.appendChild(h3);

    const rowInvite = document.createElement('div'); rowInvite.className = 'form-row';
    const inputInvite = document.createElement('input'); inputInvite.id = 'invite'; inputInvite.type = 'text';
    inputInvite.placeholder = 'https://discord.gg/code or code';
    rowInvite.appendChild(inputInvite); formInner.appendChild(rowInvite);

    const rowCategory = document.createElement('div'); rowCategory.className = 'form-row';
    const inputCategory = document.createElement('input'); inputCategory.id = 'category'; inputCategory.type = 'text';
    inputCategory.placeholder = 'Category (optional)';
    rowCategory.appendChild(inputCategory); formInner.appendChild(rowCategory);

    const rowNotes = document.createElement('div'); rowNotes.className = 'form-row';
    const textareaNotes = document.createElement('textarea'); textareaNotes.id = 'notes'; textareaNotes.placeholder = 'Note (optional)';
    rowNotes.appendChild(textareaNotes); formInner.appendChild(rowNotes);

    const rowSubmit = document.createElement('div'); rowSubmit.className = 'form-row';
    rowSubmit.style.justifyContent = 'flex-end'; rowSubmit.style.marginTop = '8px';
    const btnAdd = document.createElement('button'); btnAdd.id = 'btnAdd'; btnAdd.className = 'btn'; btnAdd.textContent = 'Add';
    rowSubmit.appendChild(btnAdd); formInner.appendChild(rowSubmit);

    const addMsg = document.createElement('div'); addMsg.id = 'addMsg'; addMsg.className = 'muted'; addMsg.style.marginTop = '8px';
    formInner.appendChild(addMsg);

    formSection.appendChild(formInner);
    panelWrap.appendChild(formSection);

    // Servers list
    const listSection = document.createElement('section');
    const h3List = document.createElement('h3'); h3List.textContent = 'Servers list'; h3List.style.marginTop = '0';
    listSection.appendChild(h3List);
    const serversContainer = document.createElement('div'); serversContainer.id = 'servers'; serversContainer.className = 'admin-list';
    listSection.appendChild(serversContainer);
    panelWrap.appendChild(listSection);

    adminRoot.appendChild(panelWrap);

    // Handlers
    btnLogout.addEventListener('click', async () => {
      try {
        await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' });
      } catch(e){ /* ignore */ }
      clearAuth();
      adminRoot.innerHTML = '';
      loginSection.style.display = '';
    });

    btnCheckAll.addEventListener('click', async () => {
      btnCheckAll.disabled = true; btnCheckAll.textContent = 'Checking...';
      try {
        const res = await fetch('/api/servers/check-all', { method: 'POST', credentials: 'same-origin' });
        if (res.ok) {
          await fetchServers();
        } else {
          const txt = await res.text().catch(()=>null);
          alert('Check-all failed: ' + (txt || res.status));
        }
      } catch (err) {
        console.error('check-all error', err);
        alert('Network error during check-all');
      } finally {
        btnCheckAll.disabled = false; btnCheckAll.textContent = 'Check all servers';
      }
    });

    btnAdd.addEventListener('click', async () => {
      addMsg.textContent = '';
      const invite = inputInvite.value.trim();
      const category = inputCategory.value.trim();
      const notes = textareaNotes.value.trim();
      if (!invite) { addMsg.textContent = 'Invite is required.'; return; }
      btnAdd.disabled = true; btnAdd.textContent = 'Adding...';
      try {
        const res = await fetch('/api/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ invite, category: category || undefined, notes: notes || undefined })
        });
        if (res.status === 201 || res.ok) {
          await fetchServers();
          addMsg.textContent = 'Server added.';
          inputInvite.value = ''; inputCategory.value = ''; textareaNotes.value = '';
        } else if (res.status === 400) {
          const body = await res.json().catch(()=>null);
          addMsg.textContent = body && body.errors ? body.errors.join('; ') : 'Invalid data';
        } else if (res.status === 401) {
          addMsg.textContent = 'Unauthorized. Please login again.'; clearAuth(); adminRoot.innerHTML = ''; loginSection.style.display = '';
        } else {
          const txt = await res.text().catch(()=>null);
          addMsg.textContent = 'Server error: ' + (txt || res.status);
        }
      } catch (err) {
        console.error('Add server failed', err);
        addMsg.textContent = 'Network error while adding server.';
      } finally {
        btnAdd.disabled = false; btnAdd.textContent = 'Add';
      }
    });

    fetchServers();
  }

  // Login
  btnLogin.addEventListener('click', async () => {
    loginMsg.textContent = '';
    const passwordInput = document.getElementById('password');
    if(!passwordInput) return;
    const password = passwordInput.value;
    if(!password || !password.trim()){ loginMsg.textContent = 'Enter password.'; return; }
    btnLogin.disabled = true; btnLogin.textContent = 'Checking...';
    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'same-origin'
      });
      if (res.status === 200) {
        setAuthed('session');
        loginSection.style.display = 'none';
        renderPanel();
      } else if (res.status === 401) {
        const body = await res.json().catch(()=>null);
        loginMsg.textContent = (body && body.error) ? body.error : 'Incorrect password.';
      } else {
        const txt = await res.text().catch(()=>null);
        loginMsg.textContent = 'Login error: ' + (txt || res.status);
      }
    } catch (err) {
      console.error('Login failed', err);
      loginMsg.textContent = 'Network error during login.';
    } finally {
      btnLogin.disabled = false; btnLogin.textContent = 'Login';
    }
  });

  if(isAuthed()){
    loginSection.style.display = 'none';
    renderPanel();
  }

  // Fetch and render servers
  async function fetchServers(){
    const serversContainer = document.getElementById('servers');
    if(!serversContainer) return;
    serversContainer.innerHTML = '<div class="admin-empty">Loading...</div>';
    try {
      const res = await fetch('/api/servers', { credentials: 'same-origin' });
      if (!res.ok) { serversContainer.innerHTML = '<div class="admin-empty">Failed to load list.</div>'; return; }
      const list = await res.json();
      renderServers(list);
    } catch (err) {
      console.error('fetchServers error', err);
      serversContainer.innerHTML = '<div class="admin-empty">Network error.</div>';
    }
  }

  function renderServers(list){
    const serversContainer = document.getElementById('servers');
    if(!serversContainer) return;
    serversContainer.innerHTML = '';
    if(!list || !list.length){ serversContainer.innerHTML = '<div class="admin-empty">List is empty.</div>'; return; }
    list.forEach(s => {
      const row = document.createElement('div'); row.className = 'server-row';
      const avatar = document.createElement('img'); avatar.className = 'avatar'; avatar.alt = ''; avatar.loading = 'lazy';
      avatar.src = s.icon || '/img/placeholder-avatar.png';
      const meta = document.createElement('div'); meta.className = 'meta';
      const name = document.createElement('div'); name.className = 'name'; name.textContent = s.name || '(unnamed)';
      const info = document.createElement('div'); info.className = 'info';
      info.textContent = `Members: ${s.approx_member_count ?? '-'} · Category: ${s.category || '-'}`;
      meta.appendChild(name); meta.appendChild(info);
      if (s.notes) { const notesEl = document.createElement('div'); notesEl.className = 'notes'; notesEl.textContent = s.notes; meta.appendChild(notesEl); }
      const actions = document.createElement('div'); actions.className = 'actions';
      if (s.invalid) { const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = 'Invalid invite'; actions.appendChild(badge); }

      const edit = document.createElement('button'); edit.className = 'btn small'; edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        const newNotes = prompt('Note', s.notes || '');
        if (newNotes !== null) {
          fetch(`/api/servers/${encodeURIComponent(s.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ notes: newNotes })
          }).then(res => { if (res.ok) fetchServers(); else alert('Failed to save notes'); }).catch(err => { console.error(err); alert('Failed to save notes'); });
        }
      });

      const del = document.createElement('button'); del.className = 'btn small'; del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if (confirm('Delete this server?')) {
          fetch(`/api/servers/${encodeURIComponent(s.id)}`, { method: 'DELETE', credentials: 'same-origin' })
            .then(res => { if (res.ok) fetchServers(); else alert('Failed to delete'); })
            .catch(err => { console.error(err); alert('Failed to delete'); });
        }
      });

      actions.appendChild(edit); actions.appendChild(del);
      row.appendChild(avatar); row.appendChild(meta); row.appendChild(actions);
      serversContainer.appendChild(row);
    });
  }

});
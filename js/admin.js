document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('loginSection');
  const adminRoot = document.getElementById('adminRoot');
  const btnLogin = document.getElementById('btnLogin');
  const loginMsg = document.getElementById('loginMsg');

  function isAuthed(){ return !!sessionStorage.getItem('admin-token'); }
  function setAuthed(token){ sessionStorage.setItem('admin-token', token); }
  function clearAuth(){ sessionStorage.removeItem('admin-token'); }

  // Cache servers for client-side sorting
  let serversCache = [];

  const sorters = {
    members: (a, b) => {
      const A = Number(a.approx_member_count ?? -Infinity);
      const B = Number(b.approx_member_count ?? -Infinity);
      return B - A;
    },
    online: (a, b) => {
      const A = Number(a.approx_presence_count ?? -Infinity);
      const B = Number(b.approx_presence_count ?? -Infinity);
      return B - A;
    },
    name: (a, b) => ( (a.name||'').toLowerCase().localeCompare((b.name||'').toLowerCase()) ),
    category: (a, b) => ( (a.category||'').toLowerCase().localeCompare((b.category||'').toLowerCase()) )
  };

  function renderPanel(){
    adminRoot.innerHTML = '';
    const panelWrap = document.createElement('div');

    // Controls row
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
    btnLogout.id = 'btnLogout';
    btnLogout.textContent = 'Logout';

    const btnCheckAll = document.createElement('button');
    btnCheckAll.className = 'btn small';
    btnCheckAll.id = 'btnCheckAll';
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
    h3.style.margin = '0 0 8px 0';
    h3.style.fontSize = '1rem';
    h3.textContent = 'Add new server';
    formInner.appendChild(h3);

    // invite
    const rowInvite = document.createElement('div');
    rowInvite.className = 'form-row';
    const inputInvite = document.createElement('input');
    inputInvite.id = 'invite';
    inputInvite.type = 'text';
    inputInvite.placeholder = 'Invite (code or full URL)';
    inputInvite.autocomplete = 'off';
    rowInvite.appendChild(inputInvite);
    formInner.appendChild(rowInvite);

    // category
    const rowCategory = document.createElement('div');
    rowCategory.className = 'form-row';
    const inputCategory = document.createElement('input');
    inputCategory.id = 'category';
    inputCategory.type = 'text';
    inputCategory.placeholder = 'Category (optional)';
    rowCategory.appendChild(inputCategory);
    formInner.appendChild(rowCategory);

    // notes
    const rowNotes = document.createElement('div');
    rowNotes.className = 'form-row';
    const textareaNotes = document.createElement('input');
    textareaNotes.id = 'notes';
    textareaNotes.type = 'text';
    textareaNotes.placeholder = 'Note (optional)';
    rowNotes.appendChild(textareaNotes);
    formInner.appendChild(rowNotes);

    // submit
    const rowSubmit = document.createElement('div');
    rowSubmit.className = 'form-row';
    rowSubmit.style.justifyContent = 'flex-end';
    rowSubmit.style.marginTop = '8px';
    const btnAdd = document.createElement('button');
    btnAdd.id = 'btnAdd';
    btnAdd.className = 'btn';
    btnAdd.textContent = 'Add';
    rowSubmit.appendChild(btnAdd);
    formInner.appendChild(rowSubmit);

    const addMsg = document.createElement('div');
    addMsg.id = 'addMsg';
    addMsg.className = 'muted';
    addMsg.style.marginTop = '8px';
    formInner.appendChild(addMsg);

    formSection.appendChild(formInner);
    panelWrap.appendChild(formSection);

    // Servers list header + sort selector (selector to the right of "Server list")
    const listHeaderWrap = document.createElement('div');
    listHeaderWrap.style.display = 'flex';
    listHeaderWrap.style.alignItems = 'center';
    listHeaderWrap.style.justifyContent = 'space-between';
    listHeaderWrap.style.marginTop = '6px';
    listHeaderWrap.style.marginBottom = '8px';

    const h3List = document.createElement('h3');
    h3List.style.margin = '0';
    h3List.textContent = 'Server list';

    // Sort select for admin (random not included; default = members)
    const sortSelectAdmin = document.createElement('select');
    sortSelectAdmin.id = 'sortSelectAdmin';
    sortSelectAdmin.className = 'sort-select';
    // options: members, online, name, category
    const optMembers = document.createElement('option'); optMembers.value = 'members'; optMembers.textContent = 'Members';
    const optOnline = document.createElement('option'); optOnline.value = 'online'; optOnline.textContent = 'Online';
    const optName = document.createElement('option'); optName.value = 'name'; optName.textContent = 'Name';
    const optCategory = document.createElement('option'); optCategory.value = 'category'; optCategory.textContent = 'Category';
    sortSelectAdmin.appendChild(optMembers);
    sortSelectAdmin.appendChild(optOnline);
    sortSelectAdmin.appendChild(optName);
    sortSelectAdmin.appendChild(optCategory);
    // default admin sort = members
    sortSelectAdmin.value = 'members';

    // place select to the right of header
    listHeaderWrap.appendChild(h3List);
    listHeaderWrap.appendChild(sortSelectAdmin);
    panelWrap.appendChild(listHeaderWrap);

    // Servers container
    const serversContainer = document.createElement('div');
    serversContainer.id = 'servers';
    serversContainer.className = 'admin-list';
    serversContainer.setAttribute('aria-live', 'polite');
    panelWrap.appendChild(serversContainer);

    adminRoot.appendChild(panelWrap);

    // Handlers
    btnLogout.addEventListener('click', () => {
      try { fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' }); } catch(e){}
      clearAuth();
      adminRoot.innerHTML = '';
      loginSection.style.display = '';
    });

    btnCheckAll.addEventListener('click', async () => {
      btnCheckAll.disabled = true;
      btnCheckAll.textContent = 'Checking...';
      try {
        const res = await fetch('/api/servers/check-all', {
          method: 'POST',
          credentials: 'same-origin'
        });
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
        btnCheckAll.disabled = false;
        btnCheckAll.textContent = 'Check all servers';
      }
    });

    // Add server handler
    btnAdd.addEventListener('click', async () => {
      addMsg.textContent = '';
      const invite = inputInvite.value.trim();
      const category = inputCategory.value.trim();
      const notes = textareaNotes.value.trim();

      if (!invite) {
        addMsg.textContent = 'Invite is required.';
        return;
      }

      btnAdd.disabled = true;
      btnAdd.textContent = 'Adding...';

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
          inputInvite.value = '';
          inputCategory.value = '';
          textareaNotes.value = '';
        } else if (res.status === 400) {
          const body = await res.json().catch(()=>null);
          addMsg.textContent = body && body.errors ? body.errors.join('; ') : 'Invalid data';
        } else if (res.status === 401) {
          addMsg.textContent = 'Unauthorized. Please login again.';
          clearAuth();
          adminRoot.innerHTML = '';
          loginSection.style.display = '';
        } else {
          const txt = await res.text().catch(()=>null);
          addMsg.textContent = 'Server error: ' + (txt || res.status);
        }
      } catch (err) {
        console.error('Add server failed:', err);
        addMsg.textContent = 'Network error while adding server.';
      } finally {
        btnAdd.disabled = false;
        btnAdd.textContent = 'Add';
      }
    });

    // Sorting: when admin changes selection, re-render sorted list
    sortSelectAdmin.addEventListener('change', () => {
      applyAdminSortAndRender();
    });

    // initial fetch
    fetchServers();
  }

  // Login handler
  btnLogin.addEventListener('click', async () => {
    loginMsg.textContent = '';
    const passwordInput = document.getElementById('password');
    if(!passwordInput) return;
    const password = passwordInput.value;

    if(!password || !password.trim()){
      loginMsg.textContent = 'Enter password.';
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Checking...';

    try {
      const res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
        credentials: 'same-origin'
      });

      if (res.status === 200) {
        setAuthed('session');
        loginSection.style.display = 'none';
        renderPanel();
        return;
      } else if (res.status === 401) {
        loginMsg.textContent = 'Incorrect password.';
      } else {
        const text = await res.text().catch(()=>null);
        loginMsg.textContent = `Login error: ${res.status}${text ? ' — ' + text : ''}`;
      }
    } catch (err) {
      console.error('Login request failed:', err);
      loginMsg.textContent = 'Network error during login.';
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Login';
    }
  });

  if(isAuthed()){
    loginSection.style.display = 'none';
    renderPanel();
  }

  // Fetch servers and render into #servers
  async function fetchServers(){
    const serversContainer = document.getElementById('servers');
    if(!serversContainer) return;
    serversContainer.innerHTML = '<div class="admin-empty">Loading...</div>';
    try{
      const res = await fetch('/api/servers', { credentials: 'same-origin' });
      if(!res.ok){ serversContainer.innerHTML = '<div class="admin-empty">Failed to load list</div>'; return; }
      const list = await res.json();
      serversCache = Array.isArray(list) ? list : [];
      applyAdminSortAndRender();
    }catch(e){
      serversContainer.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>';
    }
  }

  function applyAdminSortAndRender(){
    const serversContainer = document.getElementById('servers');
    if(!serversContainer) return;
    const select = document.getElementById('sortSelectAdmin');
    let list = serversCache.slice();
    const sel = select ? select.value : 'members';
    if (sel && sorters[sel]) {
      list.sort(sorters[sel]);
    }
    renderServers(list);
  }

  function renderServers(list){
    const serversContainer = document.getElementById('servers');
    if(!serversContainer) return;
    serversContainer.innerHTML = '';
    if(!list || !list.length){ serversContainer.innerHTML = '<div class="admin-empty">The list is empty... for now.</div>'; return; }
    list.forEach(s => {
      const row = document.createElement('div');
      row.className = 'server-row';

      const avatar = document.createElement('img');
      avatar.className = 'avatar';
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.src = s.icon || '/img/placeholder-avatar.png';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = s.name || '(unnamed)';
      const info = document.createElement('div');
      info.className = 'info';
      const membersText = (typeof s.approx_member_count !== 'undefined' && s.approx_member_count !== null)
        ? s.approx_member_count.toLocaleString()
        : '-';
      const presenceText = (typeof s.approx_presence_count !== 'undefined' && s.approx_presence_count !== null)
        ? s.approx_presence_count.toLocaleString()
        : '-';
      info.textContent = `Members: ${membersText}, Online: ${presenceText} · Category: ${s.category || '-'}`;

      meta.appendChild(name);
      meta.appendChild(info);

      if(s.notes){
        const notesEl = document.createElement('div');
        notesEl.className = 'notes';
        notesEl.textContent = `Note: ${s.notes}`;
        meta.appendChild(notesEl);
      }

      const actions = document.createElement('div');
      actions.className = 'actions';

      if(s.invalid){
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = 'Invalid invite';
        actions.appendChild(badge);
      }

      const edit = document.createElement('button');
      edit.className = 'btn small';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => {
        const newInvite = prompt('Invite (code or full URL):', s.invite || '');
        if (newInvite === null) return;
        const newCategory = prompt('Category (optional):', s.category || '');
        if (newCategory === null) return;
        const newNotes = prompt('Notes (optional):', s.notes || '');
        if (newNotes === null) return;

        const payload = {};
        if (String(newInvite).trim() !== (s.invite || '')) payload.invite = String(newInvite).trim();
        if (String(newCategory).trim() !== (s.category || '')) payload.category = String(newCategory).trim();
        if (String(newNotes).trim() !== (s.notes || '')) payload.notes = String(newNotes).trim();

        if (Object.keys(payload).length === 0) return;

        fetch(`/api/servers/${encodeURIComponent(s.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload)
        }).then(res => {
          if (res.ok) fetchServers();
          else if (res.status === 400) {
            res.json().then(b => alert('Validation error: ' + (b && b.errors ? b.errors.join('; ') : 'invalid data'))).catch(()=>alert('Validation error'));
          } else if (res.status === 401) {
            alert('Unauthorized. Please login again.');
            clearAuth();
            adminRoot.innerHTML = '';
            loginSection.style.display = '';
          } else {
            res.text().then(t => alert('Update failed: ' + (t || res.status))).catch(()=>alert('Update failed'));
          }
        }).catch(err => {
          console.error('Save failed:', err);
          alert('Failed to save changes');
        });
      });

      const del = document.createElement('button');
      del.className = 'btn small';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if(confirm('Delete this server from the list?')){
          fetch(`/api/servers/${encodeURIComponent(s.id)}`, {
            method: 'DELETE',
            credentials: 'same-origin'
          }).then(res => {
            if (res.ok) fetchServers();
            else alert('Delete failed');
          }).catch(err => {
            console.error('Delete failed:', err);
            alert('Failed to delete server');
          });
        }
      });

      actions.appendChild(edit);
      actions.appendChild(del);

      row.appendChild(avatar);
      row.appendChild(meta);
      row.appendChild(actions);

      serversContainer.appendChild(row);
    });
  }

});
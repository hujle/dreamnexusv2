document.addEventListener('DOMContentLoaded', () => {
  const loginSection = document.getElementById('loginSection');
  const adminRoot = document.getElementById('adminRoot');
  const btnLogin = document.getElementById('btnLogin');
  const loginMsg = document.getElementById('loginMsg');

  function isAuthed(){ return !!sessionStorage.getItem('admin-token'); }
  function setAuthed(token){ sessionStorage.setItem('admin-token', token); }
  function clearAuth(){ sessionStorage.removeItem('admin-token'); }

  function renderPanel(){
    adminRoot.innerHTML = '';
    const panelWrap = document.createElement('div');

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

    const adminStatus = document.createElement('span');
    adminStatus.id = 'adminStatus';
    adminStatus.className = 'muted';
    adminStatus.style.marginLeft = '8px';

    leftControls.appendChild(btnLogout);
    leftControls.appendChild(btnCheckAll);
    leftControls.appendChild(adminStatus);

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
    h3.textContent = 'Add server';
    formInner.appendChild(h3);

    const rowInvite = document.createElement('div');
    rowInvite.className = 'form-row';
    const inputInvite = document.createElement('input');
    inputInvite.id = 'invite';
    inputInvite.type = 'url';
    inputInvite.placeholder = 'https://discord.gg/invite-code или https://discord.com/invite/invite-code';
    rowInvite.appendChild(inputInvite);
    formInner.appendChild(rowInvite);

    const rowCategory = document.createElement('div');
    rowCategory.className = 'form-row';
    const inputCategory = document.createElement('input');
    inputCategory.id = 'category';
    inputCategory.type = 'text';
    inputCategory.placeholder = 'Category (optional)';
    rowCategory.appendChild(inputCategory);
    formInner.appendChild(rowCategory);

    const rowNotes = document.createElement('div');
    rowNotes.className = 'form-row';
    const textareaNotes = document.createElement('textarea');
    textareaNotes.id = 'notes';
    textareaNotes.placeholder = 'Note (optional)';
    rowNotes.appendChild(textareaNotes);
    formInner.appendChild(rowNotes);

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

    formSection.appendChild(formInner);
    panelWrap.appendChild(formSection);

    // Servers list
    const listSection = document.createElement('section');
    const h3List = document.createElement('h3');
    h3List.style.marginTop = '0';
    h3List.textContent = 'Servers list';
    listSection.appendChild(h3List);

    const serversContainer = document.createElement('div');
    serversContainer.id = 'servers';
    serversContainer.className = 'admin-list';
    serversContainer.setAttribute('aria-live', 'polite');
    listSection.appendChild(serversContainer);

    panelWrap.appendChild(listSection);
    adminRoot.appendChild(panelWrap);

    // Handlers
    btnLogout.addEventListener('click', () => {
      clearAuth();
      adminRoot.innerHTML = '';
      loginSection.style.display = '';
    });

    btnCheckAll.addEventListener('click', () => {
      btnCheckAll.disabled = true;
      btnCheckAll.textContent = 'Checking...';
      setTimeout(()=>{ btnCheckAll.disabled = false; btnCheckAll.textContent = 'Check all servers'; alert('Checking completed (demo).'); }, 1200);
    });

    btnAdd.addEventListener('click', () => {
      const invite = inputInvite.value.trim();
      const category = inputCategory.value.trim();
      const notes = textareaNotes.value.trim();
      if(!invite){ alert('Enter Discord invite link'); return; }
      inputInvite.value = '';
      inputCategory.value = '';
      textareaNotes.value = '';
      fetchServers();
    });

    fetchServers();
  }

  // Login handler: POST /admin/login
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
        credentials: 'same-origin' // allow cookies if server sets session cookie
      });

      // Debug logging to console to help diagnose server responses
      console.info('Login response status:', res.status, 'redirected:', res.redirected);
      const contentType = res.headers.get('content-type') || '';
      console.info('Login response content-type:', contentType);

      if (res.status === 200) {
        // Try parse JSON if present
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(()=>null);
          console.info('Login JSON body:', data);
          const token = data && data.token ? data.token : null;
          if (token) {
            setAuthed(token);
            loginSection.style.display = 'none';
            renderPanel();
            return;
          }
          // If no token but server returned 200 JSON without token, treat as failure
          // but also allow fallback: if server uses session cookie (no token), accept 200
          // We'll accept 200 as success when no explicit error is returned.
          console.warn('200 OK but no token in JSON; proceeding as success (server may use session cookie).');
          setAuthed('session'); // placeholder token to mark session
          loginSection.style.display = 'none';
          renderPanel();
          return;
        }

        // If content-type is HTML or other, server may have set a session cookie and returned HTML.
        // Treat 200 as success in that case as well.
        if (contentType.includes('text/html') || res.redirected) {
          console.info('200 OK with HTML or redirected; assuming server set session cookie — granting access.');
          setAuthed('session');
          loginSection.style.display = 'none';
          renderPanel();
          return;
        }

        // Fallback: if 200 and unknown content-type, still accept but log
        console.info('200 OK with unknown content-type; granting access as fallback.');
        setAuthed('session');
        loginSection.style.display = 'none';
        renderPanel();
        return;
      } else if (res.status === 401) {
        loginMsg.textContent = 'Incorrect password.';
      } else if (res.status === 404) {
        loginMsg.textContent = 'No login route (404). Check URL on the server.';
      } else {
        const text = await res.text().catch(()=>null);
        loginMsg.textContent = `Server error: ${res.status}${text ? ' — ' + text : ''}`;
      }
    } catch (err) {
      console.error('Login request failed:', err);
      loginMsg.textContent = 'Cannot connect to the server. Check if the server is running or network is available.';
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Login';
    }
  });

  // If already authed (token in sessionStorage), render panel immediately
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
      if(!res.ok){ serversContainer.innerHTML = '<div class="admin-empty">An error occured while loading the list.</div>'; return; }
      const list = await res.json();
      renderServers(list);
      serversContainer.scrollTop = serversContainer.scrollHeight;
    }catch(e){
      serversContainer.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>';
    }
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
      info.textContent = `Members: ${s.approx_member_count ?? '-'} · Category: ${s.category || '-'}`;

      meta.appendChild(name);
      meta.appendChild(info);

      if(s.notes){
        const notesEl = document.createElement('div');
        notesEl.className = 'notes';
        notesEl.textContent = s.notes;
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
        const newNotes = prompt('Note', s.notes || '');
        if(newNotes !== null){
          s.notes = newNotes;
          fetchServers();
        }
      });

      const del = document.createElement('button');
      del.className = 'btn small';
      del.textContent = 'Delete';
      del.addEventListener('click', () => {
        if(confirm('Are you sure you want to delete this server from the list?')){
          fetchServers();
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
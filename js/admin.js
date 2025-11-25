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
    const wrap = document.createElement('div');

    // controls
    const ctrl = document.createElement('div');
    ctrl.style.display = 'flex'; ctrl.style.gap = '8px'; ctrl.style.marginBottom = '12px';
    const btnLogout = document.createElement('button'); btnLogout.className='btn small'; btnLogout.textContent='Logout';
    const btnCheckAll = document.createElement('button'); btnCheckAll.className='btn small'; btnCheckAll.textContent='Check all';
    ctrl.appendChild(btnLogout); ctrl.appendChild(btnCheckAll);
    wrap.appendChild(ctrl);

    // add form
    const form = document.createElement('section'); form.className='server-form';
    form.innerHTML = `
      <div style="padding:8px">
        <h3 style="margin:0 0 8px 0">Add server</h3>
        <div class="form-row"><input id="invite" type="text" placeholder="https://discord.gg/code or code"></div>
        <div class="form-row"><input id="category" type="text" placeholder="Category (optional)"></div>
        <div class="form-row"><textarea id="notes" placeholder="Note (optional)"></textarea></div>
        <div class="form-row" style="justify-content:flex-end"><button id="btnAdd" class="btn">Add</button></div>
        <div id="addMsg" class="muted" style="margin-top:8px"></div>
      </div>`;
    wrap.appendChild(form);

    // list container
    const listSection = document.createElement('section');
    listSection.innerHTML = '<h3 style="margin-top:0">Servers list</h3><div id="servers" class="admin-list" aria-live="polite"></div>';
    wrap.appendChild(listSection);

    adminRoot.appendChild(wrap);

    // handlers
    btnLogout.addEventListener('click', async () => {
      try { await fetch('/admin/logout', { method:'POST', credentials:'same-origin' }); } catch(e){}
      clearAuth(); adminRoot.innerHTML=''; loginSection.style.display='';
    });

    btnCheckAll.addEventListener('click', async () => {
      btnCheckAll.disabled = true; btnCheckAll.textContent='Checking...';
      try {
        const res = await fetch('/api/servers/check-all', { method:'POST', credentials:'same-origin' });
        if (!res.ok) { alert('Check-all failed'); }
        await fetchServers();
      } catch (e) { alert('Network error during check-all'); }
      finally { btnCheckAll.disabled=false; btnCheckAll.textContent='Check all'; }
    });

    const btnAdd = document.getElementById('btnAdd');
    btnAdd.addEventListener('click', async () => {
      const invite = document.getElementById('invite').value.trim();
      const category = document.getElementById('category').value.trim();
      const notes = document.getElementById('notes').value.trim();
      const addMsg = document.getElementById('addMsg');
      addMsg.textContent = '';
      if (!invite) { addMsg.textContent = 'Invite is required.'; return; }
      btnAdd.disabled = true; btnAdd.textContent = 'Adding...';
      try {
        const res = await fetch('/api/servers', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          credentials:'same-origin',
          body: JSON.stringify({ invite, category: category || undefined, notes: notes || undefined })
        });
        if (res.status === 201 || res.ok) {
          addMsg.textContent = 'Server added.'; document.getElementById('invite').value=''; document.getElementById('category').value=''; document.getElementById('notes').value='';
          await fetchServers();
        } else {
          const body = await res.json().catch(()=>null);
          addMsg.textContent = (body && body.errors) ? body.errors.join('; ') : ('Error: ' + res.status);
        }
      } catch (e) { addMsg.textContent = 'Network error.'; }
      finally { btnAdd.disabled=false; btnAdd.textContent='Add'; }
    });

    fetchServers();
  }

  btnLogin.addEventListener('click', async () => {
    loginMsg.textContent = '';
    const password = document.getElementById('password').value;
    if (!password) { loginMsg.textContent='Enter password.'; return; }
    btnLogin.disabled=true; btnLogin.textContent='Checking...';
    try {
      const res = await fetch('/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({ password }) });
      if (res.status === 200) { setAuthed('session'); loginSection.style.display='none'; renderPanel(); }
      else { const body = await res.json().catch(()=>null); loginMsg.textContent = (body && body.error) ? body.error : 'Login failed.'; }
    } catch (e) { loginMsg.textContent='Network error.'; }
    finally { btnLogin.disabled=false; btnLogin.textContent='Login'; }
  });

  if (isAuthed()) { loginSection.style.display='none'; renderPanel(); }

  async function fetchServers(){
    const container = document.getElementById('servers');
    if (!container) return;
    container.innerHTML = '<div class="admin-empty">Loading...</div>';
    try {
      const res = await fetch('/api/servers', { credentials:'same-origin' });
      if (!res.ok) { container.innerHTML = '<div class="admin-empty">Failed to load.</div>'; return; }
      const list = await res.json();
      renderServers(list);
    } catch (e) { container.innerHTML = '<div class="admin-empty">Network error.</div>'; }
  }

  function renderServers(list){
    const container = document.getElementById('servers');
    container.innerHTML = '';
    if (!list || !list.length) { container.innerHTML = '<div class="admin-empty">Empty list.</div>'; return; }
    list.forEach(s => {
      const row = document.createElement('div'); row.className='server-row';
      const avatar = document.createElement('img'); avatar.className='avatar'; avatar.src = s.icon || '/img/placeholder-avatar.png';
      const meta = document.createElement('div'); meta.className='meta';
      const name = document.createElement('div'); name.className='name'; name.textContent = s.name || '(unnamed)';
      const info = document.createElement('div'); info.className='info'; info.textContent = `Members: ${s.approx_member_count ?? '-'} · Category: ${s.category || '-'}`;
      meta.appendChild(name); meta.appendChild(info);
      if (s.notes) { const n = document.createElement('div'); n.className='notes'; n.textContent = s.notes; meta.appendChild(n); }
      const actions = document.createElement('div'); actions.className='actions';
      const edit = document.createElement('button'); edit.className='btn small'; edit.textContent='Edit';
      edit.addEventListener('click', async () => {
        const newInvite = prompt('Invite (full URL):', s.invite || '');
        if (newInvite === null) return;
        const newCategory = prompt('Category (optional):', s.category || '');
        if (newCategory === null) return;
        const newNotes = prompt('Note (optional):', s.notes || '');
        if (newNotes === null) return;
        const payload = {};
        if (String(newInvite).trim() !== (s.invite || '')) payload.invite = String(newInvite).trim();
        if (String(newCategory).trim() !== (s.category || '')) payload.category = String(newCategory).trim();
        if (String(newNotes).trim() !== (s.notes || '')) payload.notes = String(newNotes).trim();
        if (!Object.keys(payload).length) return;
        try {
          const res = await fetch(`/api/servers/${encodeURIComponent(s.id)}`, {
            method:'PUT', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload)
          });
          if (res.ok) await fetchServers();
          else { const body = await res.json().catch(()=>null); alert(body && body.errors ? body.errors.join('; ') : 'Update failed'); }
        } catch (e) { alert('Network error while updating'); }
      });
      const del = document.createElement('button'); del.className='btn small'; del.textContent='Delete';
      del.addEventListener('click', () => {
        if (!confirm('Delete this server?')) return;
        fetch(`/api/servers/${encodeURIComponent(s.id)}`, { method:'DELETE', credentials:'same-origin' })
          .then(r => { if (r.ok) fetchServers(); else alert('Delete failed'); }).catch(()=>alert('Network error'));
      });
      actions.appendChild(edit); actions.appendChild(del);
      row.appendChild(avatar); row.appendChild(meta); row.appendChild(actions);
      container.appendChild(row);
    });
  }
});
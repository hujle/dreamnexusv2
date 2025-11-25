document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');

  async function fetchServers() {
    listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Loading...</div>';
    try {
      const res = await fetch('/api/servers');
      if (!res.ok) {
        listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">An error occured while loading the list.</div>';
        return;
      }
      const servers = await res.json();
      renderList(servers);
    } catch (err) {
      console.error('Error loading the list:', err);
      listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Network error</div>';
    }
  }

  function renderList(servers) {
    listEl.innerHTML = '';
    if (!servers || !servers.length) {
      listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">The list is empty... for now.</div>';
      return;
    }

    servers.forEach(s => {
      const card = document.createElement('article');
      card.className = 'card';

      const inner = document.createElement('div');
      inner.className = 'card-inner';

      // Top: avatar + title
      const top = document.createElement('div');
      top.className = 'card-top';
      const avatar = document.createElement('img');
      avatar.className = 'avatar';
      avatar.alt = '';
      avatar.loading = 'lazy';
      avatar.src = s.icon || '/img/placeholder-avatar.png';
      const title = document.createElement('h3');
      title.className = 'title';
      title.textContent = s.name || '(unnamed)';
      top.appendChild(avatar);
      top.appendChild(title);

      // Middle: members and online
      const middle = document.createElement('div');
      middle.className = 'card-middle';

      const membersWrap = document.createElement('div');
      membersWrap.style.display = 'flex';
      membersWrap.style.flexDirection = 'column';
      membersWrap.style.alignItems = 'center';

      const members = document.createElement('div');
      members.className = 'members';
      members.textContent = (typeof s.approx_member_count !== 'undefined' && s.approx_member_count !== null)
        ? `${s.approx_member_count.toLocaleString()} members`
        : '—';
      membersWrap.appendChild(members);

      const online = document.createElement('div');
      online.className = 'online';
      online.textContent = (typeof s.approx_presence_count !== 'undefined' && s.approx_presence_count !== null)
        ? `${s.approx_presence_count.toLocaleString()} online`
        : '';
      if (online.textContent) membersWrap.appendChild(online);

      middle.appendChild(membersWrap);

      // Category
      if (s.category) {
        const category = document.createElement('div');
        category.className = 'members category';
        category.textContent = s.category;
        middle.appendChild(category);
      }

      // Bottom: notes and actions
      const bottom = document.createElement('div');
      bottom.className = 'card-bottom';
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      meta.textContent = s.short_description || s.notes || '';
      bottom.appendChild(meta);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.style.marginTop = '8px';

      const btn = document.createElement('a');
      btn.className = 'btn';
      btn.textContent = 'Join';
      btn.href = s.invite && s.invite.startsWith('http') ? s.invite : (s.invite ? `https://discord.gg/${encodeURIComponent(s.invite)}` : '#');
      if (btn.href === '#') btn.setAttribute('aria-disabled', 'true');
      else { btn.target = '_blank'; btn.rel = 'noopener noreferrer'; }

      actions.appendChild(btn);
      bottom.appendChild(actions);

      inner.appendChild(top);
      inner.appendChild(middle);
      inner.appendChild(bottom);
      card.appendChild(inner);
      listEl.appendChild(card);
    });
  }

  fetchServers();
});
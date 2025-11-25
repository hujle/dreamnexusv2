document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');

  async function fetchServers() {
    listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Loading...</div>';
    try {
      const res = await fetch('/api/servers');
      if (!res.ok) {
        listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Failed to load servers</div>';
        return;
      }
      const servers = await res.json();
      renderList(servers);
    } catch (err) {
      console.error('Failed to load servers:', err);
      listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Network error while loading servers</div>';
    }
  }

  function renderList(servers) {
    listEl.innerHTML = '';
    if (!servers || !servers.length) {
      listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">No servers yet.</div>';
      return;
    }

    servers.forEach(s => {
      const card = document.createElement('article');
      card.className = 'card fixed-card';

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

      const middle = document.createElement('div');
      middle.className = 'card-middle';

      const membersLine = document.createElement('div');
      membersLine.className = 'members-line';
      const total = (typeof s.approx_member_count !== 'undefined' && s.approx_member_count !== null)
        ? s.approx_member_count.toLocaleString()
        : '-';
      const presence = (typeof s.approx_presence_count !== 'undefined' && s.approx_presence_count !== null)
        ? s.approx_presence_count.toLocaleString()
        : '-';
      membersLine.textContent = `${total} members, ${presence} online`;
      middle.appendChild(membersLine);

      const inviteWrap = document.createElement('div');
      inviteWrap.className = 'invite-wrap';
      const btn = document.createElement('a');
      btn.className = 'btn invite-btn';
      btn.textContent = 'Join';
      btn.href = s.invite && s.invite.startsWith('http') ? s.invite : (s.invite ? `https://discord.gg/${encodeURIComponent(s.invite)}` : '#');
      if (btn.href === '#') {
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('disabled');
      } else {
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
      }
      inviteWrap.appendChild(btn);
      middle.appendChild(inviteWrap);

      const bottom = document.createElement('div');
      bottom.className = 'card-bottom';

      const categoryEl = document.createElement('div');
      categoryEl.className = 'card-category';
      categoryEl.textContent = `Category: ${s.category || '-'}`;
      bottom.appendChild(categoryEl);

      const noteEl = document.createElement('div');
      noteEl.className = 'card-note';
      noteEl.textContent = `Note: ${s.notes || '-'}`;
      bottom.appendChild(noteEl);

      inner.appendChild(top);
      inner.appendChild(middle);
      inner.appendChild(bottom);
      card.appendChild(inner);
      listEl.appendChild(card);
    });
  }

  fetchServers();
});
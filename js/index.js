document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('list');
  const sortSelect = document.getElementById('sortSelectMain');

  let serversCache = [];

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

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
    name: (a, b) => {
      const A = (a.name || '').toLowerCase();
      const B = (b.name || '').toLowerCase();
      return A.localeCompare(B);
    },
    category: (a, b) => {
      const A = (a.category || '').toLowerCase();
      const B = (b.category || '').toLowerCase();
      return A.localeCompare(B);
    }
  };

  function applySortAndRender() {
    let list = serversCache.slice();
    const sel = sortSelect ? sortSelect.value : '';
    if (!sel) {
      list = shuffle(list);
    } else if (sorters[sel]) {
      list.sort(sorters[sel]);
    }
    renderList(list);
  }

  async function fetchServers() {
    listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Loading...</div>';
    try {
      const res = await fetch('/api/servers');
      if (!res.ok) {
        listEl.innerHTML = '<div style="padding:18px;color:var(--muted)">Failed to load servers</div>';
        return;
      }
      const servers = await res.json();
      serversCache = Array.isArray(servers) ? servers : [];
      applySortAndRender();
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

      // Top: avatar + title (centered)
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

      // Middle: members line and invite area (centered)
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

      // Invite area: if invite invalid -> show "Invalid invite" (no button)
      const inviteWrap = document.createElement('div');
      inviteWrap.className = 'invite-wrap';

      // Determine invalidity: support several possible server-side flags
      const isInvalid = !!(
        s.invalid === true ||
        s.invite_valid === false ||
        (typeof s.invite_status === 'string' && s.invite_status.toLowerCase() === 'invalid')
      );

      if (isInvalid) {
        const invalidMsg = document.createElement('div');
        invalidMsg.className = 'invalid-warning';
        invalidMsg.setAttribute('role', 'status');
        invalidMsg.textContent = 'Invalid invite';
        inviteWrap.appendChild(invalidMsg);
      } else {
        // create join button only when invite is not marked invalid
        const btn = document.createElement('a');
        btn.className = 'btn invite-btn';
        btn.textContent = 'Join';
        const href = s.invite && String(s.invite).startsWith('http')
          ? s.invite
          : (s.invite ? `https://discord.gg/${encodeURIComponent(s.invite)}` : '#');

        if (href === '#') {
          // no invite provided -> show disabled message instead of button
          const noInvite = document.createElement('div');
          noInvite.className = 'invalid-warning';
          noInvite.textContent = 'No invite';
          inviteWrap.appendChild(noInvite);
        } else {
          btn.href = href;
          btn.target = '_blank';
          btn.rel = 'noopener noreferrer';
          inviteWrap.appendChild(btn);
        }
      }

      middle.appendChild(inviteWrap);

      // Bottom: category and note
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

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      applySortAndRender();
    });
  }

  fetchServers();
});

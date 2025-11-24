async function fetchServers() {
  try {
    const res = await fetch('/api/servers');
    if (!res.ok) {
      document.getElementById('list').innerText = 'An error occured while loading the list.';
      return;
    }
    const list = await res.json();
    render(list);
  } catch (err) {
    document.getElementById('list').innerText = 'Error: ' + err.message;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function(m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
  });
}

function render(list) {
  const container = document.getElementById('list');
  container.innerHTML = '';
  if (!list || !list.length) {
    container.innerHTML = '<p style="color:var(--muted)">The list is empty... for now.</p>';
    return;
  }

  list.forEach(s => {
    const card = document.createElement('article');
    card.className = 'card';

    const avatarHtml = s.icon
      ? `<img src="${escapeHtml(s.icon)}" alt="avatar" class="avatar" loading="lazy">`
      : `<div class="avatar" aria-hidden="true" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-weight:700">?</div>`;

    const name = s.name ? escapeHtml(s.name) : '(unnamed)';
    const members = s.approx_member_count ?? '-';
    const inviteHref = s.invite && (s.invite.startsWith('http') ? s.invite : `https://discord.gg/${encodeURIComponent(s.invite)}`);
    const invalid = !!s.invalid;

    card.innerHTML = `
      <div class="card-inner">
        <div class="card-top">
          ${avatarHtml}
          <div class="title">${name}</div>
          <div class="members">${members} members</div>
        </div>

        <div class="card-middle">
          ${invalid ? `<div class="invalid-warning">Invalid invite</div>` : `<a class="btn" href="${inviteHref || '#'}" target="_blank" rel="noopener noreferrer">Join</a>`}
        </div>

        <div class="card-bottom">
          <div class="card-meta">Category: ${escapeHtml(s.category || '-')}</div>
          <div class="card-notes">${escapeHtml(s.notes || '')}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

fetchServers();
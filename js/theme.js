(function(){
  const key = 'site-theme';
  const root = document.documentElement;

  function apply(theme){
    if(theme === 'light') root.classList.add('light');
    else root.classList.remove('light');
  }

  const saved = localStorage.getItem(key);
  if(saved) apply(saved);
  else {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    apply(prefersLight ? 'light' : 'dark');
  }

  function setButton(btn){
    if(!btn) return;
    const isLight = root.classList.contains('light');
    btn.innerHTML = `<i class="${isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon'}" aria-hidden="true"></i>`;
    btn.setAttribute('title', isLight ? 'Light theme' : 'Dark theme');
  }

  function toggle(){
    const isLight = root.classList.toggle('light');
    localStorage.setItem(key, isLight ? 'light' : 'dark');
    setButton(document.getElementById('themeToggle'));
    const icon = document.querySelector('#themeToggle i');
    if(icon){ icon.style.transform = 'scale(1.12)'; setTimeout(()=> icon.style.transform = '', 180); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if(btn){
      setButton(btn);
      btn.addEventListener('click', toggle);
    }
    const admin = document.querySelector('.admin-btn');
    if(admin) admin.setAttribute('aria-label', 'Administration panel');
  });
})();
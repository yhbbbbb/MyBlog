(() => {
  const storageKey = 'next-color-scheme';
  const root = document.documentElement;
  const sidebar = document.querySelector('.sidebar-inner');
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  if (!sidebar) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-color-scheme-toggle';
  button.setAttribute('aria-pressed', 'false');

  const readPreference = () => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  };

  const savePreference = scheme => {
    try {
      localStorage.setItem(storageKey, scheme);
    } catch {
      // The current page still switches when browser storage is unavailable.
    }
  };

  let preference = readPreference();

  const applyScheme = scheme => {
    root.style.colorScheme = scheme;
    root.dataset.colorScheme = scheme;
    button.setAttribute('aria-label', scheme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    button.setAttribute('title', scheme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    button.setAttribute('aria-pressed', String(scheme === 'dark'));
    button.innerHTML = scheme === 'dark'
      ? '<i class="fa fa-sun" aria-hidden="true"></i>'
      : '<i class="fa fa-moon" aria-hidden="true"></i>';
  };

  sidebar.appendChild(button);
  applyScheme(preference || (media.matches ? 'dark' : 'light'));

  button.addEventListener('click', () => {
    preference = root.style.colorScheme === 'dark' ? 'light' : 'dark';
    savePreference(preference);
    applyScheme(preference);
  });

  const followSystemPreference = event => {
    if (!preference) applyScheme(event.matches ? 'dark' : 'light');
  };

  if (media.addEventListener) {
    media.addEventListener('change', followSystemPreference);
  } else if (media.addListener) {
    media.addListener(followSystemPreference);
  }
})();

(() => {
  let preference = 'system'
  try {
    const stored = window.localStorage.getItem('currency-quiz.theme.v1')
    if (stored === 'light' || stored === 'dark') preference = stored
  } catch { /* The system preference still works when storage is blocked. */ }

  let systemDark = false
  try { systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches } catch { /* Default to light if detection is unavailable. */ }
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
  const root = document.documentElement
  if (preference === 'system') {
    root.removeAttribute('data-theme')
    root.style.colorScheme = ''
  } else {
    root.setAttribute('data-theme', preference)
    root.style.colorScheme = preference
  }
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = resolved === 'dark' ? '#111b17' : '#f6f7f2'
  }
})()

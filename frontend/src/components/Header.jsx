function RefreshIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThemeIcon({ theme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path
          d="M3 12h4l2-6 4 12 2-6h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export default function Header({
  source,
  lastRefreshed,
  refreshing,
  refreshError,
  onRefresh,
  theme,
  onToggleTheme,
}) {
  const sourceLabel = source ? String(source).toLowerCase() : null
  const live = sourceLabel === 'live'
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-main">
          <BrandMark />
          <div>
            <div className="header-title">
              <h1>Pipeline Monitor</h1>
              {sourceLabel && (
                <span
                  className={`source-badge ${live ? 'source-live' : 'source-mock'}`}
                  title="Data source reported by the API"
                >
                  <span className="pulse-dot" aria-hidden="true" />
                  {sourceLabel}
                </span>
              )}
            </div>
            <p className="header-sub">
              Databricks job health
              <span aria-hidden="true" className="header-sep">
                /
              </span>
              <span>
                Refreshed{' '}
                {lastRefreshed ? (
                  <time dateTime={lastRefreshed.toISOString()} className="mono">
                    {lastRefreshed.toLocaleTimeString(undefined, { timeStyle: 'short' })}
                  </time>
                ) : (
                  'n/a'
                )}
              </span>
            </p>
          </div>
        </div>
        <div className="header-actions">
          <div className="header-buttons">
            <button
              type="button"
              className="btn btn-icon-only"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            >
              <ThemeIcon theme={theme} />
            </button>
            <button
              type="button"
              className={`btn btn-primary ${refreshing ? 'is-busy' : ''}`}
              onClick={onRefresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshIcon />
              <span>{refreshing ? 'Refreshing…' : 'Refresh from Databricks'}</span>
            </button>
          </div>
          {refreshError && (
            <p className="inline-error" role="alert">
              Refresh failed: {refreshError}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}

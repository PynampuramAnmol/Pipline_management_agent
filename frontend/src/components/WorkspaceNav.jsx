export function WorkspaceIcon({ name, size = 20 }) {
  const paths = {
    overview: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    pipelines: 'M5 4h14v5H5zM5 15h14v5H5zM12 9v6',
    runs: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    connection: 'M8 3v5M16 3v5M5 8h14v3a7 7 0 0 1-14 0V8ZM12 18v4',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
    exit: 'M9 4H4v16h5M14 8l4 4-4 4M8 12h10',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.overview} /></svg>
}

export default function WorkspaceNav({ active, onNavigate, onDisconnect, source }) {
  return <aside className="workspace-sidebar">
    <a className="workspace-brand" href="#overview" onClick={e => { e.preventDefault(); onNavigate('overview') }}><span className="workspace-brand-mark"><WorkspaceIcon name="pipelines" /></span>PipeSage</a>
    <p className="sidebar-label">WORKSPACE</p>
    <nav aria-label="Dashboard navigation">
      {['overview', 'pipelines', 'runs', 'connection'].map(item => <button key={item} type="button" className={`sidebar-link ${active === item ? 'is-active' : ''}`} aria-current={active === item ? 'page' : undefined} onClick={() => onNavigate(item)}><WorkspaceIcon name={item} /><span>{{ overview: 'Overview', pipelines: 'Pipelines', runs: 'Run history', connection: 'Data source' }[item]}</span>{active === item && <span className="sidebar-indicator" />}</button>)}
    </nav>
    <div className="sidebar-bottom"><div className="sidebar-source"><span className="pulse-dot" aria-hidden="true" /><div><strong>{source === 'upload' ? 'Uploaded file' : 'Databricks API'}</strong><p>Session only</p></div></div><button className="sidebar-link" onClick={onDisconnect}><WorkspaceIcon name="exit" />Disconnect</button></div>
  </aside>
}

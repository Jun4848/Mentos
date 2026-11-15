const MainPageIcon = ({name, className = ""}) => {
  const icons = {
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h.01M12 15h.01M15 15h.01"/></>,
    room: <><path d="M4 21h16M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M10 21v-5h4v5M9 7h1m4 0h1M9 11h1m4 0h1"/></>,
    check: <path d="m6 12 4 4 8-8"/>,
    "arrow-right": <path d="M5 12h14m-6-6 6 6-6 6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/></>,
    chevron: <path d="m7 10 5 5 5-5"/>,
    logout: <><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-13 5 5-5 5M8 12h12"/></>,
    shield: <><path d="m12 3 8 3v6c0 4-3.5 7-8 9-4.5-2-8-5-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-9h.01"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m2-16a3 3 0 0 1 0 6m4 10v-2a6 6 0 0 0-3-5"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    home: <><path d="m3 10 9-7 9 7M5 9v12h14V9m-10 12v-7h6v7"/></>,
  };

  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{icons[name] || icons.info}</svg>;
};

export default MainPageIcon;

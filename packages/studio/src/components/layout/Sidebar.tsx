import { NavLink } from "react-router-dom";
import { useConnectionStore } from "../../stores/connectionStore";

const navItems = [
  {
    to: "/chat",
    label: "Chat",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.2 48.2 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    to: "/config",
    label: "Config",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    to: "/self-modify",
    label: "Self-Modify",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    to: "/observability",
    label: "Observability",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    to: "/costs",
    label: "Costs",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { connected } = useConnectionStore();

  return (
    <aside
      data-testid="sidebar"
      className="relative z-20 flex h-full w-56 flex-col glass-panel-strong"
    >
      {/* Cyan glow line on right edge */}
      <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-cyan-500/20 via-cyan-500/5 to-transparent" />

      {/* Brand */}
      <div className="relative border-b border-white/[0.04] px-5 py-5">
        <div className="flex items-baseline gap-2">
          <span className="bg-gradient-to-r from-cyan-300 to-teal-300 bg-clip-text text-lg font-bold tracking-tight text-transparent text-glow">
            Proteus
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-cyan-500/40">
            Studio
          </span>
        </div>
        {/* Subtle glow under brand */}
        <div className="absolute -bottom-px left-5 h-px w-16 bg-gradient-to-r from-cyan-400/40 to-transparent" />
      </div>

      {/* Connection indicator */}
      <div
        data-testid="connection-indicator"
        className="flex items-center gap-2.5 px-5 py-3"
      >
        <span className="relative flex h-2 w-2">
          {connected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
          )}
          <span
            data-testid="connection-dot"
            className={`relative inline-flex h-2 w-2 rounded-full ${
              connected
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
                : "bg-red-500/70"
            }`}
          />
        </span>
        <span className="text-[11px] text-gray-500">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Navigation */}
      <nav data-testid="nav" className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`nav-${item.to.replace("/", "") || "home"}`}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? "bg-cyan-500/[0.08] text-cyan-100 glow-border"
                  : "text-gray-500 hover:bg-white/[0.03] hover:text-gray-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`transition-colors duration-200 ${
                    isActive
                      ? "text-cyan-400"
                      : "text-gray-600 group-hover:text-gray-400"
                  }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {/* Active glow indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-5 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-gray-600">
            v0.1.0
          </span>
          <div className="flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-cyan-500/30 animate-glow-pulse" />
            <span className="h-1 w-1 rounded-full bg-teal-400/30 animate-glow-pulse [animation-delay:1s]" />
            <span className="h-1 w-1 rounded-full bg-purple-400/30 animate-glow-pulse [animation-delay:2s]" />
          </div>
        </div>
      </div>
    </aside>
  );
}

import { NavLink } from "react-router-dom";
import { useConnectionStore } from "../../stores/connectionStore";

const navItems = [
  { to: "/chat", label: "Chat" },
  { to: "/config", label: "Config" },
  { to: "/self-modify", label: "Self-Modify" },
  { to: "/observability", label: "Observability" },
  { to: "/costs", label: "Costs" },
];

export default function Sidebar() {
  const { connected } = useConnectionStore();

  return (
    <aside data-testid="sidebar" className="flex h-full w-56 flex-col border-r border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        <span className="text-lg font-bold tracking-tight text-white">
          Proteus
        </span>
        <span className="text-xs text-gray-500">Studio</span>
      </div>

      {/* Connection indicator */}
      <div data-testid="connection-indicator" className="flex items-center gap-2 px-4 py-2 text-xs">
        <span
          data-testid="connection-dot"
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-gray-400">
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Navigation */}
      <nav data-testid="nav" className="flex-1 space-y-0.5 px-2 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`nav-${item.to.replace("/", "") || "home"}`}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-4 py-3 text-xs text-gray-600">
        v0.1.0
      </div>
    </aside>
  );
}

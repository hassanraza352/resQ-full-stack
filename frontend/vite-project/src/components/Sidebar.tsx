
type SidebarProps = {
  sidebarOpen: boolean;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const Sidebar = ({ sidebarOpen, setSidebarOpen }: SidebarProps) => {
  return (
    <aside className={`side ${sidebarOpen ? "open" : ""}`}>
      <div className="side-header-controls">
        <div className="logo">
          <i>✚</i>
          RESQ
        </div>

        <button
          className="side-close-btn"
          onClick={() => setSidebarOpen(false)}
        >
          ✕
        </button>
      </div>

      <a href="/user/dashboard" className="on">
        <span>🏠</span>Dashboard
      </a>

      <a href="/user/report">
        <span>🚨</span>Report Incident
      </a>

      <a href="/user/my-reports">
        <span>📄</span>My Reports
      </a>

      <a href="/user/report-details">
        <span>📡</span>Live Status
      </a>

      <a href="/user/hospitals">
        <span>🏥</span>Nearby Hospitals
      </a>

      <a href="/user/units">
        <span>🚑</span>Service Units
      </a>

      <a href="/user/map">
        <span>🗺️</span>Live Map
      </a>

      <a href="/user/messages">
        <span>💬</span>Messages
      </a>

      <a href="/user/notifications">
        <span>🔔</span>Notifications
      </a>

      <a href="/user/settings">
        <span>⚙️</span>Settings
      </a>

      <div style={{ marginTop: "auto" }}>
        <a href="/login">
          <span>↪</span>
          Logout
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;



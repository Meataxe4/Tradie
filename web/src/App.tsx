import { useEffect, useState } from "react";
import { storage } from "./storage";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useSession } from "./session";
import { Icon } from "./ui";
import { Login } from "./views/Login";
import { NewJob } from "./views/NewJob";
import { Jobs } from "./views/Jobs";
import { JobDetail } from "./views/JobDetail";
import { Leads } from "./views/Leads";
import { LeadDetail } from "./views/LeadDetail";
import { Admin } from "./views/Admin";
import { ProjectDetail } from "./views/ProjectDetail";

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (storage.get("squiz.theme") === "dark" ? "dark" : "light"),
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    storage.set("squiz.theme", theme);
  }, [theme]);
  const dark = theme === "dark";
  return (
    <button
      className="icon-btn"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}

function TopBar() {
  const { identity, signOut } = useSession();
  const nav = useNavigate();
  return (
    <div className="topbar">
      <div className="topbar-in">
        <div className="brand">
          <span className="logo" aria-hidden="true">{Icon.tools}</span>
          <div>
            <b>Sorted&nbsp;By</b>
            <small>get sorted</small>
          </div>
        </div>
        {identity && (
          <nav className="nav">
            {identity.role === "homeowner" && (
              <>
                <NavLink to="/new" className={({ isActive }) => (isActive ? "active" : "")}>New job</NavLink>
                <NavLink to="/jobs" className={({ isActive }) => (isActive ? "active" : "")}>My jobs</NavLink>
              </>
            )}
            {identity.role === "tradie" && (
              <NavLink to="/leads" className={({ isActive }) => (isActive ? "active" : "")}>Browse jobs</NavLink>
            )}
            {identity.role === "admin" && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "active" : "")}>Operations</NavLink>
            )}
          </nav>
        )}
        <span className="spacer" />
        <div className="who">
          {identity && (
            <>
              <span>{identity.label}</span>
              <span className="role-pill">{identity.role}</span>
              <button className="icon-btn" onClick={() => { signOut(); nav("/"); }}>Sign out</button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function Home() {
  const { identity } = useSession();
  if (!identity) return <Login />;
  return <Navigate to={identity.role === "tradie" ? "/leads" : identity.role === "admin" ? "/admin" : "/new"} replace />;
}

function Guard({ role, children }: { role: "homeowner" | "tradie" | "admin"; children: JSX.Element }) {
  const { identity } = useSession();
  if (!identity) return <Navigate to="/" replace />;
  if (identity.role !== role) return <Navigate to="/" replace />;
  return children;
}

/** Mobile-only bottom navigation (the top-bar nav is hidden under 600px). */
function BottomNav() {
  const { identity } = useSession();
  if (!identity) return null;
  const items = identity.role === "tradie"
    ? [{ to: "/leads", label: "Jobs", icon: Icon.tools }]
    : identity.role === "admin"
      ? [{ to: "/admin", label: "Operations", icon: Icon.shield }]
      : [
          { to: "/new", label: "New job", icon: Icon.tools },
          { to: "/jobs", label: "My jobs", icon: Icon.doc },
        ];
  return (
    <nav className="bottomnav">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? "active" : "")}>
          <span className="bn-ico">{i.icon}</span>
          <span>{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  return (
    <div className="app">
      <TopBar />
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<Guard role="homeowner"><NewJob /></Guard>} />
          <Route path="/jobs" element={<Guard role="homeowner"><Jobs /></Guard>} />
          <Route path="/jobs/:id" element={<Guard role="homeowner"><JobDetail /></Guard>} />
          <Route path="/projects/:id" element={<Guard role="homeowner"><ProjectDetail /></Guard>} />
          <Route path="/leads" element={<Guard role="tradie"><Leads /></Guard>} />
          <Route path="/leads/:id" element={<Guard role="tradie"><LeadDetail /></Guard>} />
          <Route path="/admin" element={<Guard role="admin"><Admin /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

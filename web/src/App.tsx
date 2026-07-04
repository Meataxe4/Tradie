import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useSession } from "./session";
import { Icon } from "./ui";
import { Login } from "./views/Login";
import { NewJob } from "./views/NewJob";
import { Jobs } from "./views/Jobs";
import { JobDetail } from "./views/JobDetail";
import { Leads } from "./views/Leads";
import { LeadDetail } from "./views/LeadDetail";

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(() => document.documentElement.getAttribute("data-theme"));
  useEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const flip = () => {
    const cur = theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(cur === "dark" ? "light" : "dark");
  };
  return <button className="icon-btn" onClick={flip} aria-label="Toggle theme">Theme</button>;
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
            <b>Squiz</b>
            <small>home repairs, triaged</small>
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
          </nav>
        )}
        <span className="spacer" />
        <div className="who">
          {identity && (
            <>
              <span>{identity.label}</span>
              <span className="role-pill">{identity.role}</span>
              <button className="icon-btn" onClick={() => { signOut(); nav("/"); }}>Switch</button>
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
  return <Navigate to={identity.role === "tradie" ? "/leads" : "/new"} replace />;
}

function Guard({ role, children }: { role: "homeowner" | "tradie"; children: JSX.Element }) {
  const { identity } = useSession();
  if (!identity) return <Navigate to="/" replace />;
  if (identity.role !== role) return <Navigate to="/" replace />;
  return children;
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
          <Route path="/leads" element={<Guard role="tradie"><Leads /></Guard>} />
          <Route path="/leads/:id" element={<Guard role="tradie"><LeadDetail /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

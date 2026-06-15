import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import AppPage from "./pages/AppPage";

/** Minimal path-based router — no dependency, two routes. */
export function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (path.startsWith("/app")) return <AppPage />;
  return <Landing />;
}

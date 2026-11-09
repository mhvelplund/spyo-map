import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { isNativeApp } from "../utils/native.js";
import "./LandingPage.css";

export const LANDING_SEEN_KEY = "spyo.landingSeen";

/**
 * In the app the landing page is shown only once after install; later launches go straight to the map. App data
 * (and this flag) is wiped on uninstall.
 */
function seenBefore(): boolean {
  try {
    return isNativeApp() && localStorage.getItem(LANDING_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

const LandingPage: React.FC = () => {
  const [skip] = useState(seenBefore);
  useEffect(() => {
    if (skip || !isNativeApp()) return;
    try {
      localStorage.setItem(LANDING_SEEN_KEY, "1");
    } catch {
      // Storage unavailable: the page shows again next time.
    }
  }, [skip]);
  if (skip) return <Navigate to="/map" replace />;
  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1 className="landing-title">Spyo Map</h1>
        <p className="landing-description">
          This is an interactive map documenting my walks around Copenhagen
          looking for Spyo's little birds.
        </p>
        <p className="landing-description">
          The best ones are <em>obviously</em> the green, blue or red ones, with
          a yellow beak.{" "}
        </p>
        <p>
          {" "}
          Source:{" "}
          <a
            style={{ fontWeight: "bold", color: "var(--text-color)" }}
            href="https://github.com/mhvelplund/spyo-map"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
        <Link to="/map" className="landing-button">
          View Map
        </Link>
      </div>
    </div>
  );
};

export default LandingPage;

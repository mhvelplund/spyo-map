import { Link } from "react-router";
import "./LandingPage.css";

const LandingPage: React.FC = () => {
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

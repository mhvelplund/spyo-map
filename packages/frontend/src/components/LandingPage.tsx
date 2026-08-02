import { Link } from 'react-router';
import './LandingPage.css';

const LandingPage: React.FC = () => {
  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1 className="landing-title">Spyo Map</h1>
        <p className="landing-description">
          Explore geo-tagged photos from your travels. View images on an interactive map and discover locations where moments were captured.
        </p>
        <Link to="/map" className="landing-button">
          View Map
        </Link>
      </div>
    </div>
  );
};

export default LandingPage;

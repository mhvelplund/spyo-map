import { Routes, Route, Navigate } from 'react-router';
import LandingPage from '../components/LandingPage';
import MapPage from '../components/MapPage';

export const AppRouter = () => {
  return (
    <Routes>
      {/* Root path: landing page */}
      <Route path="/" element={<LandingPage />} />

      {/* Map routes */}
      <Route path="/map" element={<MapPage />}>
        <Route index element={null} />
        <Route path="image/:imageId" element={null} />
      </Route>

      {/* Deep-link support: redirect /image/:imageId to /map/image/:imageId */}
      <Route path="/image/:imageId" element={<Navigate to="/map/image/:imageId" replace />} />

      {/* Catch-all: redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRouter;

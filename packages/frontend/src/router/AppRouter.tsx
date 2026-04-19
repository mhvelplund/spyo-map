import { Routes, Route } from 'react-router-dom';
import MapPage from '../components/MapPage';

export const AppRouter = () => {
  return (
    <Routes>
      <Route element={<MapPage />}>
        <Route index element={null} />
        <Route path="image/:imageId" element={null} />
        <Route path="*" element={null} />
      </Route>
    </Routes>
  );
};

export default AppRouter;

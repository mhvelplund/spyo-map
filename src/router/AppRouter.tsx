import { Routes, Route } from 'react-router-dom'
import MainMapView from '../components/MainMapView'
import ImageView from '../components/ImageView'

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<MainMapView />} />
      <Route path="/image/:imageId" element={<ImageView />} />
      {/* Fallback route for invalid URLs */}
      <Route path="*" element={<MainMapView />} />
    </Routes>
  )
}

export default AppRouter
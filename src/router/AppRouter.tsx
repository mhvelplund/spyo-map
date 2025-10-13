import { Routes, Route } from 'react-router-dom'
import MainMapView from '../components/MainMapView'

const ImageView = () => (
  <div className="image-view">
    <h2>Image View</h2>
    <p>Direct image access route</p>
    <p>Image modal will be implemented in task 5</p>
  </div>
)

const LocationView = () => (
  <div className="location-view">
    <h2>Location View</h2>
    <p>Location-based view</p>
  </div>
)

export const AppRouter = () => {
  return (
    <Routes>
      <Route path="/" element={<MainMapView />} />
      <Route path="/image/:imageId" element={<ImageView />} />
      <Route path="/location/:lat/:lng" element={<LocationView />} />
    </Routes>
  )
}

export default AppRouter
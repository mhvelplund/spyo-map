import { Routes, Route } from 'react-router-dom'

// Placeholder components - will be implemented in later tasks
const MainMapView = () => (
  <div className="main-view">
    <h1>Spyro Map - Geo-Tagged Image Browser</h1>
    <p>Interactive map browser for geo-tagged images</p>
    <p>Map component will be implemented in task 4</p>
  </div>
)

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
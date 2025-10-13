# Google Maps Integration Setup

## Overview

The MapContainer component integrates Google Maps to display geo-tagged images as interactive markers on a map.

## Features Implemented

- ✅ Google Maps API integration using `@googlemaps/react-wrapper`
- ✅ Custom image markers with thumbnail previews
- ✅ Marker clustering for areas with multiple images
- ✅ Interactive map with pan and zoom
- ✅ Error handling for API failures
- ✅ Loading states and user feedback

## Setup Instructions

1. **Get a Google Maps API Key**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Maps JavaScript API
   - Create credentials (API Key)
   - Restrict the API key to your domain for security

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your API key:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

## Component Architecture

### MapContainer
- Main wrapper component that handles Google Maps API loading
- Manages error states and loading indicators
- Provides fallback UI for API failures

### GoogleMap (Internal Component)
- Handles map initialization and configuration
- Creates custom markers with thumbnail previews
- Implements marker clustering using `@googlemaps/markerclusterer`
- Manages marker interactions and selections

## Custom Features

### Thumbnail Markers
- Each image appears as a circular marker with its thumbnail
- SVG-based markers with white border for visibility
- Optimized for performance with proper sizing

### Marker Clustering
- Automatically groups nearby markers to reduce clutter
- Custom cluster styling with blue circles and white text
- Responsive clustering based on zoom level

### Map Styling
- Clean, minimal map style with reduced POI labels
- Optimized for image browsing experience

## Error Handling

- **API Key Missing**: Shows configuration instructions
- **API Load Failure**: Provides retry functionality
- **Network Issues**: Graceful degradation with error messages
- **Database Errors**: Handled at the service layer

## Performance Considerations

- Markers are created only when needed
- Efficient clustering reduces rendering overhead
- Optimized SVG icons for fast loading
- Proper cleanup of map resources

## Browser Compatibility

- Modern browsers with ES6+ support
- Mobile-responsive design
- Touch-friendly interactions
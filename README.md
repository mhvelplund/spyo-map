# Spyo Map

This is a browser-based web application that displays geo-tagged images on an interactive map. Users can browse images
by location, view them in a modal lightbox, navigate between nearby images, and share them on social media. The
application is built as a stateless React/TypeScript web app that can be hosted on any static web server.

## Development

This app was created by an old-fashioned developer using the dreaded vibe coding. It's a form physical log of my
experiment. This app was created with [Kiro](https://kiro.dev/) using this initial prompt below. It is not my first
attempt at creating a full app with Kiro, but it was the first _partially_ successful.

**The process is described in the [blog post](https://www.swissarmyronin.dk/blog/kiro/).**

## EXIF Extraction Script

This Python script extracts GPS and EXIF metadata from images and creates an SQLite database for the geo-image map
browser.

### Requirements

- Python 3.11+
- Pillow library for image processing

### Installation

```shell
uv sync
```

### Usage

```shell
uv run python extract_exif.py <path_to_image_folder>
```

Example:

```shell
uv run python extract_exif.py ./photos
```

### What it does

1. **Scans recursively** through the specified folder for supported image formats (JPG, JPEG, TIFF, TIF)
2. **Extracts EXIF data** including GPS coordinates, altitude, speed, direction, and other location metadata
3. **Creates folder structure** in web application root: `images/` and `images/thumbnails/`
4. **Scales images** with GPS data to maximum 2048x2048 pixels while preserving aspect ratio
5. **Creates optimized thumbnails** (200x200px) for web display
6. **Generates SQLite database** (`images.db`) in web application root with comprehensive GPS fields
7. **Skips images** without GPS data

### Output

- `images.db` - SQLite database containing image metadata (in web application root)
- `images/` - Directory containing scaled images (max 2048x2048px) named by their database ID
- `images/thumbnails/` - Directory containing optimized thumbnail images named by their database ID
- Console output showing processing progress

### Database Schema

The generated SQLite database includes these fields:

- `id` - Unique image identifier (used to derive file paths: `images/{id}.jpg` and `images/thumbnails/{id}.jpg`)
- `latitude`, `longitude` - GPS coordinates
- `timestamp` - Image capture time
- `altitude`, `speed`, `img_direction` - Additional GPS metadata
- Various reference fields for GPS data interpretation

**Note:** Image and thumbnail paths are not stored in the database since they can be derived from the ID:

- Scaled image: `images/{id}.jpg`
- Thumbnail: `images/thumbnails/{id}.jpg`

### Supported Image Formats

- JPEG (.jpg, .jpeg)
- TIFF (.tiff, .tif)

Images without GPS metadata are automatically skipped.

## Google Maps Integration Setup

The MapContainer component integrates Google Maps to display geo-tagged images as interactive markers on a map.

### Setup Instructions

1. **Get a Google Maps API Key**

   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Maps JavaScript API
   - Create credentials (API Key)
   - Restrict the API key to your domain for security

2. **Configure Environment Variables**

   ```shell
   cp .env.example .env
   ```

   Edit `.env` and add your API key:

   ```
   VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

3. **Start Development Server**
   ```shell
   npm run dev
   ```

### Component Architecture

#### MapContainer

- Main wrapper component that handles Google Maps API loading
- Manages error states and loading indicators
- Provides fallback UI for API failures

#### GoogleMap (Internal Component)

- Handles map initialization and configuration
- Creates custom markers with thumbnail previews using `AdvancedMarkerElement`
- Implements marker clustering using `@googlemaps/markerclusterer`
- Manages marker interactions and selections

### Custom Features

#### Thumbnail Markers

- Each image appears as a circular marker with its thumbnail
- HTML-based markers using AdvancedMarkerElement with white border for visibility
- Optimized for performance with proper sizing and error handling

#### Marker Clustering

- Automatically groups nearby markers to reduce clutter
- Custom cluster styling with blue circles and white text
- Responsive clustering based on zoom level

#### Map Styling

- Uses Google Maps default styling (custom styles must be configured in Google Cloud Console when using mapId)
- Optimized for image browsing experience with AdvancedMarkerElement
- Note: Custom map styles cannot be applied via JavaScript when using a mapId

### Error Handling

- **API Key Missing**: Shows configuration instructions
- **API Load Failure**: Provides retry functionality
- **Network Issues**: Graceful degradation with error messages
- **Database Errors**: Handled at the service layer

### Performance Considerations

- Markers are created only when needed
- Efficient clustering reduces rendering overhead
- Optimized SVG icons for fast loading
- Proper cleanup of map resources

### Browser Compatibility

- Modern browsers with ES6+ support
- Mobile-responsive design
- Touch-friendly interactions

## Build and Deployment

The application is configured for production deployment to static hosting providers.

### Environment Variables

Set the following environment variable for production:

```shell
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

### Quick Deployment

1. **Prepare your environment**:
   ```shell
   cp .env.example .env
   # Edit .env with your Google Maps API key
   ```

2. **Generate image database**:
   ```shell
   cd public
   python ../extract_exif.py path/to/your/images
   ```

3. **Build for production**:
   ```shell
   npm run build:production
   ```

4. **Deploy**: Upload the `dist/` folder to your hosting provider

### Other commands

```shell
# Start a local development server
npm run dev

# Development build
npm run build

# GitHub Pages build (with base path)
npm run build:github

# Validate build output
npm run build:validate

# Validate deployment requirements
npm run deploy:validate
```

### Deployment Structure

After building, the `dist/` directory contains:

```
dist/
├── index.html              # Main HTML file
├── assets/                 # Built JS/CSS assets
│   ├── css/
│   └── js/
├── images/                 # Image files and thumbnails
├── images.db              # SQLite database
├── .htaccess              # Apache configuration
└── vite.svg               # Favicon
```

# Spyro Map

This is a browser-based web application that displays geo-tagged images on an interactive map. Users can browse images
by location, view them in a modal lightbox, navigate between nearby images, and share them on social media. The
application is built as a stateless React/TypeScript web app that can be hosted on any static web server.

## Development

This app was created by an old-fashioned developer using the dreaded vibe coding. It's a form physical log of my
experiment. This app was created with [Kiro](https://kiro.dev/) using this initial prompt below. It is not my first
attempt at creating a full app with Kiro, but it was the first _partially_ successful.

### Initial prompt

```plaintext
I want to create a browser web-app that displays images on a map. The images are stored in a local folder and contain
geo location metadata.

Using the metadata, I want to display a map using Google Maps where the images are shown on the map in the location
contained in their metadata as a small thumbnail.

Clicking the thumbnail should display the full image in a modal light box. When viewing an image, if there are any other
images on the map within 1 km of the current image, there should be arrow buttons that allow the user to browse those
images as a carousel.

The application should use routing to give each image a unique URL, and there should be social media buttons on the full
image display to allow users to share the image on Twitter/X, Facebook, and Instagram.

* The UI source code should be in Typescript using React
* The app should be runnable from a plain web host, and the app should be stateless apart from data stored in users'
  browsers (cookies, localstorage, etc.)
* The website should be reactive and work both on desktop and mobile devices
* The code should be compressed for distribution to improve performance on slow devices
```

### Pre-development

From the initial prompt, Kiro generated a requirements document.

Since I forgot about the overhead of scanning 1000's of images for EXIF data, I later had to add a manual **Requirement 0**
for a tool to generate an SQLite database from a folder with the data in it.

After reading the proposed design document I was mostly happy, but since I don't care about focal length and camera
types, and I do care about any optional additional GPS data, I updated the design to not store that information.
Finally, I renamed the app from "geo-image-map-browser" to "spyro-map".

Whenever I edited Kiro's initial drafts of a file, I told Kiro about it in the interactive chat. Not certain that is
important, but in earlier work, Kiro seemed to get confused if I edited fields without saying so. It's possible this is
what the "Refine" and "Update tasks" buttons do.

From the modified design, Kiro generated a task list. I skimmed it with less enthusiasm than the previous two, because
at this point I had spent about an hour doing my least favorite thing, _documentation_, and I was keen to get to the
coding. At a glance, the tasks looked fine, although less granular than I expected. I proceeded running the tasks.

### Code generation

During this step, I began running the code generation steps.

#### Create Python EXIF extraction script

During the running, Kiro asks for permission to run a few
commands. While you can grant general trust, I chose to OK each individual command to forestall a `sudo rm -rf /`
scenario. The result was a single Python script, [`extract_exif.py`](./extract_exif.py) that looked reasonably clear at
a glance. Additionally, it created a Python requirements file and some documentation. The latter I moved into this
readme file [below](#exif-extraction-script).

The first step was to run the script on a folder, and it looks like it works, despite some issues. Mainly that it stores
everything inside the scanned folder. As a nice surprise, it pre-generates thumbnails, which is another thing I should
have thought of in the requirements.

I told Kiro to update the requirements for the "extract_exif.py" tool:

- When the script scans a folder it should first create a new folder (if it doesn't exist) in the web application root
  folder called "images", and a sub-folder in images called "thumbnails"
- When the script runs, it should create the SQLite data base in the web application root folder.
- Any file that contains GPS information should be scaled so it isn't larger than 2048 by 2048 pixels while preserving
  aspect ratio, and the new file should be saved in the "images" folder with the same name as its id in the sqlite
  database.
- For any file with GPS data that is processed, its thumbnail should be saved in "images/thumbnails" with the same name
  as its id in the sqlite database.

Another generation step, and the updates were implemented. Next I noticed that there was no reason to store image paths
in the SQLite database since we rename the scaled images to a hash of the original[^1].

[^1]: This is a cool detail, because it allows us to skip regeneration if we add more images to a folder and re-scan it. It also eliminates duplicate images.

#### Set up React TypeScript project structure

This task was rough. Kiro ran a Vite project bootstrap command which nuked my `README` and `.gitignore` files[^2]. It
also asked questions about technology choices I wasn't super qualified to answer. After a little Googling, I could see
that it was something about the distribution bundling of the TypeScript code so I chose Typescript + SWC. That might
come back to haunt me later. Finally, it started a server, and I had to stop it manually to proceed with Kiro's
generation.

The generation was also rough, with Kiro generating invalid code, but then noticing it, and fixing the issues. It took a
couple of attempts before it was able to run `npm run dev`. The generator also dumps everything in the root folder
making a huge mess, but it seems to work.

[^2]: ... easily restored from Git.

#### Implement database service layer

This created some utilities for reading from SQLite, but it's hard to tell if they will work at a glance, so I leave it
as-is for now, and proceed to the next tasks[^3].

[^3]: In retrospect, I should have noticed that the model had references to paths. That's going to hurt me in the next step.

#### Create Google Maps integration

I was excited to see how this one panned out. Kiro struggled for a long time with it, and in the end generated some code
along with some documentation in a file called `google-maps-setup.md` that I merged into this README [below](#google-maps-integration-setup).

The instructions for generating an API key are wrong, but I was able to generate one anyway and put it in new `.env`
file. However when starting the DEV server, the app seems to be having trouble reading the database, apparently because
it still assumes the database to have a path column for the files. I will need to fix that.

While explaining the issue to Kiro, I realize that files might potentially have differing file endings, so I also need
to update the Python import tool to convert all photos to JPEG.

<!-- TODO: convert all images to JPG during scaling -->

During the process, Kiro decided to move the image folder and the database into a sub-folder called "public" which I
went along with.

To my immense surprise, the app now starts and shows a map with image locations, even grouping images that were taken
close to each other. The only downside seems to be that the thumbnails are displayed as blank circles for now, instead of
using the thumbnail image.

There is however, an ominous warning in the console, indicating that the code is not up to spec with the latest API.

> As of February 21st, 2024, google.maps.Marker is deprecated. Please use google.maps.marker.AdvancedMarkerElement
> instead. At this time, google.maps.Marker is not scheduled to be discontinued, but
> google.maps.marker.AdvancedMarkerElement is recommended over google.maps.Marker.

This, and a subsequent warning was easily fixed by asking Kiro to update the code appropriately.

#### Build image modal and lightbox functionality

The generation step looked smoother this time, and the app can run without errors. Clicking a map thumbnail correctly
displays the larger image, but the metadata on the image looks broken.

> **Photo taken on Invalid Date**<br/>
> Invalid Date<br/>
> Altitude: 45m<br/>
> 55.646103, 12.614439

Still, very close to the goal. I'm going to leave it for now and move on to the next task.

#### Implement nearby image navigation

This task ran without a hitch, but only partially implemented the feature. The 1k nearby logic was already in place, and
it is now possible to navigate between images in a group with the arrow keys and swiping on mobile devices. However,
there seems to be some graphics missing for showing an icon to close the lightbox and and for left- and right-arrows. On
closer inspection, it's because the images are stored as inline SVG in the `src\components\ImageModal.tsx` file, which
the browser doesn't support. I tell Kiro to replace them with generic icons from the Font Awesome package, and now it
looks right, at the expense of another 300k of fonts and code.

## EXIF Extraction Script

This Python script extracts GPS and EXIF metadata from images and creates an SQLite database for the geo-image map browser.

### Requirements

- Python 3.7+
- Pillow library for image processing

### Installation

```bash
pip install -r requirements.txt
```

### Usage

```bash
python extract_exif.py <path_to_image_folder>
```

Example:

```bash
python extract_exif.py ./photos
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

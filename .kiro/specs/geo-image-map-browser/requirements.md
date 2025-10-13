# Requirements Document

## Introduction

This feature creates a browser-based web application that displays geo-tagged images on an interactive map. Users can
browse images by location, view them in a modal lightbox, navigate between nearby images, and share them on social
media. The application is built as a stateless React/TypeScript web app that can be hosted on any static web server.

## Requirements

### Requirement 0

**User Story:** As a site administrator, I want a single-file Python script that I can run on a folder containing images
to generate an SQLite database containing the EXIF data for every image nested in that folder.

#### Acceptance Criteria

1. WHEN the tool is run with a local folder path as parameter THEN the tool will scan that folder for any nested image.
2. WHEN images with geo-location metadata are processed THEN the system SHALL all EXIF data
3. IF an image lacks geo-location metadata THEN it should be ignored for further processing
4. IF an image contains geo-location metadata THEN the system SHALL write all the EXIF data in the image, along with the
   path to the file relative to the root of the web-application to an SQLite database in the root of the web-application

### Requirement 1

**User Story:** As a user, I want to see geo-tagged images displayed as thumbnails on a map, so that I can explore
images by their geographic location.

#### Acceptance Criteria

1. WHEN the application loads THEN the system SHALL display a Google Maps interface
3. WHEN a list of images with GPS coordinates is available in the local SQLite database THEN the system SHALL display
   image thumbnails at their corresponding map locations
4. WHEN multiple images exist at similar coordinates THEN the system SHALL cluster them appropriately to avoid overlap
5. IF an image lacks geo-location metadata THEN the system SHALL exclude it from the map display

### Requirement 2

**User Story:** As a user, I want to click on image thumbnails to view the full-size image in a modal, so that I can see
the complete image without leaving the map context.

#### Acceptance Criteria

1. WHEN a user clicks on an image thumbnail THEN the system SHALL open a modal lightbox displaying the full-size image
2. WHEN the modal is open THEN the system SHALL provide a close button or escape key functionality
3. WHEN the modal is open THEN the system SHALL dim the background map interface
4. WHEN displaying the full image THEN the system SHALL maintain image aspect ratio and fit within viewport constraints
5. WHEN the modal is open THEN the system SHALL update the browser URL to reflect the current image

### Requirement 3

**User Story:** As a user, I want to navigate between nearby images using arrow buttons, so that I can browse related
images without returning to the map.

#### Acceptance Criteria

1. WHEN viewing an image in the modal THEN the system SHALL identify other images within 1 kilometer radius
2. WHEN nearby images exist THEN the system SHALL display left/right arrow navigation buttons
3. WHEN a user clicks navigation arrows THEN the system SHALL load the next/previous nearby image
4. WHEN navigating between images THEN the system SHALL update the browser URL accordingly
5. IF no nearby images exist THEN the system SHALL hide the navigation arrows
6. WHEN calculating distance THEN the system SHALL use the haversine formula for accurate geographic distance

### Requirement 4

**User Story:** As a user, I want to share images on social media platforms, so that I can share interesting discoveries
with my network.

#### Acceptance Criteria

1. WHEN viewing an image in the modal THEN the system SHALL display social media sharing buttons
2. WHEN a user clicks the Twitter/X button THEN the system SHALL open a Twitter share dialog with the image URL
3. WHEN a user clicks the Facebook button THEN the system SHALL open a Facebook share dialog with the image URL
4. WHEN a user clicks the Instagram button THEN the system SHALL provide appropriate sharing functionality
5. WHEN sharing THEN the system SHALL include the current image URL for direct access

### Requirement 5

**User Story:** As a developer, I want the application built with React and TypeScript, so that it provides type safety
and modern development practices.

#### Acceptance Criteria

1. WHEN developing the application THEN the system SHALL use React as the UI framework
2. WHEN writing code THEN the system SHALL use TypeScript for type safety
3. WHEN building components THEN the system SHALL follow React best practices and hooks patterns
4. WHEN managing state THEN the system SHALL use appropriate React state management approaches
5. WHEN handling async operations THEN the system SHALL use proper TypeScript typing

### Requirement 6

**User Story:** As a user, I want the application to work on both desktop and mobile devices, so that I can browse
images regardless of my device.

#### Acceptance Criteria

1. WHEN accessing the application on mobile THEN the system SHALL provide touch-friendly interface elements
2. WHEN viewing on different screen sizes THEN the system SHALL adapt the layout responsively
3. WHEN using touch gestures THEN the system SHALL support pinch-to-zoom and pan on the map
4. WHEN viewing modals on mobile THEN the system SHALL optimize the display for smaller screens
5. WHEN navigating on mobile THEN the system SHALL provide appropriate touch targets for buttons

### Requirement 7

**User Story:** As a site administrator, I want the application to be deployable to any static web host, so that hosting
and deployment are simple and cost-effective.

#### Acceptance Criteria

1. WHEN building the application THEN the system SHALL generate static files suitable for web hosting
2. WHEN deployed THEN the system SHALL not require server-side processing or databases, apart from the SQLite database
   in the web app root folder
3. WHEN storing data at run time THEN the system SHALL only use client-side storage (localStorage, cookies)
4. WHEN routing THEN the system SHALL use client-side routing compatible with static hosting
5. WHEN accessing images THEN the system SHALL read from a local folder structure accessible via HTTP

### Requirement 8

**User Story:** As a user on a slow connection, I want the application to load quickly, so that I can use it effectively
even with limited bandwidth.

#### Acceptance Criteria

1. WHEN building for production THEN the system SHALL compress and minify all JavaScript and CSS files
2. WHEN loading images THEN the system SHALL generate and use optimized thumbnails for map display
3. WHEN bundling code THEN the system SHALL implement code splitting for optimal loading
4. WHEN serving assets THEN the system SHALL enable appropriate caching headers
5. WHEN loading the initial view THEN the system SHALL prioritize critical rendering path optimization

### Requirement 9

**User Story:** As a user, I want each image to have a unique URL, so that I can bookmark, share, or directly access
specific images.

#### Acceptance Criteria

1. WHEN viewing an image THEN the system SHALL update the browser URL with a unique identifier
2. WHEN accessing a direct image URL THEN the system SHALL load the map and open the specified image
3. WHEN navigating between images THEN the system SHALL update the URL without page refresh
4. WHEN sharing URLs THEN the system SHALL ensure they remain valid and accessible
5. WHEN handling invalid URLs THEN the system SHALL gracefully redirect to the main map view
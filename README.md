# Spyro Map

This is a browser-based web application that displays geo-tagged images on an interactive map. Users can browse images
by location, view them in a modal lightbox, navigate between nearby images, and share them on social media. The
application is built as a stateless React/TypeScript web app that can be hosted on any static web server.

This app was created by an old-fashioned developer using the dreaded vibe coding. It's a form physical log of my
experiment. This app was created with [Kiro](https://kiro.dev/) using this initial prompt below. It is not my first
attempt at creating a full app with Kiro, but it was the first _partially_ successful.

## Initial prompt

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

## Pre-development

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

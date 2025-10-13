# Spyro Map

This app was created with [Kiro](https://kiro.dev/) using this initial prompt:

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
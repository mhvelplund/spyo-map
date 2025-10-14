# Deployment Guide

This guide covers how to deploy the Spyro Map application to various static hosting providers.

## Prerequisites

1. **Environment Variables**: Set up your Google Maps API key
   ```bash
   cp .env.example .env
   # Edit .env and add your Google Maps API key
   ```

2. **Image Database**: Generate the SQLite database with image metadata
   ```bash
   python extract_exif.py public/images
   ```

3. **Validation**: Validate your deployment setup
   ```bash
   npm run deploy:validate
   ```

## Deployment Options

### 1. Netlify

**Automatic Deployment:**
1. Connect your repository to Netlify
2. Netlify will automatically use the `netlify.toml` configuration
3. Set environment variable: `VITE_GOOGLE_MAPS_API_KEY`

**Manual Deployment:**
```bash
npm run build:production
# Upload the dist/ folder to Netlify
```

### 2. Vercel

**Automatic Deployment:**
1. Connect your repository to Vercel
2. Vercel will automatically use the `vercel.json` configuration
3. Set environment variable: `VITE_GOOGLE_MAPS_API_KEY`

**Manual Deployment:**
```bash
npm run build:production
vercel --prod
```

### 3. GitHub Pages

**Automatic Deployment:**
1. Enable GitHub Pages in repository settings
2. Set up the `VITE_GOOGLE_MAPS_API_KEY` secret in repository settings
3. Push to main branch - GitHub Actions will handle deployment

**Manual Deployment:**
```bash
npm install -g gh-pages
npm run build:github
gh-pages -d dist
```

### 4. Generic Static Hosting

For any static hosting provider (Apache, Nginx, AWS S3, etc.):

```bash
npm run build:production
# Upload the contents of dist/ to your web server
```

## Post-Deployment Configuration

### Client-Side Routing

The application uses client-side routing. Ensure your hosting provider is configured to serve `index.html` for all routes:

**Apache (.htaccess):**
```apache
RewriteEngine On
RewriteRule ^(?!.*\.).*$ /index.html [L]
```

**Nginx:**
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

### Caching Headers

Configure appropriate caching headers for optimal performance:

- **Static assets** (`/assets/*`): 1 year cache
- **Images** (`/images/*`): 1 day cache  
- **Database** (`/images.db`): 1 hour cache
- **HTML files**: No cache or short cache

## File Structure

After deployment, your hosting directory should contain:

```
/
├── index.html                 # Main HTML file
├── assets/                    # Built JS/CSS assets
│   ├── css/
│   └── js/
├── images/                    # Image files
│   ├── thumbnails/
│   └── [image files]
├── images.db                  # SQLite database
└── vite.svg                   # Favicon
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps JavaScript API key | Yes |

## Troubleshooting

### Common Issues

1. **Blank page after deployment**
   - Check browser console for errors
   - Verify Google Maps API key is set correctly
   - Ensure client-side routing is configured

2. **Images not loading**
   - Verify `images/` directory was copied to deployment
   - Check file permissions on hosting server

3. **Database not found**
   - Ensure `images.db` exists in the root of deployment
   - Run `python extract_exif.py public/images` before building

4. **Google Maps not loading**
   - Verify API key is valid and has JavaScript Maps API enabled
   - Check API key restrictions match your domain

### Performance Optimization

1. **Enable compression** (gzip/brotli) on your hosting provider
2. **Configure CDN** for faster global delivery
3. **Monitor bundle size** with `npm run build` warnings
4. **Optimize images** in the `public/images` directory

## Security Considerations

1. **API Key Restrictions**: Restrict your Google Maps API key to your domain
2. **HTTPS**: Always serve over HTTPS in production
3. **Content Security Policy**: Consider implementing CSP headers
4. **CORS**: Ensure proper CORS configuration if serving from subdomain

## Monitoring

After deployment, monitor:
- **Loading performance** with browser dev tools
- **API usage** in Google Cloud Console
- **Error rates** in hosting provider analytics
- **User experience** across different devices and browsers
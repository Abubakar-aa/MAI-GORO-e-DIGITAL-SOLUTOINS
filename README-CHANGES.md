# Mai Goro — Version 2 improvements

## Completed

- Converted and optimized local raster images to WebP.
- Removed the original heavy JPG/PNG/JFIF assets from the deployment package.
- Replaced external Unsplash background images with local optimized assets.
- Added lazy loading and async decoding to below-the-fold images.
- Standardized the logo to WebP.
- Added SEO metadata, canonical URLs and Open Graph metadata.
- Added a real H1 and introductory section to the Services page.
- Added `robots.txt` and `sitemap.xml`.
- Added LocalBusiness structured data on the homepage.
- Replaced the `mailto:` contact form with a Netlify Forms-compatible form.
- Added a thank-you page after successful form submission.
- Improved slideshow behavior for reduced-motion users and hidden browser tabs.
- Added a small set of CSS tokens and page-specific improvements.
- Connected the homepage opportunities section to the Supabase-managed admin slides.
- Added a public slider loader at `js/mg-slider.js` and configuration at `js/slider-config.js`.

## Deployment note

For the contact form to work, deploy this folder to Netlify. Netlify should detect the form named `contact` during deployment.

If the site domain changes, update:

- canonical URLs
- sitemap.xml
- structured data URL

## Admin panel connection

The admin login is available at `mai-goro-admin-panel/admin/login.html`, and the homepage reads published slides from the same Supabase project.

Before deployment, replace the two placeholders in both files with the same Supabase project URL and anon public key:

- `js/slider-config.js`
- `mai-goro-admin-panel/admin/js/config.js`

Create the Supabase tables, storage bucket, policies, and admin user by following `mai-goro-admin-panel/README-SETUP.md`. The site intentionally shows a friendly empty state until real credentials are configured.

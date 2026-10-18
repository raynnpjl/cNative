# cNative

cNative is a Stremio addon for discovering Chinese TV dramas, with metadata from TMDB. Build your own catalogs with genre, rating and sorting filters, and choose Simplified Chinese or English separately for titles, descriptions and episode names.

It provides catalogs and metadata only.

## Run locally

Requires **Node.js 22 (22.12 or later)**, npm, and a [TMDB API key](https://www.themoviedb.org/settings/api).

1. From the project folder, install dependencies and create your local settings file:

   ```sh
   npm ci
   cp .env.example .env
   ```

2. Generate an encryption key:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

   Paste the output after `CONFIG_ENCRYPTION_KEY=` in `.env`. Keep this key private and unchanged across restarts so your installation links keep working.

3. Build and start:

   ```sh
   npm run build
   npm start
   ```

4. Open [http://127.0.0.1:7000/configure](http://127.0.0.1:7000/configure). Enter your TMDB API key in **Setup** and click **Save API key**. Choose your catalogs, click **Save configuration**, then **Install in Stremio**.

Keep your personal installation link private; it grants access to your addon configuration.

For development, use `npm run dev` instead of the build/start commands and open [http://127.0.0.1:5173/configure](http://127.0.0.1:5173/configure).

---

This product uses the TMDB API but is not endorsed or certified by TMDB.

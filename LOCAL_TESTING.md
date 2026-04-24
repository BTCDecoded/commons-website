# Local Testing Guide for Orange Paper Viewer

## Quick Start

From the **`commons-website`** directory (the folder that contains `index.html`, **not** the `btc-commons` repo root):

```bash
cd /path/to/commons-website
python3 -m http.server 8080 --bind 127.0.0.1
```

Or use the helper script (defaults to port **8890**):

```bash
cd /path/to/commons-website
chmod +x serve-preview.sh
./serve-preview.sh
```

Then open in browser:

- **Home / landing**: http://127.0.0.1:8890/index.html (or your chosen port; `index2.html` redirects here)
- **Production viewer**: http://127.0.0.1:8080/orange-paper.html
- **Local test page**: http://127.0.0.1:8080/test-local.html

Use **`127.0.0.1`** instead of `localhost` if your system resolves `localhost` oddly. **`--bind 127.0.0.1`** avoids some “connection refused” cases on `0.0.0.0` vs IPv6.

If you see **`Address already in use`**, pick another port: `python3 -m http.server 8891 --bind 127.0.0.1` or `./serve-preview.sh 8891`.


## Testing Methods

### Method 1: Test with GitHub Source (Requires Internet)

1. Start HTTP server (see above)
2. Open http://localhost:8080/orange-paper.html
3. The page will automatically fetch from GitHub

### Method 2: Test with Local File

1. Copy `blvm-spec/THE_ORANGE_PAPER.md` to `commons-website/`
2. Start HTTP server
3. Open http://localhost:8080/test-local.html
4. Select "From local file"
5. Choose the local `THE_ORANGE_PAPER.md` file
6. Click "Load Orange Paper"

### Method 3: Direct File Access (Limited)

You can open `orange-paper.html` directly in a browser, but:
- ❌ CORS will block fetching from GitHub
- ✅ Use `test-local.html` with local file option instead

## What to Test

### ✅ Mermaid Diagrams
- Check that all 9 diagrams render correctly
- Verify flowchart styling
- Check sequence diagram rendering

### ✅ LaTeX Math
- Verify inline math: `$formula$`
- Verify block math: `$$formula$$`
- Check complex formulas render properly

### ✅ Markdown Formatting
- Headings (h1-h4)
- Lists (ordered and unordered)
- Code blocks
- Tables
- Links

### ✅ Styling
- Dark mode support
- Responsive design (resize browser)
- Typography
- Spacing

### ✅ Navigation
- Back to home link
- Top link
- GitHub link

## Troubleshooting

### CORS Errors
- **Problem**: Browser blocks GitHub fetch
- **Solution**: Use HTTP server (not file://)

### Mermaid Not Rendering
- Check browser console for errors
- Verify Mermaid.js loaded (check Network tab)
- Try refreshing page

### Math Not Rendering
- Check browser console for MathJax errors
- Verify MathJax loaded (check Network tab)
- Wait a few seconds for MathJax to initialize

### File Not Loading
- Check file path is correct
- Verify file exists
- Check browser console for errors

## Browser Compatibility

Tested in:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari

Requires:
- Modern browser with ES6+ support
- JavaScript enabled
- Internet connection (for GitHub fetch)

## Development Tips

1. **Use Browser DevTools**: Check console for errors
2. **Network Tab**: Verify all CDN resources load
3. **Elements Tab**: Inspect rendered HTML
4. **Console**: Check for JavaScript errors

## Next Steps

After local testing:
1. Commit changes to commons-website
2. Push to GitHub
3. GitHub Pages will auto-deploy
4. Test on live site: https://thebitcoincommons.org/orange-paper.html

/**
 * Shared markdown viewer for thebitcoincommons.org.
 * Each page sets window.BTCC_SPEC_VIEWER before including this script.
 * Default source: same-origin /assets/spec/ (synced from BTCDecoded/blvm-spec at build).
 * Optional cfg.rawBase for GitHub raw URLs (e.g. governance compact).
 */
(function () {
    'use strict';

    const cfg = window.BTCC_SPEC_VIEWER || {};
    const fileName = cfg.fileName || 'THE_ORANGE_PAPER.md';
    if (!/^[A-Za-z0-9._-]+\.md$/.test(fileName)) {
        console.error('Invalid spec file name:', fileName);
        return;
    }

    var DEFAULT_RAW_BASE = '/assets/spec/';
    var DEFAULT_BLOB_BASE = 'https://github.com/BTCDecoded/blvm-spec/blob/main/';

    function normalizeRawBase(base) {
        var b = base || DEFAULT_RAW_BASE;
        return b.replace(/\/?$/, '/');
    }

    function isBundledSpecBase(base) {
        return base.charAt(0) === '/';
    }

    function blobBaseFromRawBase(rawBase) {
        if (cfg.blobBase) {
            return cfg.blobBase;
        }
        var m = rawBase.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
        if (m) {
            return 'https://github.com/' + m[1] + '/' + m[2] + '/blob/' + m[3] + '/';
        }
        return DEFAULT_BLOB_BASE;
    }

    var rawBase = normalizeRawBase(cfg.rawBase);
    var BLOB_BASE = blobBaseFromRawBase(rawBase);
    var SPEC_URL = rawBase + fileName;
    var bundledSpecBase = isBundledSpecBase(rawBase);
    var bundledManifestUrl = bundledSpecBase
        ? rawBase.replace(/\/?$/, '/') + 'manifest.json'
        : '';

    /** Orange Paper section refs (§5.3.1) → PROTOCOL.md / ARCHITECTURE.md anchors; see section-link-map.json */
    var sectionLinkMap = null;
    var sectionLinkMapPromise = null;

    function loadSectionLinkMap() {
        if (sectionLinkMap) {
            return Promise.resolve(sectionLinkMap);
        }
        if (sectionLinkMapPromise) {
            return sectionLinkMapPromise;
        }
        sectionLinkMapPromise = fetch('section-link-map.json?v=1', { credentials: 'omit' })
            .then(function (res) {
                return res.ok ? res.json() : null;
            })
            .then(function (data) {
                sectionLinkMap = data;
                return data;
            })
            .catch(function (err) {
                console.warn('BTCC spec: section-link-map.json unavailable', err);
                return null;
            });
        return sectionLinkMapPromise;
    }

    function resolveSectionEntry(sectionNum) {
        if (!sectionLinkMap || !sectionLinkMap.sections) {
            return null;
        }
        var sections = sectionLinkMap.sections;
        if (sections[sectionNum]) {
            return sections[sectionNum];
        }
        var dot = sectionNum.lastIndexOf('.');
        if (dot === -1) {
            return null;
        }
        return resolveSectionEntry(sectionNum.slice(0, dot));
    }

    /** Link bare §5.3.1 refs in CONSENSUS_SPEC (skips code spans and existing markdown links). */
    function linkifySectionReferences(md) {
        if (fileName !== 'CONSENSUS_SPEC.md' || !sectionLinkMap || !sectionLinkMap.sections) {
            return md;
        }
        var out = [];
        var i = 0;
        var n = md.length;
        while (i < n) {
            var ch = md[i];
            if (ch === '`') {
                var j = md.indexOf('`', i + 1);
                if (j === -1) {
                    out.push(md.slice(i));
                    break;
                }
                out.push(md.slice(i, j + 1));
                i = j + 1;
                continue;
            }
            if (ch === '[') {
                var linkMatch = md.slice(i).match(/^\[[^\]]*\]\([^)]*\)/);
                if (linkMatch) {
                    out.push(linkMatch[0]);
                    i += linkMatch[0].length;
                    continue;
                }
            }
            var secMatch = md.slice(i).match(/^§(\d+(?:\.\d+)*)/);
            if (secMatch) {
                var entry = resolveSectionEntry(secMatch[1]);
                if (entry) {
                    out.push('[§' + secMatch[1] + '](' + entry.file + '#' + entry.id + ')');
                    i += secMatch[0].length;
                    continue;
                }
            }
            out.push(ch);
            i += 1;
        }
        return out.join('');
    }

    /**
     * Session-scoped cache for spec markdown. GitHub raw URLs do not expose ETag to
     * cross-origin fetch(), so for GitHub raw URLs we revalidate with a small GitHub API request
     * (latest commit touching this file on the same ref) and skip the large raw download when
     * that revision id is unchanged.
     */
    var CACHE_VERSION = 'BTCC_SPEC_SESSION_V6';
    var cacheNamespace = CACHE_VERSION + '::' + SPEC_URL;

    function parseGithubRawRef(rawBaseUrl) {
        var m = rawBaseUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/$/);
        if (!m) {
            return null;
        }
        return { owner: m[1], repo: m[2], ref: m[3] };
    }

    async function fetchGithubFileRevKey(owner, repo, ref, path) {
        var url =
            'https://api.github.com/repos/' +
            encodeURIComponent(owner) +
            '/' +
            encodeURIComponent(repo) +
            '/commits?sha=' +
            encodeURIComponent(ref) +
            '&path=' +
            encodeURIComponent(path) +
            '&per_page=1';
        var res = await fetch(url, {
            credentials: 'omit',
            headers: { Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) {
            return '';
        }
        var data = await res.json();
        if (!data || !data.length || !data[0].sha) {
            return '';
        }
        return data[0].sha;
    }

    async function fetchBundledSpecRevKey() {
        if (!bundledManifestUrl) {
            return '';
        }
        var res = await fetch(bundledManifestUrl, { credentials: 'omit' });
        if (!res.ok) {
            return '';
        }
        var data = await res.json();
        return (data && data.rev) || '';
    }

    function readSessionCache() {
        if (cfg.cache === false) {
            return null;
        }
        try {
            var metaRaw = sessionStorage.getItem(cacheNamespace + '::meta');
            var body = sessionStorage.getItem(cacheNamespace + '::body');
            if (!metaRaw || !body) {
                return null;
            }
            var meta = JSON.parse(metaRaw);
            return {
                markdown: body,
                preHtml: sessionStorage.getItem(cacheNamespace + '::html') || '',
                revKey: meta.revKey || '',
                etag: meta.etag || '',
                lastModified: meta.lastModified || ''
            };
        } catch (e) {
            return null;
        }
    }

    function writeSessionCache(markdown, response, revKey) {
        if (cfg.cache === false) {
            return;
        }
        try {
            var etag = '';
            var lastModified = '';
            if (response) {
                etag = response.headers.get('ETag') || response.headers.get('etag') || '';
                lastModified = response.headers.get('Last-Modified') || response.headers.get('last-modified') || '';
            }
            sessionStorage.setItem(
                cacheNamespace + '::meta',
                JSON.stringify({
                    revKey: revKey || '',
                    etag: etag,
                    lastModified: lastModified
                })
            );
            sessionStorage.setItem(cacheNamespace + '::body', markdown);
        } catch (e) {
            if (e && e.name === 'QuotaExceededError') {
                try {
                    sessionStorage.removeItem(cacheNamespace + '::meta');
                    sessionStorage.removeItem(cacheNamespace + '::body');
                    sessionStorage.removeItem(cacheNamespace + '::html');
                } catch (ignore) {}
            }
            console.warn('BTCC spec session cache:', e);
        }
    }

    function writeSessionRenderedHtml(html) {
        if (cfg.cache === false || !html) {
            return;
        }
        try {
            sessionStorage.setItem(cacheNamespace + '::html', html);
        } catch (e) {
            if (e && e.name === 'QuotaExceededError') {
                try {
                    sessionStorage.removeItem(cacheNamespace + '::html');
                } catch (ignore) {}
            }
            console.warn('BTCC spec session cache (html):', e);
        }
    }

    /**
     * Lines that contain both inline $...$ math and [text](#hash) links often fail to
     * produce <a> in marked (e.g. PROTOCOL §4.1 to §4.4). Replace hash-only MD links on those
     * lines with HTML comments, then substitute <a> after marked.parse.
     */
    function expandInlineHashMdLinksForMathLines(markdown, linkPlaceholders) {
        var lines = markdown.split(/\r?\n/);
        return lines
            .map(function (line) {
                if (/^\|/.test(line)) {
                    return line;
                }
                if (!/\$/.test(line) || !/\[[^\]]+\]\(#[^)]+\)/.test(line)) {
                    return line;
                }
                return line.replace(/\[([^\]]+)\]\((#[a-zA-Z0-9._-]+)\)/g, function (m, text, hash) {
                    var id = linkPlaceholders.length;
                    var safe = String(text)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    linkPlaceholders.push('<a href="' + hash + '">' + safe + '</a>');
                    return '<!--btcc-link-' + id + '-->';
                });
            })
            .join('\n');
    }

    /** Markdown → HTML (marked + math mask + mermaid placeholders); no DOM. */
    function markdownToHtml(markdown) {
        var mermaidDiagrams = [];
        var mermaidIndex = 0;

        markdown = markdown.replace(/```\s*mermaid\s*\n([\s\S]*?)```/g, function (match, diagram) {
            var trimmedDiagram = diagram.trim();

            var invalidPatterns = [
                /Template includes:/i,
                /Previous block has/i,
                /^\s*-\s+[A-Z][a-z]/m,
                /includes:\s*$/m
            ];

            if (invalidPatterns.some(function (pattern) { return pattern.test(trimmedDiagram); })) {
                return match;
            }

            var mermaidPatterns = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitgraph|journey|requirement|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|mindmap|timeline|quadrantChart|sankey)/m;

            if (!mermaidPatterns.test(trimmedDiagram)) {
                return match;
            }

            if (trimmedDiagram.startsWith('sequenceDiagram')) {
                var firstLines = trimmedDiagram.split('\n').slice(0, 10).join('\n');
                if (!/participant|actor|note|activate|deactivate|loop|alt|opt|par|critical|break|rect/i.test(firstLines)) {
                    return match;
                }
            }

            var placeholder = 'MERMAID_PLACEHOLDER_' + mermaidIndex;
            mermaidDiagrams.push(trimmedDiagram);
            mermaidIndex++;
            return placeholder;
        });

        var inlineHashLinkHtml = [];
        markdown = expandInlineHashMdLinksForMathLines(markdown, inlineHashLinkHtml);

        var texMasked = maskTexMath(markdown);
        markdown = texMasked.masked;
        var texChunks = texMasked.chunks;

        markdown = linkifySectionReferences(markdown);

        marked.setOptions({
            breaks: true,
            gfm: true
        });

        var html = marked.parse(markdown);
        html = unmaskTexMath(html, texChunks);

        inlineHashLinkHtml.forEach(function (anchorHtml, id) {
            html = html.split('<!--btcc-link-' + id + '-->').join(anchorHtml);
        });

        mermaidDiagrams.forEach(function (diagram, index) {
            var processedDiagram = diagram.replace(/fill:#ffcdd2/g, 'fill:#c62828');
            processedDiagram = processedDiagram.replace(/fill:#c8e6c9/g, 'fill:#388e3c');
            processedDiagram = processedDiagram.replace(/style\s+(\w+)\s+fill:#ffcdd2/g, 'style $1 fill:#c62828');
            processedDiagram = processedDiagram.replace(/style\s+(\w+)\s+fill:#c8e6c9/g, 'style $1 fill:#388e3c');
            html = html.replace('MERMAID_PLACEHOLDER_' + index, '<div class="mermaid" data-diagram-index="' + index + '">' + processedDiagram + '</div>');
        });

        html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, function (match, diagram) {
            return '<div class="mermaid">' + diagram.trim() + '</div>';
        });

        return html;
    }

    /** Marked v8+ removed headerIds; without IDs, #anchor TOC links do nothing. */
    var gfmHeadingApplied = false;
    var gfmHeadingWarned = false;
    function ensureGfmHeadingIds() {
        if (gfmHeadingApplied) {
            return;
        }
        if (typeof marked === 'undefined') {
            return;
        }
        if (typeof markedGfmHeadingId !== 'undefined' && markedGfmHeadingId.gfmHeadingId) {
            marked.use(markedGfmHeadingId.gfmHeadingId());
            gfmHeadingApplied = true;
        } else if (!gfmHeadingWarned) {
            gfmHeadingWarned = true;
            console.warn(
                'marked-gfm-heading-id not loaded (include it after marked.min.js); heading anchors will not work.'
            );
        }
    }

    function scrollToHash() {
        var hash = window.location.hash;
        if (!hash || hash === '#') {
            return;
        }
        var id = decodeURIComponent(hash.slice(1));
        if (!id) {
            return;
        }
        var el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    }

    /**
     * Marked/GFM parses _ as emphasis. TeX subscripts like \\mathbb{N}_{8} become
     * \\mathbb{N}<em>{8}, which breaks MathJax. Protect $...$ and $$...$$ outside
     * fenced code blocks, then restore after marked.parse.
     */
    function maskTexMath(src) {
        var chunks = [];
        var i = 0;
        var out = '';
        var inFence = false;

        function lineStartsWithCodeFence(pos) {
            var j = pos;
            while (j < src.length && (src[j] === ' ' || src[j] === '\t')) {
                j++;
            }
            return j + 2 < src.length && src.slice(j, j + 3) === '```';
        }

        while (i < src.length) {
            var atLineStart = i === 0 || src[i - 1] === '\n' || src[i - 1] === '\r';
            if (atLineStart && lineStartsWithCodeFence(i)) {
                inFence = !inFence;
                while (i < src.length && src[i] !== '\n' && src[i] !== '\r') {
                    out += src[i++];
                }
                if (i < src.length) {
                    if (src[i] === '\r') {
                        out += '\r';
                        i++;
                    }
                    if (i < src.length && src[i] === '\n') {
                        out += '\n';
                        i++;
                    }
                }
                continue;
            }

            if (inFence) {
                out += src[i++];
                continue;
            }

            if (src[i] === '\\' && src[i + 1] === '$') {
                out += '\\$';
                i += 2;
                continue;
            }

            if (src[i] === '$' && src[i + 1] === '$') {
                var endBlock = src.indexOf('$$', i + 2);
                if (endBlock === -1) {
                    out += src.slice(i);
                    break;
                }
                chunks.push(src.slice(i, endBlock + 2));
                out += '<!--BTCC-TEX-' + (chunks.length - 1) + '-->';
                i = endBlock + 2;
                continue;
            }

            if (src[i] === '$') {
                var endIn = src.indexOf('$', i + 1);
                while (endIn !== -1 && src[endIn - 1] === '\\') {
                    endIn = src.indexOf('$', endIn + 1);
                }
                if (endIn === -1) {
                    out += src[i];
                    i++;
                    continue;
                }
                chunks.push(src.slice(i, endIn + 1));
                out += '<!--BTCC-TEX-' + (chunks.length - 1) + '-->';
                i = endIn + 1;
                continue;
            }

            out += src[i];
            i++;
        }
        return { masked: out, chunks: chunks };
    }

    function unmaskTexMath(htmlStr, chunks) {
        chunks.forEach(function (chunk, idx) {
            var replacement = chunk;
            var trimmed = chunk.trim();
            if (/^\$\$[\s\S]*\$\$/.test(trimmed)) {
                replacement = '<div class="spec-display-math">' + trimmed + '</div>';
            }
            htmlStr = htmlStr.split('<!--BTCC-TEX-' + idx + '-->').join(replacement);
        });
        return htmlStr;
    }

    function rewriteSpecLinks(root) {
        root.querySelectorAll('a[href]').forEach(function (a) {
            var href = a.getAttribute('href') || '';
            if (!href || href.startsWith('#')) {
                return;
            }
            if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
                return;
            }

            var hashIdx = href.indexOf('#');
            var pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
            var hash = hashIdx >= 0 ? href.slice(hashIdx) : '';

            var path = pathPart.replace(/^\.\//, '');

            var toHtml = {
                'CONSENSUS_SPEC.md': 'spec.html',
                'consensus_spec.md': 'spec.html',
                'PROTOCOL.md': 'protocol.html',
                'protocol.md': 'protocol.html',
                'ARCHITECTURE.md': 'architecture.html',
                'architecture.md': 'architecture.html',
                'THE_ORANGE_PAPER.md': 'orange-paper.html',
                'the_orange_paper.md': 'orange-paper.html'
            };

            if (toHtml[path]) {
                a.setAttribute('href', toHtml[path] + hash);
                return;
            }

            if (path === 'GOVERNANCE_SPECIFICATION.md') {
                a.setAttribute('href', 'https://github.com/BTCDecoded/blvm-spec/blob/main/GOVERNANCE_SPECIFICATION.md' + hash);
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
                return;
            }

            if (path.startsWith('../blvm-node/')) {
                var rest = path.slice('../blvm-node/'.length);
                a.setAttribute('href', 'https://github.com/BTCDecoded/blvm-node/blob/main/' + rest + hash);
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
                return;
            }

            if (path.startsWith('../')) {
                var inRepo = path.replace(/^\.\.\/+/, '');
                a.setAttribute('href', BLOB_BASE + inRepo + hash);
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
                return;
            }

            if (/^[A-Za-z0-9._-]+\.md$/i.test(path)) {
                a.setAttribute('href', BLOB_BASE + path + hash);
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            }
        });
    }

    if (!window.__BTCC_SPEC_HASH_LISTENER__) {
        window.__BTCC_SPEC_HASH_LISTENER__ = true;
        window.addEventListener('hashchange', function () {
            scrollToHash();
        });
    }

    async function renderMarkdownPayload(markdown, prebuiltHtml) {
        var html = prebuiltHtml || '';
        if (!html) {
            html = markdownToHtml(markdown);
            writeSessionRenderedHtml(html);
        }

        document.getElementById('loading').style.display = 'none';
        var contentEl = document.getElementById('content');
        contentEl.innerHTML = html;
        contentEl.style.display = 'block';
        rewriteSpecLinks(contentEl);
        requestAnimationFrame(function () {
            requestAnimationFrame(scrollToHash);
        });

        if (cfg.skipHeavyRender) {
            return;
        }

        if (typeof mermaid !== 'undefined') {
            setTimeout(function () {
                var mermaidElements = document.querySelectorAll('.mermaid');
                if (mermaidElements.length > 0) {
                    mermaidElements.forEach(function (element, index) {
                        var originalContent = element.textContent;

                        if (/Template includes:|Previous block has|includes:\s*$/i.test(originalContent)) {
                            element.outerHTML = '<pre><code class="language-text">' + originalContent + '</code></pre>';
                            return;
                        }

                        mermaid.parse(originalContent).then(function () {
                            return mermaid.run({ nodes: [element] });
                        }).catch(function (err) {
                            console.warn('Mermaid diagram ' + (index + 1) + ' error:', err);
                            element.innerHTML =
                                '<div style="padding: 1rem; background: #ffebee; border: 1px solid #f44336; border-radius: 4px; color: #c62828;">' +
                                '<strong>Diagram error:</strong> ' + (err.message || err.str || 'Invalid Mermaid syntax') +
                                '<details style="margin-top: 0.5rem;"><summary style="cursor: pointer; font-size: 0.9em;">View diagram source</summary>' +
                                '<pre style="margin-top: 0.5rem; font-size: 0.85em; overflow-x: auto; white-space: pre-wrap;">' +
                                originalContent +
                                '</pre></details></div>';
                        });
                    });
                }
            }, 500);
        }

        if (window.MathJax) {
            MathJax.startup.promise.then(function () {
                return MathJax.typesetPromise();
            }).then(function () {
                scrollToHash();
            }).catch(function (err) {
                console.error('MathJax rendering error:', err);
            });
        } else {
            var checkMathJax = setInterval(function () {
                if (window.MathJax && window.MathJax.startup) {
                    clearInterval(checkMathJax);
                    MathJax.startup.promise.then(function () {
                        return MathJax.typesetPromise();
                    }).then(function () {
                        scrollToHash();
                    }).catch(function (err) {
                        console.error('MathJax rendering error:', err);
                    });
                }
            }, 100);
            setTimeout(function () { clearInterval(checkMathJax); }, 10000);
        }
    }

    async function loadSpecMarkdown() {
        try {
            ensureGfmHeadingIds();
            await loadSectionLinkMap();

            var gh = parseGithubRawRef(rawBase);
            var revKey = '';
            if (bundledSpecBase && cfg.cache !== false) {
                try {
                    revKey = await fetchBundledSpecRevKey();
                } catch (revErr) {
                    console.warn('BTCC spec: could not read bundled spec manifest', revErr);
                }
            } else if (gh && cfg.cache !== false) {
                try {
                    revKey = await fetchGithubFileRevKey(gh.owner, gh.repo, gh.ref, fileName);
                } catch (revErr) {
                    console.warn('BTCC spec: could not check GitHub revision', revErr);
                }
            }

            var cached = readSessionCache();

            var revMatches = !!(revKey && cached && cached.revKey === revKey);
            var useSessionWhenNoRev = !!(gh && cached && cached.markdown && !revKey);
            if (cached && cached.markdown && (revMatches || useSessionWhenNoRev)) {
                await renderMarkdownPayload(cached.markdown, cached.preHtml || '');
                return;
            }

            var fetchOpts = { credentials: 'omit' };
            if (cached && !revKey) {
                fetchOpts.headers = {};
                if (cached.etag) {
                    fetchOpts.headers['If-None-Match'] = cached.etag;
                } else if (cached.lastModified) {
                    fetchOpts.headers['If-Modified-Since'] = cached.lastModified;
                }
            }

            var response = await fetch(SPEC_URL, fetchOpts);

            if (response.status === 304 && cached && cached.markdown) {
                await renderMarkdownPayload(cached.markdown, cached.preHtml || '');
                return;
            }

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            var markdown = await response.text();
            writeSessionCache(markdown, response, revKey);

            await renderMarkdownPayload(markdown, '');
        } catch (error) {
            console.error('Error loading spec markdown:', error);
            var cachedFallback = readSessionCache();
            if (cachedFallback && cachedFallback.markdown) {
                console.warn('BTCC spec: network error; showing cached copy from this session.');
                try {
                    await renderMarkdownPayload(cachedFallback.markdown, cachedFallback.preHtml || '');
                    return;
                } catch (renderErr) {
                    console.error(renderErr);
                }
            }
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'block';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadSpecMarkdown);
    } else {
        loadSpecMarkdown();
    }
})();

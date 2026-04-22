/**
 * Shared markdown viewer for thebitcoincommons.org.
 * Each page sets window.BTCC_SPEC_VIEWER before including this script.
 * Default source: BTCDecoded/blvm-spec main. Optional cfg.rawBase for other repos (e.g. governance).
 */
(function () {
    'use strict';

    const cfg = window.BTCC_SPEC_VIEWER || {};
    const fileName = cfg.fileName || 'THE_ORANGE_PAPER.md';
    if (!/^[A-Za-z0-9._-]+\.md$/.test(fileName)) {
        console.error('Invalid spec file name:', fileName);
        return;
    }

    var DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/BTCDecoded/blvm-spec/main/';

    function normalizeRawBase(base) {
        var b = base || DEFAULT_RAW_BASE;
        return b.replace(/\/?$/, '/');
    }

    function blobBaseFromRawBase(rawBase) {
        var m = rawBase.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\//);
        if (m) {
            return 'https://github.com/' + m[1] + '/' + m[2] + '/blob/' + m[3] + '/';
        }
        return 'https://github.com/BTCDecoded/blvm-spec/blob/main/';
    }

    var rawBase = normalizeRawBase(cfg.rawBase);
    var BLOB_BASE = cfg.blobBase || blobBaseFromRawBase(rawBase);
    var SPEC_URL = rawBase + fileName;

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

    async function loadSpecMarkdown() {
        try {
            ensureGfmHeadingIds();

            var response = await fetch(SPEC_URL);

            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }

            var markdown = await response.text();

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

            var texMasked = maskTexMath(markdown);
            markdown = texMasked.masked;
            var texChunks = texMasked.chunks;

            marked.setOptions({
                breaks: true,
                gfm: true
            });

            var html = marked.parse(markdown);
            html = unmaskTexMath(html, texChunks);

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
        } catch (error) {
            console.error('Error loading spec markdown:', error);
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

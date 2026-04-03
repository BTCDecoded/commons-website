/**
 * Shared loader for blvm-spec markdown served on thebitcoincommons.org.
 * Each page sets window.BTCC_SPEC_VIEWER before including this script.
 */
(function () {
    'use strict';

    const cfg = window.BTCC_SPEC_VIEWER || {};
    const fileName = cfg.fileName || 'THE_ORANGE_PAPER.md';
    if (!/^[A-Za-z0-9._-]+\.md$/.test(fileName)) {
        console.error('Invalid spec file name:', fileName);
        return;
    }

    const RAW_BASE = 'https://raw.githubusercontent.com/BTCDecoded/blvm-spec/main/';
    const SPEC_URL = RAW_BASE + fileName;

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
                var inSpec = path.replace(/^\.\.\/+/, '');
                a.setAttribute('href', 'https://github.com/BTCDecoded/blvm-spec/blob/main/' + inSpec + hash);
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
            }
        });
    }

    async function loadSpecMarkdown() {
        try {
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

            marked.setOptions({
                breaks: true,
                gfm: true,
                headerIds: true,
                mangle: false
            });

            var html = marked.parse(markdown);

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
                }).catch(function (err) {
                    console.error('MathJax rendering error:', err);
                });
            } else {
                var checkMathJax = setInterval(function () {
                    if (window.MathJax && window.MathJax.startup) {
                        clearInterval(checkMathJax);
                        MathJax.startup.promise.then(function () {
                            return MathJax.typesetPromise();
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

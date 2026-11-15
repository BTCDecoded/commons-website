/**
 * Left rail for the specification readers.
 * Desktop: site links, document list, and heading contents stay on screen.
 * Narrow screens: the same list is a dropdown under the site header.
 */
(function () {
    'use strict';

    var DESKTOP = window.matchMedia('(min-width: 960px)');

    function pageFile() {
        var path = location.pathname.split('/').pop() || 'index.html';
        return path.split('?')[0];
    }

    function appendLinks(ul, anchors, markCurrent) {
        var here = pageFile();
        Array.prototype.forEach.call(anchors, function (a) {
            var href = a.getAttribute('href') || '';
            if (href === '#top') {
                return;
            }
            var li = document.createElement('li');
            var link = a.cloneNode(true);
            if (markCurrent) {
                var file = href.split('#')[0].split('/').pop();
                if (file === here) {
                    link.setAttribute('aria-current', 'page');
                }
            }
            li.appendChild(link);
            ul.appendChild(li);
        });
    }

    function section(labelText) {
        var label = document.createElement('p');
        label.className = 'spec-rail-label';
        label.textContent = labelText;
        return label;
    }

    function headingLabel(heading) {
        return (heading.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function headingBody(heading) {
        var parts = [headingLabel(heading)];
        var next = heading.nextElementSibling;
        while (next && !/^H[23]$/.test(next.tagName)) {
            parts.push(next.textContent || '');
            next = next.nextElementSibling;
        }
        return parts.join(' ').replace(/\s+/g, ' ').toLowerCase();
    }

    function fillContents(list, root) {
        list.replaceChildren();
        if (!root) {
            return 0;
        }
        var sectionId = '';
        var count = 0;
        var hasRule = false;
        Array.prototype.forEach.call(root.querySelectorAll('h2, h3'), function (heading) {
            if (!heading.id) {
                return;
            }
            if (heading.tagName === 'H2') {
                sectionId = heading.id;
            }
            if (/^[A-Z][A-Z0-9]*-\d+$/.test(headingLabel(heading))) {
                hasRule = true;
            }
            var li = document.createElement('li');
            li.className = heading.tagName === 'H3' ? 'spec-toc-h3' : 'spec-toc-h2';
            li.setAttribute('data-section', sectionId);
            li.setAttribute('data-text', headingBody(heading));
            var link = document.createElement('a');
            link.href = '#' + heading.id;
            link.textContent = headingLabel(heading);
            li.appendChild(link);
            list.appendChild(li);
            count += 1;
        });
        list.dataset.rules = hasRule ? '1' : '';
        return count;
    }

    function applyToc(list, find) {
        var query = (find.value || '').trim().toLowerCase();
        var filtering = query.length >= 2;
        var contents = list.closest('.spec-rail-contents');
        if (contents) {
            contents.classList.toggle('is-filtering', filtering);
        }
        var section = list.dataset.section || '';
        var items = Array.prototype.slice.call(list.children);
        items.forEach(function (li) {
            var text = li.getAttribute('data-text') || '';
            var matched = filtering && text.indexOf(query) !== -1;
            li.classList.toggle('is-match', matched);
            li.classList.toggle('is-open', !filtering && li.getAttribute('data-section') === section);
            li.classList.remove('has-match');
        });
        if (!filtering) {
            return;
        }
        var showAll = {};
        items.forEach(function (li) {
            if (li.classList.contains('spec-toc-h2') && li.classList.contains('is-match')) {
                showAll[li.getAttribute('data-section')] = true;
            }
        });
        items.forEach(function (li) {
            if (showAll[li.getAttribute('data-section')] && li.classList.contains('spec-toc-h3')) {
                li.classList.add('is-match');
            }
            if (li.classList.contains('spec-toc-h3') && li.classList.contains('is-match')) {
                var parent = list.querySelector('.spec-toc-h2[data-section="' + li.getAttribute('data-section') + '"]');
                if (parent) {
                    parent.classList.add('has-match');
                }
            }
        });
    }

    function track(root, list, find) {
        var ticking = false;
        function update() {
            ticking = false;
            var headings = Array.prototype.filter.call(root.querySelectorAll('h2, h3'), function (heading) {
                return heading.id;
            });
            if (!headings.length) {
                return;
            }
            var current = headings[0];
            headings.forEach(function (heading) {
                if (heading.getBoundingClientRect().top <= 96) {
                    current = heading;
                }
            });
            var sectionId = '';
            var index = headings.indexOf(current);
            var i;
            for (i = index; i >= 0; i -= 1) {
                if (headings[i].tagName === 'H2') {
                    sectionId = headings[i].id;
                    break;
                }
            }
            list.dataset.section = sectionId;
            var previous = list.querySelector('a.is-current');
            if (previous) {
                previous.classList.remove('is-current');
            }
            var link = list.querySelector('a[href="#' + CSS.escape(current.id) + '"]');
            if (link) {
                link.classList.add('is-current');
            }
            applyToc(list, find);
        }
        window.addEventListener('scroll', function () {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    function mount() {
        if (document.querySelector('.spec-shell')) {
            return;
        }
        var docNav = document.querySelector('.orange-paper-nav');
        var start = document.querySelector('.orange-paper-container') || document.querySelector('.spec-maps-hero');
        if (!docNav || !start) {
            return;
        }

        var rail = document.createElement('details');
        rail.className = 'spec-rail';
        var summary = document.createElement('summary');
        summary.textContent = 'Documents and contents';
        rail.appendChild(summary);
        var body = document.createElement('div');
        body.className = 'spec-rail-body';

        var siteLinks = document.querySelector('.site-nav .nav-inner > .nav-links');
        if (siteLinks) {
            var siteBlock = document.createElement('div');
            siteBlock.className = 'spec-rail-site';
            siteBlock.appendChild(section('Site'));
            var siteList = document.createElement('ul');
            appendLinks(siteList, siteLinks.querySelectorAll('a'), false);
            siteBlock.appendChild(siteList);
            body.appendChild(siteBlock);
        }

        body.appendChild(section('Documents'));
        var docList = document.createElement('ul');
        appendLinks(docList, docNav.querySelectorAll('a'), true);
        body.appendChild(docList);

        var contents = document.createElement('div');
        contents.className = 'spec-rail-contents';
        contents.hidden = true;
        contents.appendChild(section('On this page'));
        var find = document.createElement('input');
        find.className = 'spec-rail-find';
        find.type = 'search';
        find.placeholder = 'Find a section';
        find.setAttribute('aria-label', 'Find a section');
        find.addEventListener('input', function () {
            applyToc(toc, find);
        });
        contents.appendChild(find);
        var toc = document.createElement('ul');
        contents.appendChild(toc);
        body.appendChild(contents);
        rail.appendChild(body);

        var shell = document.createElement('div');
        shell.className = 'spec-shell';
        var main = document.createElement('div');
        main.className = 'spec-main';
        var node = start;
        var moved = [];
        while (node && node.tagName !== 'SCRIPT') {
            moved.push(node);
            node = node.nextSibling;
        }
        start.parentNode.insertBefore(shell, start);
        shell.appendChild(rail);
        shell.appendChild(main);
        moved.forEach(function (el) {
            main.appendChild(el);
        });

        document.body.classList.add('spec-rail-active');
        function syncOpen() {
            if (DESKTOP.matches) {
                rail.open = true;
            }
        }
        syncOpen();
        if (DESKTOP.addEventListener) {
            DESKTOP.addEventListener('change', syncOpen);
        }

        var content = document.getElementById('content');
        if (content) {
            var tracking = false;
            var observer = new MutationObserver(function () {
                var count = fillContents(toc, content);
                contents.hidden = count === 0;
                if (toc.dataset.rules) {
                    find.placeholder = 'Rule, section, or formula';
                    find.setAttribute('aria-label', 'Find a rule, section, or formula');
                }
                applyToc(toc, find);
                if (count && !tracking) {
                    tracking = true;
                    track(content, toc, find);
                }
            });
            observer.observe(content, { childList: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();

// ==UserScript==
// @name           ZenRoundedWebview
// @version        1.1
// @author         JustAdumbPrsn
// @description    Forces anti-aliasing on webview corners using clipping
// @compatibility  Zen Browser
// ==/UserScript==

(() => {
    const STYLE_ID = 'zen-rounded-webview-styles';

    // Prevent duplicate init when the script is loaded multiple times (e.g., Sine reload)
    if (window.__zenRoundedWebviewInit) return;
    window.__zenRoundedWebviewInit = true;

    // Generates a perfectly smooth vector rounded rectangle
    function roundRectPath(width, height, r) {
        // Prevent the radius from collapsing if the window gets extremely small
        r = Math.min(r, width / 2, height / 2);
        
        return `M 0,${r} ` +
               `A ${r},${r} 0 0 1 ${r},0 ` +
               `L ${width - r},0 ` +
               `A ${r},${r} 0 0 1 ${width},${r} ` +
               `L ${width},${height - r} ` +
               `A ${r},${r} 0 0 1 ${width - r},${height} ` +
               `L ${r},${height} ` +
               `A ${r},${r} 0 0 1 0,${height - r} ` +
               `Z`;
    }

    // Handle clip-path execution for inner webview panels
    function clipRoundRect(el) {
        if (!el) return;
        const w = el.clientWidthDouble || el.clientWidth;
        const h = el.clientHeightDouble || el.clientHeight;
        if (w === 0 || h === 0) return;
        
        // Dynamically fetch the current theme's native inner radius (Fallback to 8px)
        const radiusVal = getComputedStyle(document.documentElement).getPropertyValue('--zen-native-inner-radius');
        const r = parseFloat(radiusVal) || 8;
        
        el.style.clipPath = `path('${roundRectPath(w, h, r)}')`;
    }

    // Hardware-accelerated observer for resizing webviews
    const clipPathObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            clipRoundRect(entry.target);
        }
    });

    function clipEl(el) {
        if (!el) return;
        clipRoundRect(el);
        clipPathObserver.observe(el);
    }

    // Observe the tab panels to automatically catch new tabs and split-views
    const panelObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { 
                    if (node.classList.contains('browserSidebarContainer')) {
                        const inner = node.querySelector('.browserContainer');
                        if (inner) clipEl(inner);
                    } else if (node.querySelectorAll) {
                        node.querySelectorAll('.browserSidebarContainer > .browserContainer').forEach(child => clipEl(child));
                    }
                }
            }
        }
    });

    // Inject CSS to fix the background bleed underneath the curved corners
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .browserSidebarContainer {
                background-color: transparent !important;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();

        // Target any already-open panels (Split views, etc.)
        document.querySelectorAll('.browserSidebarContainer > .browserContainer').forEach(el => clipEl(el));

        // Safely attach to the tab container
        const tabpanels = document.getElementById("tabbrowser-tabpanels");
        if (tabpanels) {
            panelObserver.observe(tabpanels, { childList: true, subtree: true });
        }
    }

    function unload() {
        // 1. Remove vector masks
        document.querySelectorAll('.browserSidebarContainer > .browserContainer').forEach(el => {
            el.style.clipPath = "";
            clipPathObserver.unobserve(el);
        });
        
        // 2. Disconnect observers
        panelObserver.disconnect();
        clipPathObserver.disconnect();
        
        // 3. Remove injected CSS
        const styleEl = document.getElementById(STYLE_ID);
        if (styleEl) styleEl.remove();
        
        // 4. Clear instance lock
        delete window.__zenRoundedWebviewInit;
    }

    // Register unload hooks safely (Supports both standard uc.js and Zen's modloader/Sine)
    if (typeof window.addUnloadListener === "function") {
        window.addUnloadListener(unload);
    } else {
        window.addEventListener("unload", unload, { once: true });
    }

    // Wait for the browser UI to be fully ready using Sine's preferred observer notification
    if (typeof gBrowserInit !== "undefined" && gBrowserInit?.delayedStartupFinished) {
        init();
    } else {
        const obs = (subject, topic) => {
            if (topic === 'browser-delayed-startup-finished' && subject === window) {
                Services.obs.removeObserver(obs, topic);
                init();
            }
        };
        Services.obs.addObserver(obs, 'browser-delayed-startup-finished');
    }
})();

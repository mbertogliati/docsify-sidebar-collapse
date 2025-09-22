(function () {
  const STORAGE_KEY = 'docsify:sidebar:collapsed';

  function getStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function setStorage(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore */
    }
  }

  function isActiveLink(a) {
    if (!a || !a.getAttribute) return false;
    const href = a.getAttribute('href') || '';
    if (!href) return false;
    // Docsify transforms routes; compare pathname part only
    const link = href.replace(/#.*/, '');
    const current = (location.hash || '#/').replace(/#.*/, '');
    return current === link || current.startsWith(link + '/');
  }

  function setSublistExpandedState(li, expanded, animate = false) {
    // Robustly find child sublist: direct <ul> or .app-sub-sidebar, possibly under a single wrapper
    let childUL = li.querySelector(':scope > ul, :scope > .app-sub-sidebar');
    if (!childUL) {
      const wrapper = li.querySelector(':scope > *:not(a):not(.sc-toggle)');
      if (wrapper) {
        childUL = wrapper.querySelector(':scope > ul, :scope > .app-sub-sidebar');
      }
    }
    if (!childUL) return;

    // Ensure we remove inline "display" control entirely
    childUL.style.display = '';

    const onTransitionEnd = (e) => {
      if (e.propertyName !== 'max-height') return;
      childUL.removeEventListener('transitionend', onTransitionEnd);
      if (!li.classList.contains('collapsed')) {
        // Set to none after expanding so it can grow naturally
        childUL.style.maxHeight = 'none';
      }
    };

    const runNoTransition = (fn) => {
      const prev = childUL.style.transition;
      // Temporarily disable transitions for this change
      childUL.style.transition = 'none';
      fn();
      // Force reflow to apply without animating
      childUL.offsetHeight;
      // Restore transition (inherit from CSS)
      childUL.style.transition = prev;
    };

    if (expanded) {
      // EXPAND: remove class first so CSS target is open state
      li.classList.remove('collapsed');
      li.classList.remove('collapse'); // theme class may hide sublists
      // Ensure sublist is not display:none due to theme
      childUL.style.display = '';
      // Ensure content becomes visible
      childUL.style.opacity = '1';
      // If currently unconstrained, set a pixel value to enable transition
      if (getComputedStyle(childUL).maxHeight === 'none') {
        childUL.style.maxHeight = childUL.scrollHeight + 'px';
      }
      // Force reflow before changing height
      childUL.offsetHeight; // reflow
      if (animate) {
        childUL.style.maxHeight = childUL.scrollHeight + 'px';
        childUL.addEventListener('transitionend', onTransitionEnd);
      } else {
        runNoTransition(() => {
          childUL.style.maxHeight = 'none';
        });
      }
    } else {
      // COLLAPSE: measure, set current height, then add class to animate to 0 via CSS
      const computed = getComputedStyle(childUL).maxHeight;
      if (computed === 'none' || parseFloat(computed) === 0) {
        childUL.style.maxHeight = childUL.scrollHeight + 'px';
      }
      childUL.offsetHeight; // reflow to lock the height
      if (animate) {
        li.classList.add('collapsed'); // CSS drives max-height to 0 (with transition)
        // Let CSS transition run (opacity handled there)
      } else {
        runNoTransition(() => {
          li.classList.add('collapsed');
          childUL.style.maxHeight = '0px';
        });
      }
      // Ensure content becomes transparent during collapse
      childUL.style.opacity = '0';
    }
  }

  function recalcExpandedHeights(nav) {
    const expandedLists = nav.querySelectorAll('li.has-children:not(.collapsed) > ul, li.has-children:not(.collapsed) > .app-sub-sidebar');
    expandedLists.forEach((ul) => {
      // Only adjust if maxHeight is not 'none'
      if (getComputedStyle(ul).maxHeight !== 'none') {
        ul.style.maxHeight = ul.scrollHeight + 'px';
      }
    });
  }

  function enhanceSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar && (sidebar.querySelector('.sidebar-nav') || sidebar.querySelector('nav'));
    if (!nav) return;

    // Disable animations during enhancement to prevent flicker
    sidebar.classList.add('sidebar-no-anim');

    // Proceed regardless of exact structure; some themes render wrappers

    // Restore stored collapsed state
    const stored = getStorage();

    // Helper to find immediate sublist for each li
    const findChildSublist = (li) => {
      // Prefer only immediate children to match our CSS rules and the theme
      let el = li.querySelector(':scope > ul, :scope > .app-sub-sidebar');
      if (el) return el;
      // Allow a single wrapper, but still require the list to be an immediate child of that wrapper
      const wrapper = li.querySelector(':scope > *:not(a):not(.sc-toggle)');
      if (wrapper) {
        el = wrapper.querySelector(':scope > ul, :scope > .app-sub-sidebar');
        if (el) return el;
      }
      return null;
    };

    // Process a single LI: add toggle, apply stored/default state, bind events
    const processItem = (li) => {
      const childUL = findChildSublist(li);
      if (!childUL) return;

      li.classList.add('has-children');
      // Avoid conflict with theme's "collapse" class which sets display:none on .app-sub-sidebar
      li.classList.remove('collapse');
      // Ensure sublist is not display:none due to theme
      childUL.style.display = '';
      // Ensure toggle exists
      let toggle = li.querySelector(':scope > .sc-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.setAttribute('type', 'button');
        toggle.className = 'sc-toggle';
        toggle.setAttribute('aria-label', 'Toggle');
        toggle.innerHTML = '\n          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">\n            <polyline points="9 6 15 12 9 18" />\n          </svg>\n        ';
        const firstLink = li.querySelector(':scope > a');
        if (firstLink) li.insertBefore(toggle, firstLink); else li.insertBefore(toggle, li.firstChild);
      } else if (!toggle.innerHTML.trim()) {
        toggle.innerHTML = '\n          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">\n            <polyline points="9 6 15 12 9 18" />\n          </svg>\n        ';
      }
      const svg = toggle.querySelector('svg');
      if (svg) svg.style.transition = 'none';

      // Key and state
      const anchor = li.querySelector(':scope > a');
      const key = anchor ? (anchor.getAttribute('href') || anchor.textContent.trim()) : Array.from(li.childNodes).map(n => n.textContent || '').join('').trim();
      const collapsed = stored[key] !== undefined ? !!stored[key] : true;
      if (collapsed) {
        li.classList.add('collapsed');
        childUL.style.maxHeight = '0px';
        childUL.style.opacity = '0';
      } else {
        // Expanded: make sure it is visible and height is correct
        li.classList.remove('collapsed');
        childUL.style.opacity = '1';
        if (getComputedStyle(childUL).maxHeight === 'none') {
          // leave as natural height
        } else {
          childUL.style.maxHeight = childUL.scrollHeight + 'px';
        }
      }

      // Bind click every time (idempotent due to _scBound flag)
      const boundToggle = li.querySelector(':scope > .sc-toggle');
      if (boundToggle && !boundToggle._scBound) {
        boundToggle._scBound = true;
        boundToggle.onclick = function (e) {
          e.preventDefault();
          e.stopPropagation(); // prevent underlying link navigation
          const willExpand = li.classList.contains('collapsed');
          setSublistExpandedState(li, willExpand, true);
          const s = getStorage();
          s[key] = !willExpand;
          setStorage(s);
          li.classList.remove('collapse');
        }
      }
    };

    // Walk all nested list items and add toggles where there are children
    const items = nav.querySelectorAll('li');
    items.forEach(processItem);

    // Do not auto-expand active parents; honor stored state or default-collapsed

    // Recalculate heights on resize to keep transitions smooth (debounced, bind once)
    if (!window.__SC_RESIZE_BOUND__) {
      window.__SC_RESIZE_BOUND__ = true;
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        if (resizeTimer) cancelAnimationFrame(resizeTimer);
        const currentNav = document.querySelector('.sidebar .sidebar-nav, .sidebar nav');
        resizeTimer = requestAnimationFrame(() => currentNav && recalcExpandedHeights(currentNav));
      });
    }

    // Re-enable animations after layout has settled (next frame)
    requestAnimationFrame(() => {
      // One more frame for good measure to ensure styles are applied
      requestAnimationFrame(() => {
        sidebar.classList.remove('sidebar-no-anim');
        // Restore chevron transitions after initial setup
        nav.querySelectorAll('.sc-toggle svg').forEach((svg) => {
          svg.style.transition = '';
        });
      });
    });
  }

  // Debounced route change enhancer to avoid duplicate work
  let enhanceTimer = null;
  function onRouteChanged() {
    if (enhanceTimer) cancelAnimationFrame(enhanceTimer);
    enhanceTimer = requestAnimationFrame(() => {
      enhanceSidebar();
      // Extra pass shortly after to catch late-rendered sidebar nodes
      setTimeout(() => enhanceSidebar(), 75);
    });
  }

  function install(hook, vm) {
    hook.ready(function () {
      // Add a capture-phase listener to suppress animations when navigating via links
      const sidebar = document.querySelector('.sidebar');
      const nav = sidebar && (sidebar.querySelector('.sidebar-nav') || sidebar.querySelector('nav'));
      if (nav && !window.__SC_NAV_CLICK_BOUND__) {
        window.__SC_NAV_CLICK_BOUND__ = true;
        nav.addEventListener('click', function (e) {
          const toggle = e.target.closest('.sc-toggle');
          if (toggle) return; // allow animations when clicking the toggle
          const link = e.target.closest('a');
          if (link) {
            sidebar.classList.add('sidebar-no-anim');
          }
        }, true);
      }
      onRouteChanged();
    });
    hook.beforeEach(function (content, next) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.add('sidebar-no-anim');
      next(content);
    });
    hook.doneEach(onRouteChanged);
  }

  // Expose plugin
  window.$docsify = window.$docsify || {};
  window.$docsify.plugins = [].concat(install, window.$docsify.plugins || []);
})();

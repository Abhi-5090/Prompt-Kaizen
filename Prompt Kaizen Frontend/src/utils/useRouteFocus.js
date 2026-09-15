import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Moves focus to the main landmark on every route change, and announces the
 * new page.
 *
 * In a single-page app the browser does none of this. Following a link swaps
 * the DOM while focus stays on the (now removed) link, so a screen reader
 * announces nothing and a keyboard user is returned to the top of the tab
 * order with no idea the page changed. Scroll position is also preserved from
 * the previous page, which is rarely what anyone wants.
 *
 * Returns a ref to attach to <main>.
 */
export function useRouteFocus() {
  const mainRef = useRef(null);
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Don't steal focus on the initial load — the user has not navigated
    // anywhere, and hijacking focus on arrival is its own annoyance.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const el = mainRef.current;
    if (el) {
      // tabIndex -1 makes a non-interactive element programmatically
      // focusable without adding it to the tab order.
      el.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return mainRef;
}

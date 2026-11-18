'use client'

import { useEffect } from 'react'

const REGIONS = 'main, [data-f6]'

/** The regions a person can jump between, in reading order, skipping the hidden ones. */
function visibleRegions(): HTMLElement[] {
  const all = [...document.querySelectorAll<HTMLElement>(REGIONS)].filter(
    // `getClientRects` is empty for `display: none` (a collapsed column, the other tab).
    (el) => el.getClientRects().length > 0,
  )
  // `main` is only a stop when the screen defines no regions of its own inside it.
  const own = all.filter((el) => el.hasAttribute('data-f6'))
  return own.length ? own : all
}

/**
 * F6 and Shift+F6 move the keyboard focus between the regions of the screen, as in desktop
 * applications: for someone who does not use a mouse, tabbing through a long list to reach the
 * conversation is the slow way. A region opts in with `data-f6`; `main` always counts. Nothing
 * happens if there is only one. The regions are not tab stops (`tabindex=-1`): focus lands on them
 * and Tab continues from there.
 */
export function RegionShortcut() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'F6' || e.altKey || e.ctrlKey || e.metaKey) return
      const regions = visibleRegions()
      if (regions.length < 2) return
      e.preventDefault()
      // The innermost region holding the focus (a region can sit inside another).
      const current = regions.findLastIndex((r) => r.contains(document.activeElement))
      const next = (current + (e.shiftKey ? -1 : 1) + regions.length) % regions.length
      const target = regions[next]!
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
      target.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
  return null
}

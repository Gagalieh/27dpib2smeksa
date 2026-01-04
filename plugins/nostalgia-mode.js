/**
 * Nostalgia Mode Plugin
 * Memberikan efek smooth scroll dengan fokus pada memories yang sedang di-view
 */

export function initNostalgiaMode() {
  const checkbox = document.getElementById('auto-nostalgia')
  if (!checkbox) return

  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      enableNostalgiaEffect()
    } else {
      disableNostalgiaEffect()
    }
  })
}

function enableNostalgiaEffect() {
  const memoriesRoll = document.getElementById('memories-roll')
  if (!memoriesRoll) return

  const frames = Array.from(memoriesRoll.querySelectorAll('.memory-frame'))

  const onScroll = () => {
    const centerY = window.innerHeight / 2

    frames.forEach((frame) => {
      const rect = frame.getBoundingClientRect()
      const frameY = (rect.top + rect.bottom) / 2
      const distance = Math.abs(frameY - centerY)

      // Scale effect
      const maxDistance = 400
      const scale = Math.max(0.95, 1 - distance / maxDistance * 0.1)
      frame.style.transform = `scale(${scale})`

      // Glow effect
      if (distance < 150) {
        frame.classList.add('focused')
        frame.style.boxShadow = `0 0 ${Math.max(10, 30 - distance / 5)}px rgba(124, 58, 237, ${Math.max(0.1, 0.4 - distance / 400)})`
      } else {
        frame.classList.remove('focused')
        frame.style.boxShadow = 'none'
      }
    })
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window._nostalgiaScrollHandler = onScroll

  // Initial call
  onScroll()
}

function disableNostalgiaEffect() {
  if (window._nostalgiaScrollHandler) {
    window.removeEventListener('scroll', window._nostalgiaScrollHandler)
    window._nostalgiaScrollHandler = null
  }

  const memoriesRoll = document.getElementById('memories-roll')
  if (memoriesRoll) {
    memoriesRoll.querySelectorAll('.memory-frame').forEach((frame) => {
      frame.style.transform = ''
      frame.style.boxShadow = ''
      frame.classList.remove('focused')
    })
  }
}

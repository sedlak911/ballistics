import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { Backdrop } from './components/Backdrop'
import { HeaderSlotContext } from './components/HeaderSlot'
import { GzwApp, gzwInfo } from './games/gzw/GzwApp'
import { RealApp, realInfo } from './games/real/RealApp'
import type { DataInfo } from './components/InfoSheet'
import { GAMES, type GameId } from './games/registry'
import { ComingSoon } from './pages/ComingSoon'
import { useRoute } from './router'
import { SettingsProvider, useSettings } from './settings/SettingsContext'
import { APP_VERSION } from './version'
import './games/gzw/theme.css'
import './games/real/theme.css'
import './games/wardogs/theme.css'
import './styles/shell.css'
import './styles/ui.css'

const INFO: Record<GameId, DataInfo | null> = { real: realInfo, gzw: gzwInfo, wardogs: null }

function Shell() {
  const { route, display, setDisplay, t } = useSettings()
  const game = GAMES.find((g) => g.id === route.game)!
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  // The game's palette (src/games/<game>/theme.css) keys off this attribute.
  useEffect(() => {
    document.documentElement.dataset.game = route.game
  }, [route.game])
  return (
    <div className="app">
      <AppHeader route={route} games={GAMES} display={display} setDisplay={setDisplay} t={t} slotRef={setSlot}
        info={INFO[game.id]} />
      <main className="app-main">
        <Backdrop />
        <HeaderSlotContext.Provider value={slot}>
          {game.id === 'real' ? <RealApp /> : game.id === 'gzw' ? <GzwApp /> : <ComingSoon game={game.name} url={game.url} />}
        </HeaderSlotContext.Provider>
      </main>
      <div className="version-mark" aria-hidden="true">v{APP_VERSION}</div>
    </div>
  )
}

export default function App() {
  const [route, navigate] = useRoute()
  return (
    <SettingsProvider route={route} navigate={navigate}>
      <Shell />
    </SettingsProvider>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { BookIcon } from './games/real/components/icons'
import { openGuide } from './games/real/guide'
import { AppHeader } from './components/AppHeader'
import { Backdrop } from './components/Backdrop'
import { HeaderSlotContext } from './components/HeaderSlot'
import { ToastSlotContext } from './components/toastSlot'
import { GzwApp, gzwInfo } from './games/gzw/GzwApp'
import { RealApp, realInfo } from './games/real/RealApp'
import { RealDisplaySettings } from './games/real/components/RealDisplaySettings'
import type { DataInfo } from './components/InfoSheet'
import { GAMES, type GameId } from './games/registry'
import { ComingSoon } from './pages/ComingSoon'
import { useRoute } from './router'
import { InstallNote } from './components/InstallNote'
import { resetEverything } from './reset'
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
  // The open modal sheet's toast slot, if any (ToastSlot registers it); the toast shows on <body> without one.
  const [toastSlot, setToastSlot] = useState<HTMLElement | null>(null)
  const toastSlotValue = useMemo(() => ({ slot: toastSlot, setSlot: setToastSlot }), [toastSlot])
  // The game's palette (src/games/<game>/theme.css) keys off this attribute.
  useEffect(() => {
    document.documentElement.dataset.game = route.game
  }, [route.game])
  return (
    <div className="app">
      <Backdrop />
      <AppHeader route={route} games={GAMES} display={display} setDisplay={setDisplay} t={t} slotRef={setSlot}
        info={INFO[game.id]} infoAction={game.id === 'real' ? { label: t('guide.open'), icon: <BookIcon />, run: openGuide } : undefined}
        extraSettings={game.id === 'real' ? <RealDisplaySettings /> : undefined} onReset={resetEverything} />
      <main className="app-main">
        <HeaderSlotContext.Provider value={slot}>
          <ToastSlotContext.Provider value={toastSlotValue}>
            {game.id === 'real' ? <RealApp /> : game.id === 'gzw' ? <GzwApp /> : <ComingSoon game={game.name} url={game.url} />}
          </ToastSlotContext.Provider>
        </HeaderSlotContext.Provider>
      </main>
      {game.id !== 'real' && <InstallNote t={t} />}
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

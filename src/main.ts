import './style.css'
import { AppState, Court, Player, ShuffleResult } from './models'

const appState = AppState.load()
let result: ShuffleResult | null = null
let addingGym = false
let renamingGym = false
let showHelp = false

function save() { appState.save() }
function gym() { return appState.activeGym }

// ── Share / URL params ────────────────────────────────────────────────────────

function buildShareUrl(): string {
  const g = gym()
  const data = {
    gym: g.name,
    courts: g.numCourts,
    courtNames: g.courtNames,
    players: g.pool.map((p) => ({ name: p.name, pref: p.preferredCourt })),
    present: g.pool.filter((p) => g.isPresent(p.id)).map((p) => p.name),
  }
  const encoded = btoa(encodeURIComponent(JSON.stringify(data)))
  return `${window.location.origin}${window.location.pathname}?share=${encoded}`
}

function loadFromShareParam(): void {
  const params = new URLSearchParams(window.location.search)
  const shareData = params.get('share')
  if (!shareData) return

  try {
    const decoded = JSON.parse(decodeURIComponent(atob(shareData))) as {
      gym?: string
      courts?: number
      courtNames?: string[]
      players?: { name: string; pref: number | null }[]
      present?: string[]
    }

    const baseName = (decoded.gym ?? 'Shared Gym').trim() || 'Shared Gym'
    const existingGym = appState.gyms.find((g) => g.name === baseName)
    let finalName = baseName

    if (existingGym) {
      let counter = 1
      let numberedName = `${baseName} (${counter})`
      const existingNames = new Set(appState.gyms.map((g) => g.name))
      while (existingNames.has(numberedName)) {
        numberedName = `${baseName} (${++counter})`
      }
      const replace = confirm(`A gym named "${baseName}" already exists.\n\nOK to replace it, or Cancel to add it as "${numberedName}".`)
      if (replace) {
        appState.removeGym(existingGym.id)
      } else {
        finalName = numberedName
      }
    }

    const newGym = appState.addGym(finalName)
    newGym.resizeCourts(decoded.courts ?? 2)
    if (decoded.courtNames) {
      decoded.courtNames.forEach((name, i) => newGym.setCourtName(i + 1, name))
    }
    const presentSet = new Set(decoded.present ?? [])
    if (decoded.players) {
      decoded.players.forEach(({ name, pref }) => {
        const player = newGym.addToPool(name)
        player.preferredCourt = pref ?? null
        if (presentSet.has(name)) newGym.presentIds.add(player.id)
      })
    }

    appState.save()
    window.history.replaceState({}, '', window.location.pathname)
  } catch { /* invalid share data — ignore */ }
}

// ── Actions ───────────────────────────────────────────────────────────────────

function doShuffle() {
  if (gym().presentPlayers.length < Court.MIN_PLAYERS) return
  result = gym().shuffle()
  render()
  document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function setNumCourts(n: number) {
  gym().resizeCourts(n)
  result = null
  save()
  render()
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  const app = document.getElementById('app')!
  const g = gym()
  const present = g.presentPlayers
  const canShuffle = present.length >= Court.MIN_PLAYERS
  const unusedCourts = g.numCourts - Math.floor(present.length / Court.MIN_PLAYERS)
  const tooFewForAllCourts = present.length > 0 && present.length < g.numCourts * Court.MIN_PLAYERS

  // Pool sorted alphabetically
  const sortedPool = [...g.pool].sort((a, b) => a.name.localeCompare(b.name))

  app.innerHTML = `
    <header>
      <div class="header-inner">
        <h1>🎾 CourtShuffle</h1>
        <button class="btn btn-help" id="help-btn" aria-label="Help">?</button>
      </div>
    </header>

    <!-- ── Gym bar ── -->
    <div class="gym-bar">
      <div class="gym-bar-inner">
      ${addingGym ? `
        <input class="gym-name-input" id="gym-name-input" type="text"
          placeholder="Gym name…" autocomplete="off" autocapitalize="words" maxlength="40"/>
        <button class="btn btn-primary btn-sm" id="gym-save-btn">Add</button>
        <button class="btn btn-ghost btn-sm" id="gym-cancel-btn">Cancel</button>
      ` : renamingGym ? `
        <input class="gym-name-input" id="gym-rename-input" type="text"
          value="${escapeHtml(gym().name)}"
          autocomplete="off" autocapitalize="words" maxlength="40"/>
        <button class="btn btn-primary btn-sm" id="gym-rename-save-btn">Save</button>
        <button class="btn btn-ghost btn-sm" id="gym-cancel-btn">Cancel</button>
      ` : `
        <select class="gym-select" id="gym-select" aria-label="Select gym">
          ${appState.gyms.map((g) =>
            `<option value="${g.id}"${g.id === appState.activeGymId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`
          ).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" id="new-gym-btn">+ New</button>
        <button class="btn btn-ghost btn-sm" id="rename-gym-btn">Edit</button>
        <button class="btn btn-ghost btn-sm" id="share-gym-btn">Share</button>
        ${appState.gyms.length > 1
          ? `<button class="btn btn-ghost btn-sm btn-danger-ghost" id="delete-gym-btn">Delete</button>`
          : ''}
      `}
      </div>
    </div>

    <main>

      <!-- ── Player Pool ── -->
      <section class="card" id="pool-section">
        <div class="section-header">
          <h2>Player Pool <span class="badge">${g.pool.length}</span></h2>
          ${g.pool.length > 0 ? `
          <div class="pool-quick-btns">
            <button class="btn btn-ghost" id="all-in-btn">All in</button>
            <button class="btn btn-ghost" id="all-out-btn">All out</button>
          </div>` : ''}
        </div>

        ${g.pool.length > 0 ? `<p class="tonight-summary"><strong>${present.length}</strong> of ${g.pool.length} present tonight</p>` : ''}

        ${g.pool.length === 0
          ? '<p class="empty-hint">Add players to build your permanent pool.</p>'
          : `<ul class="player-list">
            ${sortedPool.map((p) => {
              const here = g.isPresent(p.id)
              const prefVal = p.preferredCourt ?? ''
              return `
              <li class="player-item${here ? ' player-present' : ''}">
                <button class="btn btn-toggle${here ? ' btn-toggle--in' : ''}"
                  data-toggle="${p.id}" aria-pressed="${here}"
                  aria-label="${here ? 'Mark absent' : 'Mark present'}: ${escapeHtml(p.name)}">
                  <span class="toggle-dot"></span>
                  <span class="player-name">${escapeHtml(p.name)}</span>
                  <span class="presence-label">${here ? 'In' : 'Out'}</span>
                </button>
                <select class="court-pref-select" data-pref-player="${p.id}"
                  aria-label="Preferred court for ${escapeHtml(p.name)}"
                  title="Preferred court">
                  <option value=""${prefVal === '' ? ' selected' : ''}>Any</option>
                  ${Array.from({ length: g.numCourts }, (_, i) => i + 1).map((n) =>
                    `<option value="${n}"${p.preferredCourt === n ? ' selected' : ''}>${escapeHtml(g.getCourtName(n))}</option>`
                  ).join('')}
                </select>
                <button class="btn btn-remove" data-remove="${p.id}"
                  aria-label="Remove ${escapeHtml(p.name)} from pool">✕</button>
              </li>`
            }).join('')}
          </ul>`
        }

        <div class="add-player-row">
          <input type="text" id="player-input" placeholder="Add player to pool…"
            autocomplete="off" autocorrect="off" autocapitalize="words"
            spellcheck="false" maxlength="40"/>
          <button id="add-btn" class="btn btn-primary">Add</button>
        </div>
      </section>

      <!-- ── Courts ── -->
      <section class="card" id="courts-section">
        <h2>Courts</h2>
        <div class="courts-row">
          <button class="btn btn-stepper" id="courts-down" aria-label="Decrease courts">−</button>
          <span class="courts-count">${g.numCourts}</span>
          <button class="btn btn-stepper" id="courts-up" aria-label="Increase courts">+</button>
        </div>
        <ul class="court-names-list">
          ${Array.from({ length: g.numCourts }, (_, i) => i + 1).map((n) => `
          <li>
            <span class="court-num-label">${n}</span>
            <input
              class="court-name-input"
              data-court-num="${n}"
              value="${escapeHtml(g.getCourtName(n))}"
              placeholder="Court ${n}"
              maxlength="30"
              autocomplete="off"
              spellcheck="false"
            />
          </li>`).join('')}
        </ul>
        <p class="courts-hint">2 to 4 players per court</p>
      </section>

      <!-- ── Shuffle ── -->
      <div class="shuffle-container">
        <button id="shuffle-btn"
          class="btn btn-shuffle${canShuffle ? '' : ' btn-disabled'}"
          ${canShuffle ? '' : 'disabled'}>
          🔀 Shuffle ${canShuffle ? `(${present.length})` : ''}
        </button>
        ${tooFewForAllCourts
          ? `<p class="warn">⚠️ ${unusedCourts} court${unusedCourts !== 1 ? 's' : ''} will be unused with ${present.length} players.</p>`
          : !canShuffle && g.pool.length > 0
            ? `<p class="warn">Mark at least 2 players as present to shuffle.</p>`
            : ''}
      </div>

      <!-- ── Results ── -->
      ${result ? renderResults(result) : ''}

    </main>

    <footer class="app-footer">
      <button class="btn btn-clear-data" id="clear-data-btn">Clear all data</button>
    </footer>

    ${showHelp ? `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-content">
        <div class="modal-header">
          <h2>How to use CourtShuffle</h2>
          <button class="btn btn-ghost btn-sm modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <dl class="help-list">
            <dt>Gyms</dt>
            <dd>Create separate gyms for different venues. Use the gym bar to switch between them. Hit <strong>Share</strong> to copy a link that loads this gym's full config on any device.</dd>

            <dt>Player Pool</dt>
            <dd>Add players to build a permanent roster. Players are saved across sessions so you only set them up once.</dd>

            <dt>Present Tonight</dt>
            <dd>Tap a player to toggle them <strong>In</strong> or <strong>Out</strong>. Only "In" players are assigned to courts when you shuffle.</dd>

            <dt>Court Preferences</dt>
            <dd>Set a preferred court for a player using the dropdown next to their name. They'll be placed on that court first when possible.</dd>

            <dt>Courts</dt>
            <dd>Use <strong>−</strong> / <strong>+</strong> to set how many courts are open. Click any court name to rename it.</dd>

            <dt>Shuffle</dt>
            <dd>Tap <strong>Shuffle</strong> to randomly assign present players to courts.<br>
              2 players → Singles &nbsp;·&nbsp; 3 → Cutthroat &nbsp;·&nbsp; 4 → Doubles<br>
              A server is randomly chosen for each court.</dd>

            <dt>Drag &amp; Drop</dt>
            <dd>After shuffling, drag players between courts or to the bench to fine-tune assignments.</dd>

            <dt>Sharing</dt>
            <dd>The <strong>Share</strong> button copies a URL. Anyone who opens it gets the gym added to their app — players, court names, and present status all included. If a gym with the same name already exists, a number is appended automatically.</dd>
          </dl>
        </div>
      </div>
    </div>
    ` : ''}
  `

  wireEvents()
  if (result) initDragAndDrop()
}

function renderResults(res: ShuffleResult): string {
  return `
    <section id="results">
      <h2 class="results-heading">Court Assignments</h2>
      <div class="courts-grid">
        ${res.courts.map((court) => `
        <div class="court-card drop-zone${court.isEmpty ? ' court-empty' : ''}"
          data-drop-court="${court.number}">
          <div class="court-label">${escapeHtml(court.name)}</div>
          ${court.isEmpty ? '<p class="court-no-players">Unused</p>' : renderCourtBody(court)}
        </div>`).join('')}
      </div>

      <div class="bench drop-zone${res.bench.length === 0 ? ' bench--empty' : ''}"
        data-drop-bench="true">
        <div class="bench-header">
          <span class="bench-title">🪑 Bench</span>
          <span class="bench-count">${res.bench.length} player${res.bench.length !== 1 ? 's' : ''}</span>
        </div>
        ${res.bench.length > 0
          ? `<ul class="bench-players">
              ${res.bench.map((p) => `
              <li class="draggable-item" data-player-id="${p.id}"
                data-player-name="${escapeHtml(p.name)}" data-source-bench="true">
                ${escapeHtml(p.name)}
              </li>`).join('')}
            </ul>`
          : '<p class="bench-empty-hint">Drop players here</p>'}
      </div>
    </section>`
}

function renderCourtBody(court: import('./models').Court): string {
  const badge = court.gameType
    ? `<span class="game-type game-type--${court.gameType.toLowerCase()}">${court.gameType}</span>`
    : ''

  const emptySlot = court.players.length < Court.MAX_PLAYERS
    ? `<div class="court-empty-slot drop-zone" data-drop-court="${court.number}">+ add player</div>`
    : ''

  if (court.teams) {
    const [a, b] = court.teams
    const teamPlayer = (p: Player, teamIdx: number) => {
      const isServer = court.server?.id === p.id
      return `<span class="team-player draggable-item${isServer ? ' is-server-inline' : ''}"
        data-player-id="${p.id}" data-player-name="${escapeHtml(p.name)}"
        data-source-court="${court.number}" data-source-team="${teamIdx}">
        ${escapeHtml(p.name)}${isServer ? '<span class="server-tag">serves first</span>' : ''}
      </span>`
    }
    return `
      ${badge}
      <div class="teams">
        <div class="team drop-zone" data-drop-court="${court.number}" data-drop-team="0">
          ${a.map((p) => teamPlayer(p, 0)).join('')}
        </div>
        <div class="vs">vs</div>
        <div class="team drop-zone" data-drop-court="${court.number}" data-drop-team="1">
          ${b.map((p) => teamPlayer(p, 1)).join('')}
        </div>
      </div>
      ${emptySlot}`
  }

  // Singles and Cutthroat — server is always set when players.length >= 2
  return `
    ${badge}
    <ul class="court-players">
      ${court.players.map((p) =>
        court.server?.id === p.id
          ? `<li class="is-server draggable-item" data-player-id="${p.id}"
              data-player-name="${escapeHtml(p.name)}" data-source-court="${court.number}">
              ${escapeHtml(p.name)}<span class="server-tag">serves first</span>
            </li>`
          : `<li class="draggable-item" data-player-id="${p.id}"
              data-player-name="${escapeHtml(p.name)}" data-source-court="${court.number}">
              ${escapeHtml(p.name)}
            </li>`
      ).join('')}
    </ul>
    ${emptySlot}`
}

// ── Drag and drop ─────────────────────────────────────────────────────────────

function initDragAndDrop() {
  if (!result) return

  let ghost: HTMLElement | null = null
  let draggedPlayerId: string | null = null
  let draggedSourceCourtNum: number | null = null  // null = from bench
  let draggedSourceTeamIdx: number | null = null   // null unless from a team div
  let currentDropZone: Element | null = null

  function findDropZone(x: number, y: number): Element | null {
    if (ghost) ghost.style.display = 'none'
    const el = document.elementFromPoint(x, y)?.closest('.drop-zone') ?? null
    if (ghost) ghost.style.display = ''
    return el
  }

  function setActiveDropZone(zone: Element | null) {
    if (currentDropZone === zone) return
    currentDropZone?.classList.remove('drop-zone--active')
    zone?.classList.add('drop-zone--active')
    currentDropZone = zone
  }

  function onPointerDown(e: PointerEvent) {
    const item = (e.target as Element).closest('.draggable-item') as HTMLElement | null
    if (!item) return
    e.preventDefault()

    draggedPlayerId = item.dataset.playerId ?? null
    draggedSourceCourtNum = item.dataset.sourceCourt ? parseInt(item.dataset.sourceCourt) : null
    draggedSourceTeamIdx = item.dataset.sourceTeam !== undefined ? parseInt(item.dataset.sourceTeam) : null
    if (!draggedPlayerId) return

    const name = item.dataset.playerName ?? '?'

    ghost = document.createElement('div')
    ghost.className = 'drag-ghost'
    ghost.textContent = name
    ghost.style.left = `${e.clientX}px`
    ghost.style.top = `${e.clientY}px`
    document.body.appendChild(ghost)
    document.body.classList.add('is-dragging')

    document.addEventListener('pointermove', onPointerMove, { passive: false })
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('pointercancel', cleanup)
  }

  function onPointerMove(e: PointerEvent) {
    if (!ghost) return
    e.preventDefault()
    ghost.style.left = `${e.clientX}px`
    ghost.style.top = `${e.clientY}px`
    setActiveDropZone(findDropZone(e.clientX, e.clientY))
  }

  function onPointerUp(e: PointerEvent) {
    if (ghost) ghost.style.display = 'none'
    const targetItem = document.elementFromPoint(e.clientX, e.clientY)?.closest('.draggable-item') as HTMLElement | null
    if (ghost) ghost.style.display = ''

    if (targetItem && draggedPlayerId && result) {
      const targetId = targetItem.dataset.playerId
      if (targetId && targetId !== draggedPlayerId) {
        // Drop onto another player — swap
        const targetCourtNum = targetItem.dataset.sourceCourt ? parseInt(targetItem.dataset.sourceCourt) : null
        const targetTeamIdx = targetItem.dataset.sourceTeam !== undefined ? parseInt(targetItem.dataset.sourceTeam) : null
        swapPlayers(
          draggedPlayerId, draggedSourceCourtNum, draggedSourceTeamIdx,
          targetId, targetCourtNum, targetTeamIdx,
        )
        cleanup()
        return
      }
    }

    const dropZone = findDropZone(e.clientX, e.clientY)
    if (dropZone && draggedPlayerId && result) {
      movePlayer(draggedPlayerId, draggedSourceCourtNum, draggedSourceTeamIdx, dropZone)
    }
    cleanup()
  }

  function cleanup() {
    ghost?.remove()
    ghost = null
    document.body.classList.remove('is-dragging')
    currentDropZone?.classList.remove('drop-zone--active')
    currentDropZone = null
    draggedPlayerId = null
    draggedSourceCourtNum = null
    draggedSourceTeamIdx = null
    document.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('pointercancel', cleanup)
  }

  document.querySelectorAll('.draggable-item').forEach((el) => {
    el.addEventListener('pointerdown', onPointerDown as EventListener)
  })
}

function movePlayer(
  playerId: string,
  sourceCourtNum: number | null,  // null = bench
  sourceTeamIdx: number | null,   // null unless source was a team slot
  targetZone: Element,
) {
  if (!result) return

  const el = targetZone as HTMLElement
  const targetCourtNum = el.dataset.dropCourt ? parseInt(el.dataset.dropCourt) : null
  const targetTeamIdx = el.dataset.dropTeam !== undefined ? parseInt(el.dataset.dropTeam) : null
  const targetIsBench = el.dataset.dropBench === 'true'

  const player = gym().pool.find((p) => p.id === playerId)
  if (!player) return

  // ── Intra-court team rearrangement ──────────────────────────────
  if (
    sourceCourtNum !== null &&
    targetCourtNum === sourceCourtNum &&
    targetTeamIdx !== null &&
    sourceTeamIdx !== targetTeamIdx
  ) {
    const court = result.courts.find((c) => c.number === sourceCourtNum)
    if (!court?.teams) return
    court.teams[sourceTeamIdx!] = court.teams[sourceTeamIdx!].filter((p) => p.id !== playerId)
    court.teams[targetTeamIdx].push(player)
    court.players = [...court.teams[0], ...court.teams[1]]
    render()
    return
  }

  // No-op: same zone
  if (sourceCourtNum !== null && targetCourtNum === sourceCourtNum && targetTeamIdx === sourceTeamIdx) return
  if (sourceCourtNum === null && targetIsBench) return

  // ── Remove from source ───────────────────────────────────────────
  if (sourceCourtNum !== null) {
    const src = result.courts.find((c) => c.number === sourceCourtNum)
    if (src) {
      src.players = src.players.filter((p) => p.id !== playerId)
      if (src.teams) {
        src.teams[0] = src.teams[0].filter((p) => p.id !== playerId)
        src.teams[1] = src.teams[1].filter((p) => p.id !== playerId)
      }
      src.finalizeAssignments()
    }
  } else {
    result.bench = result.bench.filter((p) => p.id !== playerId)
  }

  // ── Add to target ────────────────────────────────────────────────
  if (targetCourtNum !== null) {
    const tgt = result.courts.find((c) => c.number === targetCourtNum)
    if (!tgt) return
    if (tgt.players.length >= Court.MAX_PLAYERS) return  // full
    if (targetTeamIdx !== null && tgt.teams) {
      // Drop onto a specific team in an existing Doubles court
      tgt.teams[targetTeamIdx].push(player)
      tgt.players = [...tgt.teams[0], ...tgt.teams[1]]
    } else {
      tgt.players.push(player)
      tgt.finalizeAssignments()
    }
  } else if (targetIsBench) {
    result.bench.push(player)
  }

  render()
}

function swapPlayers(
  aId: string, aCourtNum: number | null, _aTeamIdx: number | null,
  bId: string, bCourtNum: number | null, _bTeamIdx: number | null,
) {
  if (!result) return

  const aPlayer = gym().pool.find((p) => p.id === aId)
  const bPlayer = gym().pool.find((p) => p.id === bId)
  if (!aPlayer || !bPlayer) return

  // Atomically swap A and B in any array that contains either of them.
  // Indices are captured before any writes, so same-array swaps are safe.
  function swapInArray(arr: Player[]) {
    const iA = arr.findIndex((p) => p.id === aId)
    const iB = arr.findIndex((p) => p.id === bId)
    if (iA !== -1) arr[iA] = bPlayer!
    if (iB !== -1) arr[iB] = aPlayer!
  }

  const aCourtObj = aCourtNum !== null ? result.courts.find((c) => c.number === aCourtNum) ?? null : null
  const bCourtObj = bCourtNum !== null ? result.courts.find((c) => c.number === bCourtNum) ?? null : null

  // Players arrays (one call handles same-court case; two calls handle cross-court)
  if (aCourtObj) swapInArray(aCourtObj.players)
  else swapInArray(result.bench)

  if (bCourtObj && bCourtObj !== aCourtObj) swapInArray(bCourtObj.players)
  else if (!bCourtObj && aCourtObj !== null) swapInArray(result.bench)

  // Teams arrays
  aCourtObj?.teams?.forEach(swapInArray)
  if (bCourtObj && bCourtObj !== aCourtObj) bCourtObj.teams?.forEach(swapInArray)

  // Server refs
  ;[aCourtObj, bCourtObj].forEach((court) => {
    if (!court) return
    if (court.server?.id === aId) court.server = bPlayer
    else if (court.server?.id === bId) court.server = aPlayer
  })

  render()
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireEvents() {
  // Gym bar
  if (addingGym) {
    const gymNameInput = document.getElementById('gym-name-input') as HTMLInputElement
    gymNameInput.focus()
    function commitNewGym() {
      const name = gymNameInput.value.trim()
      if (!name) return
      appState.addGym(name)
      addingGym = false; result = null; save(); render()
    }
    document.getElementById('gym-save-btn')!.addEventListener('click', commitNewGym)
    gymNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitNewGym()
      if (e.key === 'Escape') { addingGym = false; render() }
    })
    document.getElementById('gym-cancel-btn')!.addEventListener('click', () => { addingGym = false; render() })

  } else if (renamingGym) {
    const renameInput = document.getElementById('gym-rename-input') as HTMLInputElement
    renameInput.focus()
    renameInput.select()
    function commitRename() {
      const name = renameInput.value.trim()
      if (!name) return
      gym().name = name
      renamingGym = false; save(); render()
    }
    document.getElementById('gym-rename-save-btn')!.addEventListener('click', commitRename)
    renameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commitRename()
      if (e.key === 'Escape') { renamingGym = false; render() }
    })
    document.getElementById('gym-cancel-btn')!.addEventListener('click', () => { renamingGym = false; render() })

  } else {
    document.getElementById('gym-select')!.addEventListener('change', (e) => {
      appState.setActiveGym((e.target as HTMLSelectElement).value)
      result = null; save(); render()
    })
    document.getElementById('new-gym-btn')!.addEventListener('click', () => { addingGym = true; render() })
    document.getElementById('rename-gym-btn')!.addEventListener('click', () => { renamingGym = true; render() })
    document.getElementById('share-gym-btn')?.addEventListener('click', () => {
      const url = buildShareUrl()
      const btn = document.getElementById('share-gym-btn') as HTMLButtonElement
      navigator.clipboard.writeText(url).then(() => {
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Share' }, 2000) }
      }).catch(() => { prompt('Copy this link:', url) })
    })
    document.getElementById('delete-gym-btn')?.addEventListener('click', () => {
      if (!confirm(`Delete "${gym().name}" and all its players?`)) return
      appState.removeGym(gym().id); result = null; save(); render()
    })
  }

  // Help modal
  document.getElementById('help-btn')?.addEventListener('click', () => { showHelp = true; render() })
  document.getElementById('modal-close')?.addEventListener('click', () => { showHelp = false; render() })
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) { showHelp = false; render() }
  })

  // Pool
  const input = document.getElementById('player-input') as HTMLInputElement
  function handleAdd() {
    const trimmed = input.value.trim()
    if (!trimmed) return
    const player = gym().addToPool(trimmed)
    gym().presentIds.add(player.id)
    result = null; save(); input.value = ''; render(); input.focus()
  }
  document.getElementById('add-btn')!.addEventListener('click', handleAdd)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAdd() })

  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gym().togglePresent((btn as HTMLElement).dataset.toggle!)
      result = null; save(); render()
    })
  })

  document.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      gym().removeFromPool((btn as HTMLElement).dataset.remove!)
      result = null; save(); render()
    })
  })

  document.querySelectorAll('.court-pref-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const playerId = (sel as HTMLElement).dataset.prefPlayer!
      const val = (e.target as HTMLSelectElement).value
      const player = gym().pool.find((p) => p.id === playerId)
      if (!player) return
      player.preferredCourt = val === '' ? null : parseInt(val)
      save()
    })
  })

  document.getElementById('all-in-btn')?.addEventListener('click', () => {
    gym().setAllPresent(); result = null; save(); render()
  })
  document.getElementById('all-out-btn')?.addEventListener('click', () => {
    gym().clearPresent(); result = null; save(); render()
  })

  document.querySelectorAll('.court-name-input').forEach((el) => {
    const input = el as HTMLInputElement
    const n = parseInt(input.dataset.courtNum!)
    input.addEventListener('change', () => {
      gym().setCourtName(n, input.value)
      save()
      // Re-render only the preference selects so names stay current without losing focus
      document.querySelectorAll('.court-pref-select').forEach((sel) => {
        const s = sel as HTMLSelectElement
        const playerId = s.dataset.prefPlayer!
        const player = gym().pool.find((p) => p.id === playerId)
        Array.from(s.options).forEach((opt, i) => {
          if (i === 0) return // "Any"
          opt.text = escapeHtml(gym().getCourtName(i))
        })
        if (player) s.value = player.preferredCourt?.toString() ?? ''
      })
    })
  })

  document.getElementById('courts-down')?.addEventListener('click', () => setNumCourts(gym().numCourts - 1))
  document.getElementById('courts-up')?.addEventListener('click', () => setNumCourts(gym().numCourts + 1))
  document.getElementById('shuffle-btn')?.addEventListener('click', doShuffle)

  document.getElementById('clear-data-btn')!.addEventListener('click', () => {
    if (!confirm('Clear all gyms, players, and settings? This cannot be undone.')) return
    localStorage.clear()
    Object.assign(appState, AppState.load())
    result = null; render()
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

loadFromShareParam()
render()

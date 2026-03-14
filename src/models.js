const STORAGE_KEY_V2 = 'courtShuffle_v2';
const STORAGE_KEY_V1 = 'courtShuffle_v1';
export class Player {
    constructor(name, id) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: name
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "preferredCourt", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.id = id ?? crypto.randomUUID();
    }
}
export class Court {
    constructor(number, name) {
        Object.defineProperty(this, "number", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: number
        });
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: name
        });
        Object.defineProperty(this, "players", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "server", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "teams", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
    }
    get isEmpty() {
        return this.players.length === 0;
    }
    get isValid() {
        return this.players.length >= Court.MIN_PLAYERS && this.players.length <= Court.MAX_PLAYERS;
    }
    get gameType() {
        switch (this.players.length) {
            case 2: return 'Singles';
            case 3: return 'Cutthroat';
            case 4: return 'Doubles';
            default: return null;
        }
    }
    /** Recalculate server / teams from current players. */
    finalizeAssignments() {
        this.teams = null;
        this.server = this.players.length >= 2
            ? this.players[Math.floor(Math.random() * this.players.length)]
            : null;
        if (this.players.length === 4) {
            this.teams = [
                [this.players[0], this.players[1]],
                [this.players[2], this.players[3]],
            ];
        }
    }
}
Object.defineProperty(Court, "MIN_PLAYERS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 2
});
Object.defineProperty(Court, "MAX_PLAYERS", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: 4
});
export class Gym {
    constructor(name, numCourts, id) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: name
        });
        Object.defineProperty(this, "numCourts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: numCourts
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "presentIds", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "courtNames", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.id = id ?? crypto.randomUUID();
        this.courtNames = Array.from({ length: numCourts }, (_, i) => `Court ${i + 1}`);
    }
    getCourtName(n) {
        return this.courtNames[n - 1] ?? `Court ${n}`;
    }
    setCourtName(n, name) {
        if (n >= 1 && n <= this.numCourts) {
            this.courtNames[n - 1] = name.trim() || `Court ${n}`;
        }
    }
    /** Change the number of courts, growing or trimming courtNames to match. */
    resizeCourts(n) {
        this.numCourts = Math.max(1, Math.min(20, n));
        while (this.courtNames.length < this.numCourts) {
            this.courtNames.push(`Court ${this.courtNames.length + 1}`);
        }
        this.courtNames.length = this.numCourts;
    }
    // ── Pool ─────────────────────────────────────────────────────────
    addToPool(name) {
        const player = new Player(name.trim());
        this.pool.push(player);
        return player;
    }
    removeFromPool(id) {
        this.pool = this.pool.filter((p) => p.id !== id);
        this.presentIds.delete(id);
    }
    // ── Presence ─────────────────────────────────────────────────────
    get presentPlayers() {
        return this.pool.filter((p) => this.presentIds.has(p.id));
    }
    isPresent(id) {
        return this.presentIds.has(id);
    }
    togglePresent(id) {
        if (this.presentIds.has(id)) {
            this.presentIds.delete(id);
        }
        else {
            this.presentIds.add(id);
        }
    }
    setAllPresent() {
        this.pool.forEach((p) => this.presentIds.add(p.id));
    }
    clearPresent() {
        this.presentIds.clear();
    }
    // ── Shuffle ──────────────────────────────────────────────────────
    /**
     * 1. Place players with a valid court preference on their court first.
     * 2. Top up those courts with shuffled flexible players.
     * 3. Distribute remaining flexible players across empty courts (standard algo).
     * 4. Bench = overflow.
     */
    shuffle() {
        const courts = Array.from({ length: this.numCourts }, (_, i) => new Court(i + 1, this.getCourtName(i + 1)));
        const present = this.presentPlayers;
        if (present.length === 0)
            return { courts, bench: [] };
        const flexible = [];
        // Step 1 – preferred placements
        for (const p of present) {
            const pref = p.preferredCourt;
            if (pref !== null && pref >= 1 && pref <= this.numCourts) {
                const court = courts[pref - 1];
                if (court.players.length < Court.MAX_PLAYERS) {
                    court.players.push(p);
                    continue;
                }
            }
            flexible.push(p);
        }
        // Step 2 – top up courts that already have preferred players
        const shuffledFlexible = fisherYates(flexible);
        let fi = 0;
        for (const court of courts) {
            if (court.players.length > 0) {
                while (court.players.length < Court.MAX_PLAYERS && fi < shuffledFlexible.length) {
                    court.players.push(shuffledFlexible[fi++]);
                }
            }
        }
        // Step 3 – fill empty courts with remaining flexible players
        const remaining = shuffledFlexible.slice(fi);
        const emptyCourts = courts.filter((c) => c.players.length === 0);
        const n = remaining.length;
        const activeCourts = Math.min(emptyCourts.length, Math.floor(n / Court.MIN_PLAYERS));
        const capacity = activeCourts * Court.MAX_PLAYERS;
        const playing = remaining.slice(0, capacity);
        const bench = remaining.slice(capacity);
        if (activeCourts > 0) {
            const base = Math.floor(playing.length / activeCourts);
            const extra = playing.length % activeCourts;
            let cursor = 0;
            for (let i = 0; i < activeCourts; i++) {
                const count = base + (i < extra ? 1 : 0);
                emptyCourts[i].players = playing.slice(cursor, cursor + count);
                cursor += count;
            }
        }
        // Step 4 – assign server / teams
        courts.forEach((c) => c.finalizeAssignments());
        return { courts, bench };
    }
}
// ── AppState ──────────────────────────────────────────────────────────────────
export class AppState {
    constructor() {
        Object.defineProperty(this, "gyms", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "activeGymId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
    }
    get activeGym() {
        return this.gyms.find((g) => g.id === this.activeGymId) ?? this.gyms[0];
    }
    addGym(name) {
        const gym = new Gym(name.trim(), 2);
        this.gyms.push(gym);
        this.activeGymId = gym.id;
        return gym;
    }
    removeGym(id) {
        if (this.gyms.length <= 1)
            return;
        this.gyms = this.gyms.filter((g) => g.id !== id);
        if (this.activeGymId === id)
            this.activeGymId = this.gyms[0].id;
    }
    setActiveGym(id) {
        if (this.gyms.some((g) => g.id === id))
            this.activeGymId = id;
    }
    save() {
        const data = {
            activeGymId: this.activeGymId,
            gyms: this.gyms.map((g) => ({
                id: g.id,
                name: g.name,
                numCourts: g.numCourts,
                courtNames: g.courtNames,
                pool: g.pool.map((p) => ({ id: p.id, name: p.name, preferredCourt: p.preferredCourt })),
                presentIds: [...g.presentIds],
            })),
        };
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(data));
    }
    static load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_V2);
            if (raw) {
                const data = JSON.parse(raw);
                const state = new AppState();
                state.gyms = (data.gyms ?? []).map((g) => {
                    const gym = new Gym(g.name ?? 'My Gym', g.numCourts ?? 2, g.id);
                    if (g.courtNames && g.courtNames.length === gym.numCourts) {
                        gym.courtNames = g.courtNames;
                    }
                    gym.pool = (g.pool ?? []).map((p) => {
                        const player = new Player(p.name, p.id);
                        player.preferredCourt = p.preferredCourt ?? null;
                        return player;
                    });
                    gym.presentIds = new Set(g.presentIds ?? []);
                    return gym;
                });
                if (state.gyms.length === 0)
                    state.addGym('My Gym');
                state.activeGymId = data.activeGymId && state.gyms.some((g) => g.id === data.activeGymId)
                    ? data.activeGymId
                    : state.gyms[0].id;
                return state;
            }
        }
        catch { /* fall through */ }
        try {
            const v1raw = localStorage.getItem(STORAGE_KEY_V1);
            if (v1raw) {
                const v1 = JSON.parse(v1raw);
                const state = new AppState();
                const gym = new Gym(v1.name ?? 'My Gym', v1.numCourts ?? 2);
                gym.pool = (v1.pool ?? []).map((p) => new Player(p.name, p.id));
                gym.presentIds = new Set(v1.presentIds ?? []);
                state.gyms = [gym];
                state.activeGymId = gym.id;
                return state;
            }
        }
        catch { /* fall through */ }
        const state = new AppState();
        state.addGym('My Gym');
        return state;
    }
}
function fisherYates(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

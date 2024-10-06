import {
    GameState,
    Player,
    TerritoryStateMap,
    TurnState
} from "@/game/types"
import {
    NewAction, newActionToAction,
    TerritoryName
} from "@/game/schema"
import {ServerGame} from "@/game/state";
import {updateGame} from "@/state/client";
import {META, territoriesAreAdjacent} from "@/game/meta";


export class ClientGame {
    constructor(
        private readonly playerOrdinal: number,
        private readonly state: GameState
    ) {}

    private get isActive() {
        return this.state.turn.playerOrdinal === this.playerOrdinal
    }

    get id() {
        return this.state.id
    }

    get gameState() {
        return this.state
    }

    clone() {
        return new ClientGame(this.playerOrdinal, this.state)
    }

    get territories(): TerritoryStateMap {
        return { ...this.state.territories }
    }

    get playerTurn(): TurnState | null {
        if (!this.isActive) {
            return null
        }
        return this.state.turn
    }

    get selectedTerritory(): TerritoryName | null {
        if (!this.isActive) {
            return null
        }
        switch (this.state.turn.phase) {
            case "deploy":
                return this.state.turn.selected?.territory || null
            case 'attack':
                return this.state.turn.selected?.territoryFrom || null
            default:
                throw new Error('not implemented')
        }
    }

    sync(serverState: GameState): ClientGame {
        if (serverState.events.length > this.state.events.length) {
            return new ClientGame(this.playerOrdinal, serverState)
        }
        return this
    }

    async update(newAction: NewAction): Promise<ClientGame> {
        if (!this.isActive) {
            return this
        }

        try {
            const newState = await updateGame(this.state.id, newAction)
            if (newState === null) {
                console.error('server cannot find game')
                return this
            }
            return new ClientGame(this.playerOrdinal, newState)
        } catch (error) {
            console.error('could not update local game', error)
            return this
        }
    }

    deSelect(): ClientGame {
        if (!this.isActive) {
            return this
        }

        const turn = this.state.turn
        switch (turn.phase) {
            case "deploy":
            case "attack":
                if (turn.selected) {
                    delete turn.selected
                    return this.clone()
                }
                return this
            default:
                throw new Error('not implemented')
        }
    }

    allowSelect(name: TerritoryName): boolean {
        if (!this.isActive) {
            return false
        }
        const turn = this.state.turn
        const occupied = this.isOccupied(name)
        switch (turn.phase) {
            case "deploy":
                return occupied
            case 'attack':
                if (!turn.selected) {
                    return occupied // select territory from, can only be occupied territory
                }
                // cannot attack occupied territory or territory that is not adjacent
                return !occupied && territoriesAreAdjacent(turn.selected.territoryFrom, name)
            default:
                throw new Error('not implemented')
        }
    }

    selectTerritory(territory: TerritoryName): ClientGame {
        if (!this.allowSelect(territory)) {
            return this
        }

        const turn = this.state.turn
        switch (turn.phase) {
            case "deploy":
                if (turn.selected?.territory !== territory) {
                    turn.selected = {
                        territory,
                        armies: turn.armiesRemaining
                    }
                    return this.clone()
                }
                return this
            case 'attack':
                if (!turn.selected) {
                    // select territory from
                    turn.selected = {
                        territoryFrom: territory,
                        territoryTo: null
                    }
                    return this.clone()
                } else {
                    turn.selected.territoryTo = territory
                    console.log(turn.selected)
                    return this.clone()
                }
            default:
                throw new Error('not implemented')
        }
    }

    private isOccupied(name: TerritoryName): boolean {
        return this.state.territories[name].owner === this.playerOrdinal
    }
}

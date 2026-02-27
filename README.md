# poker-game-state

> **Repo**: [`jerroldneal/poker-game-state`](https://github.com/jerroldneal/poker-game-state) · **Submodule of**: [`cnr-ws-server`](https://github.com/jerroldneal/cnr-ws-server) at `submodules/poker-game-state/`

Poker game state tracker that accumulates events into a coherent game model. Protocol-agnostic — accepts generic `{ type, data }` events with a convenience adapter for protobuf-formatted events.

## Usage

### Node.js (CommonJS)

```javascript
const { GameState, Phase } = require('poker-game-state');

const gs = new GameState();

// Generic event interface
gs.applyEvent({ type: 'DealerPosMsg', data: { dealerPos: 3, sbPos: 4, bbPos: 5 } });
gs.applyEvent({ type: 'HoleCardsMsg', data: { userId: 'hero', cards: [0x0C, 0x1B] } });

// Protobuf adapter (convenience)
gs.applyProtoEvent({ ns: 'holdem', topic: 'NeedActionMsg', data: { seatNum: 3, optAction: 6 } });

// Query state
console.log(gs.phase);       // 'preflop'
console.log(gs.isHeroTurn);  // true/false
console.log(gs.totalPot);    // number
console.log(gs.toJSON());    // full snapshot
```

### Browser (inject)

```html
<script src="inject/game-state.js"></script>
<script>
  var gs = new window.__PokerGameState.GameState();
  gs.applyEvent({ type: 'DealerPosMsg', data: { dealerPos: 0 } });
</script>
```

## Event Types

| Event | Key Fields |
|-------|-----------|
| `UserTokenReq` | `userId` |
| `EnterRoomRes` | `code`, `roomId`, `bb`, `sb` |
| `RoomSnapshotMsg` | `players[]`, `dealerPos`, `sbPos`, `bbPos`, `pots` |
| `DealerPosMsg` | `dealerPos`, `sbPos`, `bbPos`, `seats[]` |
| `HoleCardsMsg` | `userId`, `cards` |
| `BoardCardsMsg` | `cards`, `roomState` |
| `NeedActionMsg` | `seatNum`, `optAction`, `optCoin`, `minBetCoin`, `maxBetCoin` |
| `PlayerActionMsg` | `seatNum`, `action`, `deskCoin` |
| `PotsMsg` | `pots[]` |
| `SeatOccupiedMsg` | `seatNum`, `userId`, `nickName`, `coin` |
| `SeatEmptyMsg` / `PlayerLeaveMsg` | `seatNum` |
| `ShowdownMsg` | — |
| `RoundResultMsg` | `players[].seatNum`, `players[].profit` |

## License

MIT

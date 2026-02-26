/**
 * poker-game-state — Poker Game State Tracker
 *
 * Accumulates game events into a coherent poker game model.
 * Protocol-agnostic: accepts { type, data } events.
 * Consumers provide thin adapters to map their event format.
 *
 * Usage (generic):
 *   const GameState = require('poker-game-state');
 *   const gs = new GameState();
 *   gs.applyEvent({ type: 'DealerPosMsg', data: { dealerPos: 3, sbPos: 4, bbPos: 5 } });
 *
 * Usage (protobuf adapter):
 *   gs.applyProtoEvent({ ns: 'holdem', topic: 'DealerPosMsg', data: {...} });
 */
'use strict';

const Phase = { IDLE: 'idle', PREFLOP: 'preflop', FLOP: 'flop', TURN: 'turn', RIVER: 'river', SHOWDOWN: 'showdown' };

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.roomId     = null;
    this.bb         = 0;
    this.sb         = 0;

    this.heroUserId = null;
    this.heroSeat   = null;

    this.phase        = Phase.IDLE;
    this.handNumber   = 0;
    this.dealerPos    = -1;
    this.sbPos        = -1;
    this.bbPos        = -1;
    this.pots         = [0];
    this.currentAct   = null;

    this.holeCardStrings   = [];
    this.boardCardStrings  = [];

    this.holeCardBytes  = null;
    this.boardCardBytes = null;

    this.seats = {};
    this.actionHistory = [];

    this.handsPlayed  = 0;
    this.handsWon     = 0;
    this.netProfit    = 0;
  }

  /**
   * Apply a generic game event.
   * @param {{ type: string, data: object }} evt
   */
  applyEvent(evt) {
    if (!evt || !evt.type) return;
    try {
      this._handle(evt.type, evt.data || {});
    } catch (e) {
      // Never throw from applyEvent
    }
  }

  /**
   * Apply a protobuf-formatted event (convenience adapter).
   * @param {{ ns: string, topic: string, data: object }} evt
   */
  applyProtoEvent(evt) {
    if (!evt || !evt.topic) return;
    this.applyEvent({ type: evt.topic, data: evt.data || {} });
  }

  _handle(type, d) {
    switch (type) {

      case 'UserTokenReq':
        if (d.userId) this.heroUserId = d.userId;
        break;

      case 'SitDownRes':
        break;

      case 'EnterRoomRes':
        if (d.code === 0) {
          this.roomId = d.roomId || this.roomId;
          this.bb     = d.bb    || this.bb;
          this.sb     = d.sb    || this.sb;
        }
        break;

      case 'RoomSnapshotMsg':
        this.roomId    = d.roomId    ?? this.roomId;
        this.dealerPos = d.dealerPos ?? this.dealerPos;
        this.sbPos     = d.sbPos     ?? this.sbPos;
        this.bbPos     = d.bbPos     ?? this.bbPos;
        this.pots      = d.pots      || this.pots;
        if (d.state !== undefined) {
          this.phase = this._stateToPhase(d.state);
        }
        if (Array.isArray(d.players)) {
          for (const p of d.players) {
            this.seats[p.seatNum] = {
              userId:   p.userId,
              nickName: p.nickName || '',
              deskCoin: p.deskCoin || 0,
              leftCoin: p.leftCoin || 0,
              state:    p.state    || 0,
              seatNum:  p.seatNum,
            };
            if (this.heroUserId && p.userId === this.heroUserId) {
              this.heroSeat = p.seatNum;
            }
          }
        }
        if (d.currAct) this.currentAct = this._normalizeAct(d.currAct);
        if (d.boardCards) this.boardCardBytes = d.boardCards;
        if (d.holeCards)  this.holeCardBytes  = d.holeCards;
        break;

      case 'DealerPosMsg':
        this.dealerPos = d.dealerPos ?? this.dealerPos;
        this.sbPos     = d.sbPos     ?? this.sbPos;
        this.bbPos     = d.bbPos     ?? this.bbPos;
        this.phase           = Phase.PREFLOP;
        this.holeCardStrings  = [];
        this.boardCardStrings = [];
        this.holeCardBytes    = null;
        this.boardCardBytes   = null;
        this.currentAct       = null;
        this.actionHistory    = [];
        this.pots             = [0];
        this.handNumber++;
        if (Array.isArray(d.seats)) {
          for (const s of d.seats) {
            if (this.seats[s.seatNum]) this.seats[s.seatNum].deskCoin = s.coin ?? this.seats[s.seatNum].deskCoin;
          }
        }
        break;

      case 'HoleCardsMsg':
        this.holeCardBytes = d.cards;
        if (this.heroUserId && d.userId && d.userId !== this.heroUserId) break;
        if (!this.heroUserId && d.userId) {
          this.heroUserId = d.userId;
        }
        break;

      case 'BoardCardsMsg':
        this.boardCardBytes = d.cards;
        if      (d.roomState === 2) { this.phase = Phase.FLOP; }
        else if (d.roomState === 3) { this.phase = Phase.TURN; }
        else if (d.roomState === 4) { this.phase = Phase.RIVER; }
        break;

      case 'NeedActionMsg':
        this.currentAct = {
          seatNum:     d.seatNum,
          optAction:   d.optAction,
          optCoin:     d.optCoin     || 0,
          minBetCoin:  d.minBetCoin  || 0,
          maxBetCoin:  d.maxBetCoin  || 0,
          countDown:   d.countDown   || 30,
          deskCoin:    d.deskCoin    || 0,
        };
        break;

      case 'PotsMsg':
        this.pots = d.pots || this.pots;
        break;

      case 'PlayerActionMsg':
        if (d.seatNum !== undefined && this.seats[d.seatNum]) {
          this.seats[d.seatNum].deskCoin = d.deskCoin ?? this.seats[d.seatNum].deskCoin;
          this.seats[d.seatNum].leftCoin = d.leftCoin ?? this.seats[d.seatNum].leftCoin;
        }
        this.actionHistory.push({
          ts:      Date.now(),
          seatNum: d.seatNum,
          action:  d.action,
          coin:    d.deskCoin,
        });
        break;

      case 'SeatOccupiedMsg':
        this.seats[d.seatNum] = {
          userId:   d.userId,
          nickName: d.nickName || '',
          deskCoin: d.coin     || 0,
          leftCoin: 0,
          state:    0,
          seatNum:  d.seatNum,
        };
        if (this.heroUserId && d.userId === this.heroUserId) {
          this.heroSeat = d.seatNum;
        }
        break;

      case 'SeatEmptyMsg':
      case 'PlayerLeaveMsg':
        delete this.seats[d.seatNum];
        break;

      case 'PlayerStateMsg':
        if (this.seats[d.seatNum]) this.seats[d.seatNum].state = d.state;
        break;

      case 'ShowdownMsg':
        this.phase = Phase.SHOWDOWN;
        break;

      case 'RoundResultMsg':
        this.phase      = Phase.IDLE;
        this.currentAct = null;
        this.handsPlayed++;
        if (Array.isArray(d.players)) {
          const heroResult = d.players.find(p => p.seatNum === this.heroSeat);
          if (heroResult) {
            const profit = heroResult.profit || 0;
            this.netProfit += profit;
            if (profit > 0) this.handsWon++;
          }
        }
        break;
    }
  }

  _stateToPhase(state) {
    const map = { 1: Phase.PREFLOP, 2: Phase.FLOP, 3: Phase.TURN, 4: Phase.RIVER, 5: Phase.SHOWDOWN };
    return map[state] || Phase.IDLE;
  }

  _normalizeAct(a) {
    return {
      seatNum:    a.seatNum,
      optAction:  a.optAction || 0,
      optCoin:    a.optCoin   || 0,
      minBetCoin: a.minBetCoin     || 0,
      maxBetCoin: a.maxBetCoin     || 0,
      countDown:  a.countdownLeft  || a.countdownTotal || 30,
      deskCoin:   0,
    };
  }

  get isHeroTurn() {
    return !!(this.currentAct && this.heroSeat !== null && this.currentAct.seatNum === this.heroSeat);
  }

  get totalPot() {
    return this.pots.reduce((s, p) => s + (p || 0), 0);
  }

  get heroStack() {
    if (this.heroSeat === null || !this.seats[this.heroSeat]) return 0;
    return this.seats[this.heroSeat].deskCoin || 0;
  }

  get activeSeatCount() {
    return Object.values(this.seats).filter(s => s.state !== 4).length;
  }

  toJSON() {
    return {
      roomId:        this.roomId,
      heroSeat:      this.heroSeat,
      heroUserId:    this.heroUserId,
      phase:         this.phase,
      handNumber:    this.handNumber,
      holeCards:     this.holeCardStrings,
      boardCards:    this.boardCardStrings,
      pots:          this.pots,
      totalPot:      this.totalPot,
      dealerPos:     this.dealerPos,
      sbPos:         this.sbPos,
      bbPos:         this.bbPos,
      bb:            this.bb,
      sb:            this.sb,
      seats:         this.seats,
      currentAct:    this.currentAct,
      isHeroTurn:    this.isHeroTurn,
      heroStack:     this.heroStack,
      activePlayers: this.activeSeatCount,
      actionHistory: this.actionHistory,
      stats:         { handsPlayed: this.handsPlayed, handsWon: this.handsWon, netProfit: this.netProfit },
    };
  }
}

module.exports = { GameState, Phase };

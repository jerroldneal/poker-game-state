/**
 * poker-game-state (browser IIFE)
 *
 * Exposes window.__PokerGameState = { GameState, Phase }
 * Protocol-agnostic: accepts { type, data } events.
 *
 * Usage:
 *   const gs = new window.__PokerGameState.GameState();
 *   gs.applyEvent({ type: 'DealerPosMsg', data: { dealerPos: 3 } });
 *   gs.applyProtoEvent({ ns: 'holdem', topic: 'HoleCardsMsg', data: {...} });
 */
var __pokerGameStateResult = (function () {
  'use strict';

  if (window.__PokerGameState) return 'already_installed';

  var Phase = { IDLE: 'idle', PREFLOP: 'preflop', FLOP: 'flop', TURN: 'turn', RIVER: 'river', SHOWDOWN: 'showdown' };

  function GameState() {
    this.reset();
  }

  GameState.prototype.reset = function () {
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
  };

  GameState.prototype.applyEvent = function (evt) {
    if (!evt || !evt.type) return;
    try { this._handle(evt.type, evt.data || {}); } catch (e) {}
  };

  GameState.prototype.applyProtoEvent = function (evt) {
    if (!evt || !evt.topic) return;
    this.applyEvent({ type: evt.topic, data: evt.data || {} });
  };

  GameState.prototype._handle = function (type, d) {
    switch (type) {
      case 'UserTokenReq':
        if (d.userId) this.heroUserId = d.userId;
        break;
      case 'EnterRoomRes':
        if (d.code === 0) { this.roomId = d.roomId || this.roomId; this.bb = d.bb || this.bb; this.sb = d.sb || this.sb; }
        break;
      case 'RoomSnapshotMsg':
        this.roomId    = d.roomId    != null ? d.roomId    : this.roomId;
        this.dealerPos = d.dealerPos != null ? d.dealerPos : this.dealerPos;
        this.sbPos     = d.sbPos     != null ? d.sbPos     : this.sbPos;
        this.bbPos     = d.bbPos     != null ? d.bbPos     : this.bbPos;
        this.pots      = d.pots      || this.pots;
        if (d.state !== undefined) this.phase = this._stateToPhase(d.state);
        if (Array.isArray(d.players)) {
          for (var i = 0; i < d.players.length; i++) {
            var p = d.players[i];
            this.seats[p.seatNum] = { userId: p.userId, nickName: p.nickName || '', deskCoin: p.deskCoin || 0, leftCoin: p.leftCoin || 0, state: p.state || 0, seatNum: p.seatNum };
            if (this.heroUserId && p.userId === this.heroUserId) this.heroSeat = p.seatNum;
          }
        }
        if (d.currAct) this.currentAct = this._normalizeAct(d.currAct);
        if (d.boardCards) this.boardCardBytes = d.boardCards;
        if (d.holeCards) this.holeCardBytes = d.holeCards;
        break;
      case 'DealerPosMsg':
        this.dealerPos = d.dealerPos != null ? d.dealerPos : this.dealerPos;
        this.sbPos     = d.sbPos     != null ? d.sbPos     : this.sbPos;
        this.bbPos     = d.bbPos     != null ? d.bbPos     : this.bbPos;
        this.phase = Phase.PREFLOP;
        this.holeCardStrings = []; this.boardCardStrings = [];
        this.holeCardBytes = null; this.boardCardBytes = null;
        this.currentAct = null; this.actionHistory = []; this.pots = [0];
        this.handNumber++;
        if (Array.isArray(d.seats)) {
          for (var j = 0; j < d.seats.length; j++) {
            var s = d.seats[j];
            if (this.seats[s.seatNum]) this.seats[s.seatNum].deskCoin = s.coin != null ? s.coin : this.seats[s.seatNum].deskCoin;
          }
        }
        break;
      case 'HoleCardsMsg':
        this.holeCardBytes = d.cards;
        if (this.heroUserId && d.userId && d.userId !== this.heroUserId) break;
        if (!this.heroUserId && d.userId) this.heroUserId = d.userId;
        break;
      case 'BoardCardsMsg':
        this.boardCardBytes = d.cards;
        if (d.roomState === 2) this.phase = Phase.FLOP;
        else if (d.roomState === 3) this.phase = Phase.TURN;
        else if (d.roomState === 4) this.phase = Phase.RIVER;
        break;
      case 'NeedActionMsg':
        this.currentAct = { seatNum: d.seatNum, optAction: d.optAction, optCoin: d.optCoin || 0, minBetCoin: d.minBetCoin || 0, maxBetCoin: d.maxBetCoin || 0, countDown: d.countDown || 30, deskCoin: d.deskCoin || 0 };
        break;
      case 'PotsMsg':
        this.pots = d.pots || this.pots;
        break;
      case 'PlayerActionMsg':
        if (d.seatNum !== undefined && this.seats[d.seatNum]) {
          this.seats[d.seatNum].deskCoin = d.deskCoin != null ? d.deskCoin : this.seats[d.seatNum].deskCoin;
          this.seats[d.seatNum].leftCoin = d.leftCoin != null ? d.leftCoin : this.seats[d.seatNum].leftCoin;
        }
        this.actionHistory.push({ ts: Date.now(), seatNum: d.seatNum, action: d.action, coin: d.deskCoin });
        break;
      case 'SeatOccupiedMsg':
        this.seats[d.seatNum] = { userId: d.userId, nickName: d.nickName || '', deskCoin: d.coin || 0, leftCoin: 0, state: 0, seatNum: d.seatNum };
        if (this.heroUserId && d.userId === this.heroUserId) this.heroSeat = d.seatNum;
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
        this.phase = Phase.IDLE; this.currentAct = null; this.handsPlayed++;
        if (Array.isArray(d.players)) {
          var hr = null;
          for (var k = 0; k < d.players.length; k++) { if (d.players[k].seatNum === this.heroSeat) { hr = d.players[k]; break; } }
          if (hr) { var profit = hr.profit || 0; this.netProfit += profit; if (profit > 0) this.handsWon++; }
        }
        break;
    }
  };

  GameState.prototype._stateToPhase = function (state) {
    var map = { 1: Phase.PREFLOP, 2: Phase.FLOP, 3: Phase.TURN, 4: Phase.RIVER, 5: Phase.SHOWDOWN };
    return map[state] || Phase.IDLE;
  };

  GameState.prototype._normalizeAct = function (a) {
    return { seatNum: a.seatNum, optAction: a.optAction || 0, optCoin: a.optCoin || 0, minBetCoin: a.minBetCoin || 0, maxBetCoin: a.maxBetCoin || 0, countDown: a.countdownLeft || a.countdownTotal || 30, deskCoin: 0 };
  };

  // Computed property helpers
  GameState.prototype.getIsHeroTurn = function () {
    return !!(this.currentAct && this.heroSeat !== null && this.currentAct.seatNum === this.heroSeat);
  };

  GameState.prototype.getTotalPot = function () {
    var sum = 0;
    for (var i = 0; i < this.pots.length; i++) sum += (this.pots[i] || 0);
    return sum;
  };

  GameState.prototype.getHeroStack = function () {
    if (this.heroSeat === null || !this.seats[this.heroSeat]) return 0;
    return this.seats[this.heroSeat].deskCoin || 0;
  };

  GameState.prototype.getActiveSeatCount = function () {
    var count = 0;
    var keys = Object.keys(this.seats);
    for (var i = 0; i < keys.length; i++) { if (this.seats[keys[i]].state !== 4) count++; }
    return count;
  };

  GameState.prototype.toJSON = function () {
    return {
      roomId: this.roomId, heroSeat: this.heroSeat, heroUserId: this.heroUserId,
      phase: this.phase, handNumber: this.handNumber,
      holeCards: this.holeCardStrings, boardCards: this.boardCardStrings,
      pots: this.pots, totalPot: this.getTotalPot(),
      dealerPos: this.dealerPos, sbPos: this.sbPos, bbPos: this.bbPos,
      bb: this.bb, sb: this.sb, seats: this.seats,
      currentAct: this.currentAct, isHeroTurn: this.getIsHeroTurn(),
      heroStack: this.getHeroStack(), activePlayers: this.getActiveSeatCount(),
      actionHistory: this.actionHistory,
      stats: { handsPlayed: this.handsPlayed, handsWon: this.handsWon, netProfit: this.netProfit },
    };
  };

  window.__PokerGameState = { GameState: GameState, Phase: Phase };
  return 'ok';
})();
if (typeof module !== 'undefined') module.exports = __pokerGameStateResult;
__pokerGameStateResult;

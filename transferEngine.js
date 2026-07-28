// server/transferEngine.js
// Transfer motoru — piyasa, alım-satım.

import { TransferMarket, calculatePlayerValue, calculateWage } from './match/transfer.js';

export class TransferMarketSingleton {
  constructor() {
    this.market = new TransferMarket();
    this.market.refresh();
  }
  refresh() { this.market.refresh(); }
  get players() { return this.market.players; }
}

export function getMarket(gameState) {
  if (!gameState.transferMarket) {
    gameState.transferMarket = new TransferMarket();
    gameState.transferMarket.refresh();
  }
  return gameState.transferMarket;
}

export function buyPlayer(gameState, playerId, fromTeam = null) {
  const market = getMarket(gameState);
  const player = market.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Oyuncu bulunamadı' };

  if (!gameState.userTeam) return { ok: false, error: 'Takım yok' };
  const budget = gameState.userTeam.budget;
  if (budget.budget < player.value) {
    return { ok: false, error: 'Yetersiz bütçe' };
  }

  // Bütçe düş, oyuncuyu kadroya ekle
  budget.spendTransfer(player.value, player.name, gameState.league?.currentWeek || 1);
  player.id = `user_${player.id}_${Date.now()}`;
  player.onField = false;
  gameState.userTeam.players.push(player);

  // Piyasadan çıkar
  const idx = market.players.findIndex(p => p.id === playerId);
  if (idx >= 0) market.players.splice(idx, 1);

  return { ok: true, player, remainingBudget: budget.budget };
}

export function sellPlayer(gameState, playerId, askingPrice) {
  if (!gameState.userTeam) return { ok: false, error: 'Takım yok' };
  const player = gameState.userTeam.players.find(p => p.id === playerId);
  if (!player) return { ok: false, error: 'Oyuncu bulunamadı' };

  // Oyuncu değerinin %80-120'si arası teklif gelir mi?
  const value = calculatePlayerValue(player);
  const offerRatio = askingPrice / value;
  let accept = false;
  let finalPrice = askingPrice;
  if (offerRatio >= 0.9 && offerRatio <= 1.2) accept = true;
  else if (offerRatio > 1.2) { accept = true; finalPrice = value; }

  if (!accept) return { ok: false, error: 'Teklif reddedildi' };

  // Bütçeye ekle, oyuncuyu çıkar
  gameState.userTeam.budget.receiveTransfer(finalPrice, player.name, gameState.league?.currentWeek || 1);
  const idx = gameState.userTeam.players.findIndex(p => p.id === playerId);
  if (idx >= 0) gameState.userTeam.players.splice(idx, 1);

  return { ok: true, price: finalPrice, remainingBudget: gameState.userTeam.budget.budget };
}

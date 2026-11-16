// Wire IDs stay stable; display names are Egyptian Arabic.
export const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const cardTxt = (c) => `${c.r === 1 ? 'A' : c.r <= 10 ? c.r : { 11: 'J', 12: 'Q', 13: 'K' }[c.r]}${SUITS[c.s]}`;
export const rankOf = (txt) => ({ A: 1, J: 11, Q: 12, K: 13 }[txt.slice(0, -1)] ?? Number(txt.slice(0, -1)));
export const cardName = (txt) => `${({ A: 'آس', J: 'ولد', Q: 'بنت', K: 'شايب' }[txt.slice(0, -1)] ?? txt.slice(0, -1).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]))} ${{ '♠': 'بستوني', '♥': 'كبة', '♦': 'ديناري', '♣': 'سباتي' }[txt.slice(-1)]}`;
export const sweep = (card) => rankOf(card) === 11 || card === '7♦';

// Find a legal sum group, preferring more cards. A numeral's target is at most 10.
function group(cards, target) {
  const dp = Array(target + 1).fill(null); dp[0] = [];
  for (const c of cards) {
    const n = rankOf(c);
    if (n > 10 || n > target) continue;
    for (let s = target; s >= n; s--) {
      if (dp[s - n] && (!dp[s] || dp[s - n].length + 1 > dp[s].length)) dp[s] = [...dp[s - n], c];
    }
  }
  return dp[target] ?? [];
}
export function suggestedCapture(card, floor) {
  if (sweep(card)) return [...floor];
  const rank = rankOf(card);
  const chosen = floor.filter(c => rankOf(c) === rank);
  if (rank > 10) return chosen;
  let remaining = floor.filter(c => !chosen.includes(c));
  for (;;) {
    const next = group(remaining, rank);
    if (!next.length) return chosen;
    chosen.push(...next);
    remaining = remaining.filter(c => !next.includes(c));
  }
}
// Validate the player's own grouping, including multiple disjoint sum groups.
export function validCapture(card, selected) {
  if (!selected.length) return true;
  if (sweep(card)) return true;
  const target = rankOf(card);
  const rest = selected.map(rankOf).filter(n => n !== target).sort((a,b) => b-a);
  if (target > 10) return !rest.length;
  if (rest.some(n => n > 10 || n > target) || rest.reduce((a,b)=>a+b,0) % target) return false;
  const failed = new Set();
  function partition(nums) {
    if (!nums.length) return true;
    const key = nums.join(','); if (failed.has(key)) return false;
    // Every partition must put its first (largest) card in a group.
    function complete(start, sum, indices) {
      if (sum === target) {
        const used = new Set(indices);
        return partition(nums.filter((_,i)=>!used.has(i)));
      }
      let prev = -1;
      for (let i=start; i<nums.length; i++) {
        if (nums[i] === prev || sum + nums[i] > target) continue;
        prev = nums[i];
        if (complete(i+1, sum+nums[i], [...indices,i])) return true;
      }
      return false;
    }
    if (complete(1, nums[0], [0])) return true;
    failed.add(key); return false;
  }
  return partition(rest);
}

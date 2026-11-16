# Egyptian Basra / Sab’a el Komi — v0.3.0

The former Boat entry now opens Egyptian Basra (also known as Komi). These are names for the same game family, not two invented game modes. House rules vary; this release explicitly shows the rules it implements.

Rules reference: https://www.pagat.com/fishing/basra.html (Egyptian main rules, checked 16 November 2026).

- Two players or four in two teams. Seats 1 and 3 are partners; seats 2 and 4 are partners. Seat order is arrival order, shown in the lobby and table. Three players cannot start.
- 52 cards, no jokers. Four cards per hand and four on the floor initially. Opening floor excludes jacks and 7♦. Deal four more to each player when all hands empty. Dealer rotates after a scored hand; next seat starts.
- Ace is 1. Numerals capture equal ranks and/or disjoint sum groups. Queens and kings capture their own rank only. Player picks a hand card, reviews a suggested legal capture, and may edit the floor selection before confirming. A card with an available capture cannot be simply dropped. Suggestions are legal, not an optimal-play strategy.
- Jack sweeps without basra. 7♦ sweeps and awards a basra only for an all-numeric floor totaling at most 10. Both remain on an empty floor. Ordinary full-floor capture gives 10. No double/triple jack house rule.
- Last capturer gets the remaining floor, without a basra.
- Majority cards: 30; tied 26–26 carries 30 to the next hand. Each ace and jack: 1; 2♣: 2; 10♦: 3; basra: 10. Hand result shows each category. First team at or above 101 after hand scoring wins if ahead; tied totals continue.
- Hands and undealt deck are private even from the host and display. Server validates card ownership, turn, move number, and sum groups. Duplicate/stale play cannot score twice.
- No turn timeout. Disconnected players retain their seat and hand and can reconnect. Host can end or return to lobby if someone cannot return. Late arrivals watch until a new match.

Validation: unit cases for captures, special sweeps, carry, privacy and replay; 30 simulated complete matches (2 and 4 players); real WebSocket full hand; existing party scoring and chat/reconnect suite.

Operational limit: Render Free can sleep on inactivity. Rooms live in process memory and do not survive deploys/restarts. No paid plan or storage changes were made.

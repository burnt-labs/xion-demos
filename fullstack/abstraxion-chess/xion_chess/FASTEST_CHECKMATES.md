# Fastest Checkmate Sequences for Testing

## 2-Move Checkmate (Fool's Mate) - Fastest possible
**White:** f3 h4  
**Black:** e6 Qh4#  

**Move format for contract:**
1. f2f3 (White)
2. e7e6 (Black) 
3. h2h4 (White)
4. d8h4 (Black - Checkmate!)

## 4-Move Checkmate (Scholar's Mate) - Most common fast mate
**White:** e4 Bc4 Qh5 Qxf7#  
**Black:** e5 Nc6 Nf6??  

**Move format for contract:**
1. e2e4 (White)
2. e7e5 (Black)
3. f1c4 (White) 
4. b8c6 (Black)
5. d1h5 (White)
6. g8f6 (Black)
7. h5f7 (White - Checkmate!)

## 3-Move Checkmate (Légal's Mate variation)
**White:** e4 Nf3 Bc4  
**Black:** e5 d6 f5??  
**White:** Qh5#  

**Move format for contract:**
1. e2e4 (White)
2. e7e5 (Black)
3. g1f3 (White)
4. d7d6 (Black) 
5. f1c4 (White)
6. f7f5 (Black)
7. d1h5 (White - Checkmate!)

## Testing Instructions

1. Create a new game
2. Use the move input field or chess board to make moves in sequence
3. The contract should automatically detect checkmate after the final move
4. Game status should change to "white_won" or "black_won"
5. ELO ratings should be updated automatically

## Expected Behavior

- **Before final move**: Game status = "active"
- **After checkmate move**: 
  - Game status changes to "white_won" or "black_won"
  - No more moves can be made
  - ELO ratings update immediately
  - Players' win/loss records update

## Move Input Format

You can enter moves in the move input field using:
- **Standard notation**: `e2e4` (from square + to square)
- **With promotion**: `e7e8q` (pawn to e8, promote to queen)
- Each move should be 4 characters (5 with promotion)
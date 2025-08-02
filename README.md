
# ShogiHome Modified

A modified version of ShogiHome with enhanced features for shogi (Japanese chess) analysis and practice.

## Features

### 1. Batch File Analysis
**Automated analysis of multiple record files**
- Added `listFile` functionality to API, bridge interface, IPC, and preload.ts
- Disguises the state to call normal analysis process

### 2. Practice Mode (Flash Card Mode)
**Interactive training mode for studying game records**
- **Visual feedback**: Incorrect moves are displayed briefly then removed with 0.5s delay
- **Auto-progression**: Correct moves trigger automatic advancement to opponent's move with 0.5s delay
- **Navigation control**: Previous/Next buttons remain available for manual navigation
- **Hidden move list**: Record list is hidden during practice to prevent spoilers

### 3. Bookmark Tour Mode
**Sequential navigation through bookmarked positions**
- Navigate through all bookmarks in a record sequentially
- Jump to specific pv preview mode at the bookmark in practice mode
- Exit tour mode at any time

### 4. Enhanced Analysis Features
- **0th movement analysis**: Add analysis comments to initial position


### 5. Audio Replacements





## Notes

### Technical Considerations
- Some implementations directly modify internal Vue state (marked for future refactoring)





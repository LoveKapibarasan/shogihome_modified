# How to Run and Test RecordManager Examples

This guide shows you how to run and test the RecordManager examples that demonstrate the main features of the ShogiHome RecordManager class.

## Quick Start

### 1. Run the Tests

The easiest way to verify everything works:

```bash
# Run all tests in the project
npm test

# Run only the RecordManager example tests
npm test record-manager-example

# Run tests with UI for interactive viewing
npm run test:ui

# Run tests with coverage reporting
npm run coverage
```

### 2. Use Examples in Your Code

Import any example function and use it:

```typescript
import { basicRecordManagement, gameImportExample } from '@/examples/record-manager-example.js';

// Create a basic game record
const rm = basicRecordManagement();
console.log('Current ply:', rm.record.current.ply); // 1
console.log('Comment:', rm.record.current.comment); // "Good opening move"

// Import and navigate through a game
const gameRecord = gameImportExample();
console.log('Total moves:', gameRecord.record.moves.length); // 5
```

### 3. Explore Individual Features

Each example demonstrates specific RecordManager capabilities:

```typescript
import {
  commentManagementExample,
  searchInfoExample,
  specialMovesExample
} from '@/examples/record-manager-example.js';

// Different comment behaviors
const comments = commentManagementExample();
console.log(comments.record.current.comment);

// Engine analysis integration
const analysis = searchInfoExample();
console.log(analysis.record.current.comment); // Contains analysis data

// Special moves like resignation
const special = specialMovesExample();
console.log(special.record.moves.length); // Includes resignation move
```

## What You Can Do

### Basic Operations
- ✅ Create new game records
- ✅ Add moves and navigate through games
- ✅ Manage comments with different behaviors
- ✅ Track unsaved changes

### Advanced Features
- ✅ Import games from various formats (KIF, SFEN)
- ✅ Add engine analysis and search information
- ✅ Handle special moves (resignation, etc.)
- ✅ Batch operations for efficiency
- ✅ Game metadata management

### Testing and Validation
- ✅ Comprehensive test suite
- ✅ All examples are thoroughly tested
- ✅ Integration tests demonstrate workflows

## Development Commands

```bash
# Install dependencies and run tests
npm test

# Type checking
npm run lint

# Build the project
npm run compile

# Run in development mode
npm run serve
```

## File Structure

```
src/examples/
├── record-manager-example.ts    # Main examples
├── demo.ts                      # Demo script (console disabled due to linting)
└── README.md                    # Detailed documentation

src/tests/examples/
└── record-manager-example.spec.ts  # Test suite
```

## Example Output

When you run the tests, you'll see output like:

```
✓ RecordManager Examples > basicRecordManagement (4ms)
✓ RecordManager Examples > commentManagementExample (0ms)
✓ RecordManager Examples > searchInfoExample (2ms)
✓ RecordManager Examples > gameImportExample (4ms)
... and more
```

## Next Steps

1. **Explore the examples** - Look at `src/examples/record-manager-example.ts`
2. **Run the tests** - Execute `npm test record-manager-example`
3. **Try your own code** - Import functions and experiment
4. **Read the main docs** - Check `src/examples/README.md` for detailed info

The examples serve as both documentation and working code that you can copy, modify, and use in your own projects!

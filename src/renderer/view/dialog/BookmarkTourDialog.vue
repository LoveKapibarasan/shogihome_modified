<template>
  <DialogFrame @cancel="onClose">
    <BoardView
      class="board-view"
      :board-image-type="appSettings.boardImage"
      :custom-board-image-url="appSettings.boardImageFileURL"
      :board-grid-color="appSettings.boardGridColor || undefined"
      :piece-stand-image-type="appSettings.pieceStandImage"
      :custom-piece-stand-image-url="appSettings.pieceStandImageFileURL"
      :piece-image-url-template="getPieceImageURLTemplate(appSettings)"
      :king-piece-type="appSettings.kingPieceType"
      :board-label-type="appSettings.boardLabelType"
      :max-size="maxSize"
      :position="record.position"
      :last-move="lastMove"
      :flip="flip"
      :black-player-name="t.sente"
      :white-player-name="t.gote"
      :allow-move="true"
      @move="onMove"
    >
      <template #right-control>
        <div class="full column">
          <div class="row control-row">
            <button class="control-item" data-hotkey="Mod+t" @click="doFlip">
              <Icon :icon="IconType.FLIP" />
            </button>
            <button class="control-item" autofocus data-hotkey="Escape" @click="onClose">
              <Icon :icon="IconType.CLOSE" />
            </button>
          </div>

          <div class="row control-row">
            <button
              class="control-item"
              :disabled="currentIndex <= 0"
              :data-hotkey="shortcutKeys.Back"
              @click="previousBookmark"
            >
              <Icon :icon="IconType.BACK" />
            </button>
            <button
              class="control-item"
              :disabled="currentIndex >= bookmarks.length - 1"
              :data-hotkey="shortcutKeys.Forward"
              @click="nextBookmark"
            >
              <Icon :icon="IconType.NEXT" />
            </button>
          </div>
          <div class="row control-row bookmark-info-row">
            <div class="bookmark-info">
              {{ currentBookmarkInfo }}
            </div>
          </div>
        </div>
      </template>
      <template #left-control>
        <div class="full column reverse">
          <button class="control-item-wide" @click="goBegin">
            <Icon :icon="IconType.FIRST" />
          </button>
          <button class="control-item-wide" @click="goBack">
            <Icon :icon="IconType.BACK" />
            <span>{{ t.back }}</span>
          </button>
          <button class="control-item-wide" @click="goForward">
            <Icon :icon="IconType.NEXT" />
          </button>
        </div>
      </template>
    </BoardView>
    <div class="informations">
      <div class="information">
        {{ tourInfo }}
      </div>
      <div class="information">
        <div class="bookmark-details">
          <div class="bookmark-name">{{ currentBookmarkName }}</div>
          <div v-if="showAnswer && currentComment" class="bookmark-comment">
            {{ currentComment }}
          </div>
          <div v-if="!showAnswer" class="quiz-progress">
            正解数: {{ correctMovesCount }} / {{ CORRECT_MOVES_NEEDED }}
          </div>
          <div v-if="debugInfo" class="debug-info">Debug: {{ debugInfo }}</div>
        </div>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { Move, Record } from "tsshogi";
import { onMounted, ref, reactive, computed, onBeforeUnmount, watch } from "vue";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { getPieceImageURLTemplate } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import DialogFrame from "./DialogFrame.vue";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";
import { playPieceBeat } from "@/renderer/devices/audio.js";
import { RecordManager } from "@/renderer/store/record.js";

const emit = defineEmits<{
  close: [];
  next: [];
  prev: [];
}>();

const store = useStore();
const appSettings = useAppSettings();
const maxSize = reactive(new RectSize(0, 0));
const flip = ref(appSettings.boardFlipping);
const record = reactive(new Record());

// Quiz/training mode state
const CORRECT_MOVES_NEEDED = 3;
const correctMovesCount = ref(0);
const showAnswer = ref(false);
const originalPVMoves = ref<Move[]>([]); // Store the original PV moves from analysis
const debugInfo = ref(""); // Debug information for checking PV validation

const bookmarkTourData = computed(() => store.bookmarkTourData);
const bookmarks = computed(() => bookmarkTourData.value?.bookmarks || []);
const currentIndex = computed(() => bookmarkTourData.value?.currentIndex || 0);

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

const updateRecord = () => {
  // Get the current bookmark name
  const currentBookmark = currentBookmarkName.value;
  if (!currentBookmark) {
    record.clear(store.record.position);
    return;
  }

  // Find the bookmarked move
  const bookmarkedMove = store.record.moves.find((move) => move.bookmark === currentBookmark);
  if (!bookmarkedMove) {
    record.clear(store.record.position);
    return;
  }

  console.log("=== BOOKMARK POSITION DEBUG ===");
  console.log("Current bookmark:", currentBookmark);
  console.log("Bookmarked move ply:", bookmarkedMove.ply);
  console.log("Total moves in record:", store.record.moves.length);

  // Get the position AT the bookmark (like PVPreviewDialog's position prop)
  const tempRecord = new Record();
  tempRecord.clear(store.record.initialPosition);
  console.log("Starting from initial position SFEN:", store.record.initialPosition.sfen);
  
  // Replay moves up to the bookmarked move to get the position
  let movesAppended = 0;
  for (const moveRecord of store.record.moves) {
    console.log(`Processing move ply ${moveRecord.ply}, bookmark: ${moveRecord.bookmark || 'none'}`);
    
    // Check for bookmark FIRST, before skipping ply 0
    if (moveRecord.bookmark === currentBookmark) {
      console.log("Found bookmark! Breaking loop.");
      break;
    }
    
    if (moveRecord.ply === 0) {
      console.log("Skipping ply 0 move");
      continue;
    }
    
    if (moveRecord.move && moveRecord.move instanceof Move) {
      console.log(`Appending move ${movesAppended + 1}: ${moveRecord.move.usi}`);
      tempRecord.append(moveRecord.move, { ignoreValidation: true });
      movesAppended++;
    }
  }
  
  // IMPORTANT: For bookmarks on actual moves (not ply 0), we need the position BEFORE the bookmarked move
  // The PV analysis was done BEFORE making the bookmarked move, so we use that position
  console.log("Total moves appended to tempRecord:", movesAppended);
  console.log("Final tempRecord position SFEN:", tempRecord.position.sfen);
  console.log("Turn at position:", tempRecord.position.color === 0 ? "Black/先手" : "White/後手");
  
  // Check if we have a bookmarked move and if we need to play it to get the correct PV position
  if (bookmarkedMove.ply > 0 && bookmarkedMove.move && bookmarkedMove.move instanceof Move) {
    console.log("Playing bookmarked move to get PV position:", bookmarkedMove.move.usi);
    tempRecord.append(bookmarkedMove.move, { ignoreValidation: true });
    console.log("Position after bookmarked move SFEN:", tempRecord.position.sfen);
    console.log("Turn after bookmarked move:", tempRecord.position.color === 0 ? "Black/先手" : "White/後手");
  }
  
  console.log("===========================");

  // NOW mimic PVPreviewDialog: Start with position + add PV moves from analysis comments
  // Clear record with the bookmark position (like PVPreviewDialog does with props.position)
  record.clear(tempRecord.position);

  // Get PV moves from analysis comment at the bookmarked position
  // Create a temporary RecordManager to access the inCommentPVs feature
  const tempMutableRecord = new Record();
  tempMutableRecord.clear(tempRecord.position);
  const tempRecordManager = new RecordManager(tempMutableRecord);

  // Set the comment to the bookmarked move's comment to extract PV
  if (bookmarkedMove.comment) {
    tempMutableRecord.current.comment = bookmarkedMove.comment;
    console.log("=== PV Extraction Debug ===");
    console.log("Bookmark comment:", bookmarkedMove.comment);
    console.log("Position SFEN for PV extraction:", tempRecord.position.sfen);
    console.log("Bookmarked move customData:", bookmarkedMove.customData);
  }

  // Extract PV moves from the comment (this is the actual analysis PV, not game moves)
  const pvArrays = tempRecordManager.inCommentPVs;
  console.log("PV arrays found:", pvArrays.length);
  
  let pvMoves: Move[] = [];
  
  if (pvArrays.length > 0) {
    console.log(
      "First PV array:",
      pvArrays[0].map((m) => m.usi),
    );
    pvMoves = pvArrays[0];
  } else if (bookmarkedMove.comment) {
    // Try to extract PV from Japanese notation in comment
    console.log("Attempting to extract PV from Japanese notation...");
    const pvMatch = bookmarkedMove.comment.match(/#読み筋=(.+)/);
    if (pvMatch) {
      const pvString = pvMatch[1];
      console.log("Found PV string:", pvString);
      
      // Parse Japanese notation PV moves
      try {
        const tempParseRecord = new Record();
        tempParseRecord.clear(tempRecord.position);
        
        // Split by ▲ and △ symbols and parse each move
        const moveStrings = pvString.split(/[▲△]/).filter(s => s.trim());
        console.log("Move strings:", moveStrings);
        
        for (let i = 0; i < Math.min(moveStrings.length, 10); i++) { // Limit to first 10 moves
          const moveStr = moveStrings[i].trim();
          if (moveStr) {
            try {
              // Try to parse the Japanese move notation
              const move = tempParseRecord.position.createMoveByNotation(moveStr);
              if (move) {
                pvMoves.push(move);
                tempParseRecord.append(move, { ignoreValidation: true });
                console.log(`Parsed move ${i + 1}: ${moveStr} -> ${move.usi}`);
              }
            } catch (e) {
              console.log(`Failed to parse move: ${moveStr}`, e);
              break; // Stop on first parsing error
            }
          }
        }
        
        console.log("Extracted PV moves from Japanese notation:", pvMoves.map(m => m.usi));
      } catch (e) {
        console.log("Failed to parse Japanese notation PV:", e);
      }
    }
  }
  
  // Verify first PV move is valid for current position
  if (pvMoves.length > 0) {
    const firstPVMove = pvMoves[0];
    const isValid = tempRecord.position.isValidMove(firstPVMove);
    console.log("First PV move valid for position:", isValid, "Move:", firstPVMove.usi);
  }

  // Limit PV moves for training
  const MAX_TRAINING_MOVES = 6;
  const limitedPVMoves = pvMoves.slice(0, MAX_TRAINING_MOVES);
  console.log(
    "Final PV moves for training:",
    limitedPVMoves.map((m) => m.usi),
  );
  console.log("======================");

  // Add PV moves to record (like PVPreviewDialog does with props.pv)
  for (const move of limitedPVMoves) {
    record.append(move, { ignoreValidation: true });
  }

  // Store the original PV sequence for quiz validation
  originalPVMoves.value = [...limitedPVMoves];

  // Start at 0th move
  record.goto(0);
  
  // Reset quiz state when changing bookmarks
  correctMovesCount.value = 0;
  showAnswer.value = false;
};

onMounted(() => {
  updateSize();
  updateRecord();
  window.addEventListener("resize", updateSize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateSize);
});

// Watch for bookmark changes and update our local record
watch(
  () => currentIndex.value,
  () => {
    updateRecord();
  },
);

const onClose = () => {
  emit("close");
};

const nextBookmark = () => {
  emit("next");
};

const previousBookmark = () => {
  emit("prev");
};

const doFlip = () => {
  flip.value = !flip.value;
};

const onMove = (move: Move) => {
  playPieceBeat(appSettings.pieceVolume);
  // Quiz/training mode behavior
  if (record.position.isValidMove(move)) {
    // Check if this move matches the EXACT next move in the original PV sequence
    const currentPly = record.current.ply;

    // Use the original PV moves array, not the current record moves which might contain wrong moves
    const expectedMove = originalPVMoves.value[currentPly];

    // Console logging for debugging PV validation
    console.log("=== onMove Debug ===");
    console.log("Current ply:", currentPly);
    console.log("User move USI:", move.usi);
    console.log("Expected move USI:", expectedMove?.usi || "none");
    console.log("Original PV length:", originalPVMoves.value.length);
    console.log("Original PV USIs:", originalPVMoves.value.map((m) => m.usi));
    console.log("Record moves length:", record.moves.length);
    console.log("==================");

    // STRICT CHECK: Only accept if it's exactly the next move in our original training PV
    if (expectedMove && expectedMove.equals(move)) {
      console.log("✅ Correct move!");
      // Correct move! Advance through the PV sequence
      record.goForward(); // Play the user's correct move (step 1)
      correctMovesCount.value++;

      // Auto-play opponent's move immediately if it exists in original PV
      const nextOpponentMove = originalPVMoves.value[record.current.ply];
      if (nextOpponentMove) {
        console.log("🤖 Auto-playing opponent move:", nextOpponentMove.usi);
        setTimeout(() => {
          // Play piece sound for opponent's auto-move
          record.goForward(); // Play opponent's move automatically (step 2)
          playPieceBeat(appSettings.pieceVolume);
        }, 500); // 0.5 second delay for opponent auto-play
      }

      // Check if user has made enough correct moves to show answer
      if (correctMovesCount.value >= CORRECT_MOVES_NEEDED) {
        showAnswer.value = true;
      }
    } else {
      console.log("❌ Wrong move!");
      // For incorrect moves, temporarily show the move then delete it properly
      // First append the wrong move so user can see it
      record.append(move);

      // Then properly delete the wrong move (not just navigate back)
      setTimeout(() => {
        // Use removeCurrentMove to actually delete the wrong move from the record
        record.removeCurrentMove();
        console.log("🗑️ Removed wrong move");
      }, 500); // 500ms delay to show the wrong move briefly before deleting it

      // Don't increment correct moves counter for wrong moves
    }
  }
};

const goBegin = () => {
  record.goto(0);
};

const goBack = () => {
  record.goBack();
};

const goForward = () => {
  record.goForward();
};

const currentBookmarkName = computed(() => {
  if (currentIndex.value >= 0 && currentIndex.value < bookmarks.value.length) {
    return bookmarks.value[currentIndex.value];
  }
  return "";
});

const currentComment = computed(() => {
  const currentBookmark = currentBookmarkName.value;
  if (!currentBookmark) {
    return "";
  }
  
  // Find the move with this bookmark and get its comment
  const bookmarkedMove = store.record.moves.find((move) => move.bookmark === currentBookmark);
  return bookmarkedMove?.comment || "";
});

const currentBookmarkInfo = computed(() => {
  return `${currentIndex.value + 1} / ${bookmarks.value.length}: ${currentBookmarkName.value}`;
});

const tourInfo = computed(() => {
  const elements = [];
  elements.push(t.bookmarkTour);
  elements.push(`${t.bookmark}: ${currentBookmarkName.value}`);
  elements.push(`${currentIndex.value + 1} / ${bookmarks.value.length}`);
  return elements.join(" | ");
});

const lastMove = computed(() => {
  const current = record.current;
  return current.move instanceof Move ? current.move : null;
});

const shortcutKeys = computed(() => getRecordShortcutKeys(appSettings.recordShortcutKeys));
</script>

<style scoped>
.board-view {
  margin-left: auto;
  margin-right: auto;
}
.control-row {
  width: 100%;
  height: 25%;
  margin: 0px;
}
.bookmark-info-row {
  height: 25%;
  margin: 0px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.control-item {
  width: 50%;
  height: 100%;
  margin: 0px;
  font-size: 100%;
  padding: 0 5% 0 5%;
}
.control-row:not(:last-child) {
  margin-bottom: 2%;
}
.control-item:not(:last-child) {
  margin-right: 2%;
}
.control-item .icon {
  height: 80%;
  width: auto;
}
.control-item:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.control-item-wide {
  width: 100%;
  height: 33%;
  margin: 0px;
  font-size: 90%;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  line-height: 200%;
  padding: 0 5% 0 5%;
}
.control-item-wide:not(:last-child) {
  margin-bottom: 5%;
}
.control-item-wide .icon {
  height: 68%;
}
.bookmark-info {
  font-size: 12px;
  text-align: center;
  color: var(--text-color);
  background-color: var(--text-bg-color);
  padding: 4px 8px;
  border-radius: 4px;
  max-width: 90%;
  word-wrap: break-word;
}
.informations {
  height: 120px;
  width: 80vw;
  overflow-y: scroll;
  margin-left: auto;
  margin-right: auto;
  margin-top: 5px;
  color: var(--text-color);
  background-color: var(--text-bg-color);
}
.information {
  font-size: 14px;
  margin: 2px;
  text-align: left;
}
.bookmark-details {
  padding: 8px;
}
.bookmark-name {
  font-weight: bold;
  color: var(--active-tab-color);
  margin-bottom: 4px;
}
.bookmark-comment {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
}
.quiz-progress {
  font-size: 12px;
  color: var(--active-tab-color);
  font-weight: bold;
  margin-top: 4px;
}
.debug-info {
  font-size: 10px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  word-break: break-all;
  background-color: var(--main-bg-color);
  padding: 2px 4px;
  border-radius: 2px;
  border: 1px solid var(--border-color);
}
</style>

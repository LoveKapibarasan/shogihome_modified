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
            <button class="control-item" :data-hotkey="shortcutKeys.Begin" @click="goBegin">
              <Icon :icon="IconType.FIRST" />
            </button>
            <button class="control-item" :data-hotkey="shortcutKeys.End" @click="goEnd">
              <Icon :icon="IconType.LAST" />
            </button>
          </div>
          <div class="row control-row">
            <button class="control-item" :data-hotkey="shortcutKeys.Back" @click="goBack">
              <Icon :icon="IconType.BACK" />
            </button>
            <button class="control-item" :data-hotkey="shortcutKeys.Forward" @click="goForward">
              <Icon :icon="IconType.NEXT" />
            </button>
          </div>
          <div class="row control-row">
            <button class="control-item" :disabled="currentIndex <= 0" @click="previousBookmark">
              <Icon :icon="IconType.BACK" />
            </button>
            <button class="control-item" :disabled="currentIndex >= bookmarks.length - 1" @click="nextBookmark">
              <Icon :icon="IconType.NEXT" />
            </button>
          </div>
        </div>
      </template>
      <template #left-control>
        <div class="full column reverse">
          <button class="control-item-wide" :disabled="!enableInsertion" @click="insertToRecord">
            <Icon :icon="IconType.TREE" />
            <span>{{ t.insertToRecord }}</span>
          </button>
          <button class="control-item-wide" :disabled="!enableInsertion" @click="insertToComment">
            <Icon :icon="IconType.NOTE" />
            <span>{{ t.insertToComment }}</span>
          </button>
        </div>
      </template>
    </BoardView>
    <div v-if="correctMovesCount >= CORRECT_MOVES_NEEDED" class="informations">
      <div class="information">
        {{ info }}
      </div>
      <div v-if="extractedEvaluation !== null" class="information evaluation-display">
        評価値: <span :class="evaluationClass">{{ extractedEvaluation }}</span>
      </div>
      <div class="information quiz-progress">
        トレーニング完了! ({{ correctMovesCount }}/{{ CORRECT_MOVES_NEEDED }})
      </div>
      <div class="information">
        <span v-for="(move, index) in displayPV" :key="index">
          <span class="move-element" :class="{ selected: move.selected }"
            >&nbsp;{{ move.text }}&nbsp;</span
          >
        </span>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { Color, Move, ImmutablePosition, Record as TSRecord } from "tsshogi";
import { onMounted, ref, computed, onBeforeUnmount, watch, PropType, reactive } from "vue";
import BoardView from "@/renderer/view/primitive/BoardView.vue";
import Icon from "@/renderer/view/primitive/Icon.vue";
import { RectSize } from "@/common/assets/geometry.js";
import { IconType } from "@/renderer/assets/icons";
import { useAppSettings } from "@/renderer/store/settings";
import { EvaluationViewFrom, getPieceImageURLTemplate } from "@/common/settings/app";
import { t } from "@/common/i18n";
import { useStore } from "@/renderer/store";
import { SearchInfoSenderType, RecordCustomData } from "@/renderer/store/record";
import { CommentBehavior } from "@/common/settings/comment";
import { AppState } from "@/common/control/state";
import { useMessageStore } from "@/renderer/store/message";
import DialogFrame from "./DialogFrame.vue";
import { getRecordShortcutKeys } from "@/renderer/view/primitive/board/shortcut";
import { playPieceBeat } from "@/renderer/devices/audio.js";

const emit = defineEmits<{
  close: [];
  next: [];
  prev: [];
}>();

const props = defineProps({
  position: {
    type: Object as PropType<ImmutablePosition>,
    required: true,
  },
  name: {
    type: String,
    required: false,
    default: undefined,
  },
  multiPv: {
    type: Number,
    required: false,
    default: undefined,
  },
  depth: {
    type: Number,
    required: false,
    default: undefined,
  },
  selectiveDepth: {
    type: Number,
    required: false,
    default: undefined,
  },
  score: {
    type: Number,
    required: false,
    default: undefined,
  },
  mate: {
    type: Number,
    required: false,
    default: undefined,
  },
  lowerBound: {
    type: Boolean,
    required: false,
    default: false,
  },
  upperBound: {
    type: Boolean,
    required: false,
    default: false,
  },
});
const store = useStore();
const messageStore = useMessageStore();
const appSettings = useAppSettings();
const maxSize = reactive(new RectSize(0, 0));
const record = reactive(new TSRecord());
const flip = ref(appSettings.boardFlipping);
const currentIndex = ref(0);
const bookmarks = store.record.bookmarks;

const updateSize = () => {
  maxSize.width = window.innerWidth * 0.8;
  maxSize.height = window.innerHeight * 0.8 - 80;
};

const updateRecord = () => {
  // Find the bookmarked move
  const currentBookmark = bookmarks[currentIndex.value];

  
  // @ts-expect-error - 内部プロパティへの一時的なアクセス
  store._appState = AppState.NORMAL;
  // Jump to the bookmark position to get the correct context
  store.jumpToBookmark(currentBookmark);

  // @ts-expect-error - 内部プロパティへの一時的なアクセス
  store._appState = AppState.BOOKMARK_TOUR;
  
  // Get PVs from the current position's comment BEFORE clearing the record
  const currentPVs = store.inCommentPVs;
  const currentPV = currentPVs.length > 0 ? currentPVs[0] : []; 

  
  // Reset training progress and set CORRECT_MOVES_NEEDED based on PV length
  correctMovesCount.value = 0;
  CORRECT_MOVES_NEEDED = currentPV.length < 3 ? currentPV.length : 3;
  
  // Extract evaluation from customData (same way as existing features)
  const customData = store.record.current.customData as RecordCustomData;
  extractedEvaluation.value = customData?.researchInfo?.score || null;
  
  // Clear record and start from the bookmark position
  record.clear(store.record.position); 
    
  for (const move of currentPV) {
    record.append(move, { ignoreValidation: true });
  }
  record.goto(0);
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
  if (currentIndex.value < bookmarks.length - 1) {
    currentIndex.value++;
  }
  emit("next");
};

const previousBookmark = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  }
  emit("prev");
};

const correctMovesCount = ref(0);
let CORRECT_MOVES_NEEDED = 3;
const extractedEvaluation = ref<number | null>(null);

// Extract evaluation from comment using existing store function  
const getEvaluationFromComment = (comment: string): number | null => {
  const lines = comment.split("\n");
  for (const line of lines) {
    const match = line.match(/^#評価値=([+-]?[.0-9]+)/);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
};

const onMove = (move: Move) => {
  // Use the next move in the PV as the expected move
  const expectedMove = record.moves[record.current.ply + 1]?.move;

  record.append(move);
  playPieceBeat(appSettings.pieceVolume);
  // Quiz/training mode behavior
  // STRICT CHECK: Only accept if it's exactly the next move in our original training PV
  // Log expected and input moves in a robust, readable way
  const squareToString = (sq: any) => {
    if (!sq) return undefined;
    if (typeof sq.file === "number" && typeof sq.rank === "number") {
      // 9x9将棋座標: file=9が左端, rank=1が上
      // rank: 1->a, 2->b, ... 9->i
      return `${sq.file}${String.fromCharCode(96 + sq.rank)}`;
    }
    if (typeof sq.toString === "function") {
      return sq.toString();
    }
    return String(sq);
  };
  const formatMoveForLog = (m: any) => {
    if (!m) return m;
    const fromStr = squareToString(m.from);
    const toStr = squareToString(m.to);
    let displayText = m.displayText;
    if (!displayText && fromStr && toStr) {
      displayText = `${fromStr}${toStr}${m.promote ? "+" : ""}`;
    }
    return {
      displayText,
      from: fromStr,
      to: toStr,
      promote: m.promote,
      color: m.color,
      pieceType: m.pieceType,
    };
  };
  console.log("[BookmarkTour] 正解手:", formatMoveForLog(expectedMove));
  console.log("[BookmarkTour] 入力手:", formatMoveForLog(move));
  if (expectedMove && expectedMove instanceof Move && expectedMove.equals(move)) {
    // Correct move! Advance through the PV sequence
    correctMovesCount.value++;
    // Auto-play opponent's move immediately if it exists in original PV
    setTimeout(() => {
      // Play piece sound for opponent's auto-move
      record.goForward(); // Play opponent's move automatically (step 2)
      playPieceBeat(appSettings.pieceVolume);
      console.log("[BookmarkTour] 相手手を自動再生");
    }, 500); // 0.5 second delay for opponent auto-play
  } else {
    // Then properly delete the wrong move (not just navigate back)
    console.log("[BookmarkTour] 不正解手: ", move);
    setTimeout(() => {
      // Use removeCurrentMove to actually delete the wrong move from the record
      record.removeCurrentMove();
      console.log("[BookmarkTour] 不正解手を削除");
    }, 500); // 500ms delay to show the wrong move briefly before deleting it
  }
};
const goBegin = () => {
  record.goto(0);
};

const goEnd = () => {
  record.goto(Number.MAX_SAFE_INTEGER);
};

const goBack = () => {
  record.goBack();
};

const goForward = () => {
  record.goForward();
};

const doFlip = () => {
  flip.value = !flip.value;
};

const getDisplayScore = (score: number, color: Color, evaluationViewFrom: EvaluationViewFrom) => {
  return evaluationViewFrom === EvaluationViewFrom.EACH || color == Color.BLACK ? score : -score;
};

const info = computed(() => {
  const elements = [];
  if (props.name) {
    elements.push(`${props.name}`);
  }
  if (props.depth !== undefined) {
    elements.push(`深さ=${props.depth}`);
  }
  if (props.selectiveDepth !== undefined) {
    elements.push(`選択的深さ=${props.selectiveDepth}`);
  }
  if (props.score !== undefined) {
    elements.push(
      `評価値=${getDisplayScore(props.score, props.position.color, appSettings.evaluationViewFrom)}`,
    );
    if (props.lowerBound) {
      elements.push("（下界値）");
    }
    if (props.upperBound) {
      elements.push("（上界値）");
    }
  }
  if (props.mate !== undefined) {
    elements.push(
      `詰み手数=${getDisplayScore(
        props.mate,
        props.position.color,
        appSettings.evaluationViewFrom,
      )}`,
    );
  }
  if (props.multiPv) {
    elements.push(`順位=${props.multiPv}`);
  }
  return elements.join(" / ");
});

const lastMove = computed(() => (record.current.move instanceof Move ? record.current.move : null));

const displayPV = computed(() => {
  return record.moves.slice(1).map((move) => {
    return {
      text: move.displayText,
      selected: move.ply === record.current.ply,
    };
  });
});

const enableInsertion = computed(() => {
  return store.appState === AppState.NORMAL && store.record.position.sfen === props.position.sfen;
});

const shortcutKeys = computed(() => getRecordShortcutKeys(appSettings.recordShortcutKeys));

// Evaluation display
const evaluationClass = computed(() => {
  if (extractedEvaluation.value !== null) {
    const score = extractedEvaluation.value;
    if (score > 300) return "eval-positive";
    if (score < -300) return "eval-negative";
    return "eval-neutral";
  }
  return "";
});

const insertToRecord = () => {
  // Get current PV from the bookmark position
  const currentPVs = store.inCommentPVs;
  const currentPV = currentPVs.length > 0 ? currentPVs[0] : [];
  
  const n = store.appendMovesSilently(currentPV, {
    ignoreValidation: true,
  });
  messageStore.enqueue({
    text: t.insertedNMovesToRecord(n),
  });
};

const insertToComment = () => {
  // Get current PV from the bookmark position
  const currentPVs = store.inCommentPVs;
  const currentPV = currentPVs.length > 0 ? currentPVs[0] : [];
  
  store.appendSearchComment(
    SearchInfoSenderType.RESEARCHER,
    {
      depth: props.depth,
      score: props.score && props.score * (props.position.color == Color.BLACK ? 1 : -1),
      mate: props.mate,
      pv: currentPV,
    },
    CommentBehavior.APPEND,
    { engineName: props.name },
  );
  messageStore.enqueue({
    text: t.insertedComment,
  });
};
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

.evaluation-display {
  font-weight: bold;
}

.eval-positive {
  color: #4caf50;
  font-weight: bold;
}

.eval-negative {
  color: #f44336;
  font-weight: bold;
}

.eval-neutral {
  color: var(--text-color);
  font-weight: bold;
}
</style>

<template>
  <DialogFrame @cancel="onCancel">
    <div class="root">
      <div class="title">連続解析</div>
      <div class="form-group">
        <div>{{ t.searchEngine }}</div>
        <PlayerSelector
          v-model:player-uri="engineURI"
          :engines="engines"
          :default-tag="getPredefinedUSIEngineTag('research')"
          :display-thread-state="true"
          :display-multi-pv-state="true"
          @update-engines="onUpdatePlayerSettings"
        />
      </div>
      <div class="form-group">
        <div>入力フォルダ</div>
        <div class="form-item">
          <input
            v-model="inputFolder"
            class="folder-input"
            type="text"
            placeholder="KIFファイルが格納されているフォルダを選択"
          />
          <button class="folder-button" @click="onSelectInputFolder">参照</button>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.startEndCriteria }}</div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.startCriteria.enableNumber" />
          <div class="form-item-small-label">{{ t.fromPrefix }}{{ t.plyPrefix }}</div>
          <input
            v-model.number="settings.startCriteria.number"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!settings.startCriteria.enableNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.fromSuffix }}</div>
        </div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.endCriteria.enableNumber" />
          <div class="form-item-small-label">{{ t.toPrefix }}{{ t.plyPrefix }}</div>
          <input
            v-model.number="settings.endCriteria.number"
            class="small"
            type="number"
            min="1"
            step="1"
            :disabled="!settings.endCriteria.enableNumber"
          />
          <div class="form-item-small-label">{{ t.plySuffix }}{{ t.toSuffix }}</div>
        </div>
        <div class="form-item">
          <ToggleButton v-model:value="settings.descending" :label="t.descending" />
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.endCriteria1Move }}</div>
        <div class="form-item">
          <div class="form-item-small-label">{{ t.toPrefix }}</div>
          <input
            v-model.number="settings.perMoveCriteria.maxSeconds"
            class="small"
            type="number"
            min="0"
            step="1"
          />
          <div class="form-item-small-label">{{ t.secondsSuffix }}{{ t.toSuffix }}</div>
        </div>
      </div>
      <div class="form-group">
        <div>{{ t.outputSettings }}</div>
        <div class="form-item">
          <div class="form-item-label-wide">{{ t.moveComments }}</div>
          <HorizontalSelector
            v-model:value="settings.commentBehavior"
            class="selector"
            :items="[
              { value: CommentBehavior.NONE, label: t.noOutputs },
              { value: CommentBehavior.INSERT, label: t.insertCommentToTop },
              { value: CommentBehavior.APPEND, label: t.appendCommentToBottom },
              { value: CommentBehavior.OVERWRITE, label: t.overwrite },
            ]"
          />
        </div>
      </div>
      <div class="main-buttons">
        <button data-hotkey="Enter" autofocus @click="onStart()">開始</button>
        <button data-hotkey="Escape" @click="onCancel()">
          {{ t.cancel }}
        </button>
      </div>
    </div>
  </DialogFrame>
</template>

<script setup lang="ts">
import { t } from "@/common/i18n";
import api from "@/renderer/ipc/api";
import { defaultAnalysisSettings, validateAnalysisSettings } from "@/common/settings/analysis";
import { CommentBehavior } from "@/common/settings/comment";
import { getPredefinedUSIEngineTag, USIEngines } from "@/common/settings/usi";
import { useStore } from "@/renderer/store";
import { onMounted, ref, watch } from "vue";
import PlayerSelector from "@/renderer/view/dialog/PlayerSelector.vue";
import ToggleButton from "@/renderer/view/primitive/ToggleButton.vue";
import HorizontalSelector from "@/renderer/view/primitive/HorizontalSelector.vue";
import { useErrorStore } from "@/renderer/store/error";
import { useBusyState } from "@/renderer/store/busy";
import { AppState } from "@/common/control/state";
import DialogFrame from "./DialogFrame.vue";
import { useMessageStore } from "@/renderer/store/message";
const store = useStore();
const busyState = useBusyState();
const settings = ref(defaultAnalysisSettings());
const engines = ref(new USIEngines());
const engineURI = ref("");

// 連続解析用の追加データ
const inputFolder = ref("");

busyState.retain();
onMounted(async () => {
  try {
    settings.value = await api.loadAnalysisSettings();
    engines.value = await api.loadUSIEngines();
    engineURI.value = settings.value.usi?.uri || "";
  } catch (e) {
    useErrorStore().add(e);
    store.destroyModalDialog();
  } finally {
    busyState.release();
  }
});

// AppState監視による解析完了検知
const waitForAnalysisComplete = (): Promise<void> => {
  return new Promise<void>((resolve) => {
    // AppStateの監視を開始
    const unwatch = watch(
      () => store.appState,
      (newState, oldState) => {
        // ANALYSIS から NORMAL への変化を検知
        if (oldState === AppState.ANALYSIS && newState === AppState.NORMAL) {
          resolve();
          unwatch(); // 監視を停止
        }
      },
    );
  });
};



const onStart = async () => {
  if (!inputFolder.value.trim()) {
    useErrorStore().add("入力フォルダを選択してください");
    return;
  }
  try {
    // 1. 入力フォルダから棋譜ファイルを取得
    const allFiles = await api.listFiles(inputFolder.value, 0); // 直下のファイルのみ
    const recordFiles = allFiles.filter((filePath) => {
      const ext = filePath.toLowerCase().match(/\.(kif|kifu|ki2|ki2u|csa|jkf)$/);
      return ext !== null;
    });

    if (recordFiles.length === 0) {
      useErrorStore().add("入力フォルダに棋譜ファイルが見つかりません");
      return;
    }
    let processedCount = 0;
    let errorCount = 0;
    // 2. 各ファイルを処理
    for (const filePath of recordFiles) {
      try {
        // ファイル読み込みのためにNORMAL状態に偽装
        // @ts-expect-error - 内部プロパティへの一時的なアクセス
        store._appState = AppState.NORMAL;

        // ファイル読み込み
        store.openRecord(filePath);

        // 状態をANALYSIS_DIALOG
        // @ts-expect-error - 内部プロパティへの一時的なアクセス
        store._appState = AppState.ANALYSIS_DIALOG;


        if (!engineURI.value || !engines.value.hasEngine(engineURI.value)) {
          useErrorStore().add(t.engineNotSelected);
          return;
        }
        const engine = engines.value.getEngine(engineURI.value);
        const newSettings = {
          ...settings.value,
          usi: engine,
        };
        const error = validateAnalysisSettings(newSettings);
        if (error) {
          useErrorStore().add(error);
          return;
        }
        // TODO: Understand busyState
        busyState.release();
        console.log(busyState.isBusy);
        store.startAnalysis(newSettings);

        // 解析完了を待つ
        await waitForAnalysisComplete();

        busyState.retain();
        // 解析完了後、状態をBATCH_ANALYSIS_DIALOGに戻す
        // @ts-expect-error - 内部プロパティへの一時的なアクセス
        store._appState = AppState.BATCH_ANALYSIS_DIALOG;
        // 上書き保存
        store.saveRecord({ overwrite: true });

        processedCount++;
      } catch (fileError) {
        useErrorStore().add(`ファイル処理エラー: ${filePath} - ${fileError}`);
        errorCount++;
      }
    }

    useMessageStore().enqueue({
      text: `連続解析完了: 処理=${processedCount}/${recordFiles.length}, エラー=${errorCount}`,
    });
    store.closeModalDialog();
  } catch (error) {
    useErrorStore().add("連続解析中にエラーが発生しました: " + error);
  } 
};

const onCancel = () => {
  store.closeModalDialog();
};

const onUpdatePlayerSettings = async (val: USIEngines) => {
  engines.value = val;
};

const onSelectInputFolder = async () => {
  try {
    const selectedPath = await api.showSelectDirectoryDialog(inputFolder.value || undefined);
    if (selectedPath) {
      inputFolder.value = selectedPath;
    }
  } catch (error) {
    useErrorStore().add("フォルダ選択でエラーが発生しました: " + error);
  }
};
</script>

<style scoped>
.root {
  width: 480px;
}
input.toggle {
  height: 1em;
  width: 1em;
  margin-right: 10px;
}
input.small {
  width: 50px;
}
.folder-input {
  flex: 1;
  min-width: 300px;
  margin-right: 8px;
}
.folder-button {
  padding: 4px 12px;
  border: 1px solid var(--main-color);
  background: var(--main-bg-color);
  color: var(--main-color);
  cursor: pointer;
}
.folder-button:hover {
  background: var(--main-color);
  color: var(--main-bg-color);
}
.selector {
  max-width: 210px;
}
</style>

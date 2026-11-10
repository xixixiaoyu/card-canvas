<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import { parseAtomicMarkdown } from '../../lib/atomic-markdown'
import InlineMarkdown from './InlineMarkdown.vue'

const props = defineProps<{
  content: string
}>()

const emit = defineEmits<{
  toggleTask: [lineIndex: number]
}>()

const blocks = computed(() => parseAtomicMarkdown(props.content))

function toggleTask(lineIndex: number) {
  emit('toggleTask', lineIndex)
}
</script>

<template>
  <div class="atomic-markdown" data-card-selectable>
    <template v-for="(block, blockIndex) in blocks" :key="blockIndex">
      <div
        v-if="block.type === 'blank'"
        class="atomic-blank"
        aria-hidden="true"
      />

      <p v-else-if="block.type === 'paragraph'" class="atomic-paragraph">
        <InlineMarkdown :nodes="block.nodes" />
      </p>

      <ol
        v-else
        class="atomic-list"
        :class="{ 'is-ordered': block.style === 'ordered' }"
      >
        <li
          v-for="item in block.items"
          :key="`${item.type}-${item.lineIndex}`"
          class="atomic-list-item"
          :class="{
            'is-task': item.type === 'task',
            'is-checked': item.checked,
          }"
        >
          <button
            v-if="item.type === 'task'"
            type="button"
            class="atomic-checkbox"
            :class="{ 'is-checked': item.checked }"
            data-card-interactive
            data-task-toggle
            :aria-label="
              item.checked
                ? `取消完成：${item.text || '未命名待办'}`
                : `完成待办：${item.text || '未命名待办'}`
            "
            @pointerdown.stop.prevent
            @click.stop.prevent="toggleTask(item.lineIndex)"
          >
            <Check
              v-if="item.checked"
              :size="9"
              :stroke-width="2.4"
              aria-hidden="true"
            />
          </button>

          <span
            v-else-if="item.type === 'ordered'"
            class="atomic-number"
            aria-hidden="true"
          >
            {{ item.number }}
          </span>

          <span v-else class="atomic-bullet" aria-hidden="true" />

          <span class="atomic-list-copy">
            <InlineMarkdown :nodes="item.nodes" />
          </span>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.atomic-markdown {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
}

.atomic-markdown,
.atomic-paragraph,
.atomic-list-copy {
  user-select: text;
  -webkit-user-select: text;
}

.atomic-paragraph {
  margin: 0;
  white-space: pre-wrap;
  cursor: text;
}

.atomic-blank {
  height: 0.28rem;
}

.atomic-list {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  margin: 0.12rem 0 0.22rem;
  padding: 0;
  list-style: none;
}

.atomic-list-item {
  display: flex;
  align-items: flex-start;
  gap: 0.48rem;
  min-width: 0;
}

.atomic-list-item.is-checked .atomic-list-copy {
  color: rgb(168 162 158);
  text-decoration: line-through;
  text-decoration-color: rgba(168, 162, 158, 0.65);
}

.atomic-checkbox {
  display: flex;
  width: 0.9rem;
  height: 0.9rem;
  flex: none;
  align-items: center;
  justify-content: center;
  margin-top: 0.34rem;
  border: 1px solid rgba(168, 162, 158, 0.7);
  border-radius: 0.27rem;
  background: rgba(255, 255, 255, 0.3);
  color: white;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
  transition:
    transform 120ms ease,
    background-color 150ms ease,
    border-color 150ms ease;
}

.atomic-checkbox:hover {
  border-color: rgba(180, 83, 9, 0.55);
}

.atomic-checkbox:active {
  transform: scale(0.94);
}

.atomic-checkbox:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.38);
  outline-offset: 2px;
}

.atomic-checkbox.is-checked {
  border-color: rgba(180, 83, 9, 0.56);
  background: rgb(217 119 6 / 0.82);
}

.atomic-bullet {
  display: flex;
  width: 0.9rem;
  height: 1.9em;
  flex: none;
  align-items: center;
  justify-content: center;
}

.atomic-bullet::before {
  display: inline-block;
  width: 0.2rem;
  height: 0.2rem;
  border-radius: 9999px;
  background: rgba(120, 113, 108, 0.6);
  content: '';
}

.atomic-number {
  display: flex;
  width: 0.9rem;
  height: 1.9em;
  flex: none;
  align-items: center;
  justify-content: flex-start;
  color: rgba(120, 113, 108, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.74em;
}

.atomic-list-copy {
  min-width: 0;
  flex: 1;
}

.dark .atomic-list-item.is-checked .atomic-list-copy {
  color: rgb(113 113 122);
  text-decoration-color: rgba(113, 113, 122, 0.72);
}

.dark .atomic-checkbox {
  border-color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.025);
}

.dark .atomic-checkbox:hover {
  border-color: rgba(147, 197, 253, 0.55);
}

.dark .atomic-checkbox.is-checked {
  border-color: rgba(147, 197, 253, 0.58);
  background: rgb(125 211 252 / 0.8);
  color: rgb(24 24 27);
}

.dark .atomic-checkbox:focus-visible {
  outline-color: rgba(147, 197, 253, 0.55);
}

.dark .atomic-bullet::before {
  background: rgba(161, 161, 170, 0.62);
}

.dark .atomic-number {
  color: rgba(161, 161, 170, 0.72);
}

@media (prefers-reduced-motion: reduce) {
  .atomic-checkbox {
    transition: none;
  }
}
</style>

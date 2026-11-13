<script setup lang="ts">
import { computed } from 'vue'
import type { Card } from '../../types'
import {
  formatShareDate,
  normalizeShareContent,
  type ShareRatio,
  type ShareTheme,
} from '../../lib/share/presets'

const props = defineProps<{
  card: Card
  theme: ShareTheme
  ratio: ShareRatio
  showTags: boolean
  showDate: boolean
  showWatermark: boolean
}>()

const visibleTags = computed(() => props.card.tags.slice(0, 4))
const hiddenTagCount = computed(() =>
  Math.max(0, props.card.tags.length - visibleTags.value.length),
)
const contentLines = computed(() =>
  normalizeShareContent(props.card.content)
    .split('\n')
    .filter((line, index, lines) => line || lines[index - 1]),
)
const hasTitle = computed(() => Boolean(props.card.title.trim()))
const visibleHighlights = computed(
  () => props.card.highlights?.slice(0, 3) ?? [],
)

const artworkStyle = computed<Record<string, string>>(() => ({
  '--share-bg': props.theme.background,
  '--share-ink': props.theme.ink,
  '--share-muted': props.theme.muted,
  '--share-accent': props.theme.accent,
  '--share-border': props.theme.border,
  '--share-tag-bg': props.theme.tagBackground,
  '--share-tag-ink': props.theme.tagInk,
  '--share-watermark': props.theme.watermark,
  '--share-pattern': props.theme.pattern,
}))
</script>

<template>
  <article
    class="share-artwork"
    :class="`is-${ratio.id}`"
    :style="artworkStyle"
    :data-share-theme="theme.id"
    :data-share-ratio="ratio.id"
    data-share-artwork
  >
    <span class="share-artwork__pattern" aria-hidden="true" />
    <span class="share-artwork__glow" aria-hidden="true" />

    <header class="share-artwork__header">
      <span class="share-artwork__brand">
        <span class="share-artwork__brand-dot" aria-hidden="true" />
        CARD CANVAS
      </span>
      <span v-if="showDate" class="share-artwork__date">
        {{ formatShareDate(card.updatedAt || card.createdAt) }}
      </span>
    </header>

    <main class="share-artwork__main">
      <div class="share-artwork__story">
        <div v-if="showTags && visibleTags.length" class="share-artwork__tags">
          <span
            v-for="tag in visibleTags"
            :key="tag"
            class="share-artwork__tag"
          >
            #{{ tag }}
          </span>
          <span v-if="hiddenTagCount" class="share-artwork__tag is-more">
            +{{ hiddenTagCount }}
          </span>
        </div>

        <template v-if="hasTitle">
          <h1 class="share-artwork__title">{{ card.title }}</h1>
          <span class="share-artwork__rule" aria-hidden="true" />
        </template>

        <div class="share-artwork__body">
          <p
            v-for="(line, index) in contentLines"
            :key="`${index}-${line}`"
            class="share-artwork__line"
          >
            {{ line || '\u00a0' }}
          </p>
        </div>
      </div>

      <section
        v-if="visibleHighlights.length"
        class="share-artwork__highlights"
      >
        <div class="share-artwork__highlights-heading">
          <span>ATOMIC NOTES</span>
          <span>{{ String(visibleHighlights.length).padStart(2, '0') }}</span>
        </div>
        <ul class="share-artwork__highlight-list">
          <li
            v-for="highlight in visibleHighlights"
            :key="highlight.order"
            class="share-artwork__highlight"
          >
            <span class="share-artwork__highlight-order">
              {{ highlight.order }}
            </span>
            <p class="share-artwork__highlight-copy">
              <strong>{{ highlight.label }}</strong>
              <span class="share-artwork__highlight-slash">/</span>
              {{ highlight.text }}
            </p>
          </li>
        </ul>
      </section>
    </main>

    <footer class="share-artwork__footer">
      <span v-if="showWatermark" class="share-artwork__watermark">
        Card Canvas · 让想法有空间生长
      </span>
      <span class="share-artwork__mark" aria-hidden="true">
        <span>{{ String(ratio.width).slice(0, 2) }}</span>
        <span>CC</span>
      </span>
    </footer>
  </article>
</template>

<style scoped>
.share-artwork {
  container-type: inline-size;
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  background: var(--share-bg);
  color: var(--share-ink);
  font-family:
    -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif;
  -webkit-font-smoothing: antialiased;
}

.share-artwork::after {
  position: absolute;
  inset: 2.8cqw;
  z-index: -1;
  border: 1px solid var(--share-border);
  content: '';
  pointer-events: none;
}

.share-artwork__pattern {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle at center,
    var(--share-pattern) 0.9px,
    transparent 1px
  );
  background-size: 2.3cqw 2.3cqw;
  opacity: 0.9;
  pointer-events: none;
}

.share-artwork__glow {
  position: absolute;
  z-index: -1;
  width: 60cqw;
  height: 60cqw;
  border: 1px solid var(--share-border);
  border-radius: 9999px;
  opacity: 0.5;
  pointer-events: none;
}

.share-artwork__glow::before,
.share-artwork__glow::after {
  position: absolute;
  border: 1px solid var(--share-border);
  border-radius: inherit;
  content: '';
}

.share-artwork__glow::before {
  inset: 11%;
}

.share-artwork__glow::after {
  inset: 24%;
}

.is-square .share-artwork__glow,
.is-portrait .share-artwork__glow {
  top: -25cqw;
  right: -21cqw;
}

.is-landscape .share-artwork__glow {
  top: -38cqw;
  right: -1cqw;
}

.share-artwork__header,
.share-artwork__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4cqw;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  text-transform: uppercase;
}

.share-artwork__header {
  padding: 7.2cqw 8cqw 0;
}

.share-artwork__brand {
  display: inline-flex;
  align-items: center;
  gap: 1.2cqw;
  color: var(--share-accent);
  font-size: 1.08cqw;
  font-weight: 650;
  letter-spacing: 0.24em;
}

.share-artwork__brand-dot {
  width: 0.9cqw;
  height: 0.9cqw;
  border-radius: 9999px;
  background: var(--share-accent);
  box-shadow: 0 0 0 0.65cqw
    color-mix(in srgb, var(--share-accent) 11%, transparent);
}

.share-artwork__date {
  color: var(--share-muted);
  font-size: 1cqw;
  letter-spacing: 0.1em;
  white-space: nowrap;
}

.share-artwork__main {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 4cqw;
  padding: 0 8cqw;
}

.share-artwork__story {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.share-artwork__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 1cqw;
  margin-top: 9cqw;
}

.is-landscape .share-artwork__tags {
  margin-top: 5cqw;
}

.share-artwork__tag {
  max-width: 36cqw;
  overflow: hidden;
  border: 1px solid var(--share-border);
  border-radius: 9999px;
  background: var(--share-tag-bg);
  padding: 0.85cqw 1.35cqw;
  color: var(--share-tag-ink);
  font-size: 1.05cqw;
  font-weight: 560;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-artwork__tag.is-more {
  color: var(--share-muted);
}

.share-artwork__title {
  display: -webkit-box;
  max-width: 88%;
  margin: 5cqw 0 0;
  overflow: hidden;
  color: var(--share-ink);
  font-family:
    'Iowan Old Style', 'Songti SC', 'Noto Serif SC', 'STSong', Georgia, serif;
  font-size: 7.4cqw;
  font-weight: 520;
  letter-spacing: -0.045em;
  line-height: 1.2;
  overflow-wrap: anywhere;
  text-wrap: balance;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.is-landscape .share-artwork__title {
  max-width: 78%;
  margin-top: 3cqw;
  font-size: 5.7cqw;
  -webkit-line-clamp: 2;
}

.share-artwork__rule {
  width: 12cqw;
  height: 1px;
  flex: none;
  margin-top: 5cqw;
  background: var(--share-accent);
  opacity: 0.66;
}

.is-landscape .share-artwork__rule {
  margin-top: 3cqw;
}

.share-artwork__body {
  min-height: 0;
  max-height: 15cqw;
  margin-top: 4.2cqw;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 0%, #000 84%, transparent 100%);
}

.is-portrait .share-artwork__body {
  max-height: 23cqw;
}

.is-landscape .share-artwork__body {
  max-height: 21cqw;
  margin-top: 2.8cqw;
}

.share-artwork__line {
  margin: 0;
  color: var(--share-muted);
  font-size: 2.05cqw;
  font-weight: 430;
  letter-spacing: 0.01em;
  line-height: 1.95;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.is-portrait .share-artwork__line {
  font-size: 2.25cqw;
}

.is-landscape .share-artwork__line {
  font-size: 1.6cqw;
  line-height: 1.9;
}

.share-artwork__line + .share-artwork__line {
  margin-top: 0.5cqw;
}

.share-artwork__highlights {
  flex: none;
  border-top: 1px solid var(--share-border);
  padding-top: 2.4cqw;
}

.share-artwork__highlights-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--share-watermark);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.82cqw;
  letter-spacing: 0.17em;
}

.share-artwork__highlight-list {
  display: flex;
  flex-direction: column;
  gap: 1.65cqw;
  margin: 2.2cqw 0 0;
  padding: 0;
  list-style: none;
}

.share-artwork__highlight {
  display: flex;
  align-items: flex-start;
  gap: 1.5cqw;
}

.share-artwork__highlight-order {
  display: inline-flex;
  width: 3cqw;
  height: 3cqw;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--share-border);
  border-radius: 0.8cqw;
  color: var(--share-muted);
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 0.76cqw;
  letter-spacing: 0.04em;
}

.share-artwork__highlight-copy {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--share-muted);
  font-size: 1.5cqw;
  line-height: 1.65;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.share-artwork__highlight-copy strong {
  color: var(--share-ink);
  font-weight: 610;
}

.share-artwork__highlight-slash {
  margin: 0 0.65cqw;
  color: var(--share-accent);
  opacity: 0.55;
}

.is-landscape .share-artwork__main {
  display: grid;
  grid-template-columns: minmax(0, 1.14fr) minmax(0, 0.86fr);
  align-items: stretch;
  gap: 5.5cqw;
}

.is-landscape .share-artwork__highlights {
  align-self: end;
  padding-top: 2.2cqw;
}

.is-landscape .share-artwork__highlight-list {
  gap: 1.5cqw;
  margin-top: 2cqw;
}

.is-landscape .share-artwork__highlight-copy {
  font-size: 1.25cqw;
}

.share-artwork__footer {
  flex: none;
  padding: 4cqw 8cqw 6.8cqw;
}

.share-artwork__watermark {
  color: var(--share-watermark);
  font-size: 0.95cqw;
  letter-spacing: 0.09em;
}

.share-artwork__mark {
  display: inline-flex;
  align-items: center;
  gap: 1.1cqw;
  color: var(--share-accent);
  font-size: 0.9cqw;
  letter-spacing: 0.16em;
}

.share-artwork__mark span:first-child {
  color: var(--share-muted);
}

.share-artwork__mark span:last-child {
  display: inline-flex;
  width: 3.3cqw;
  height: 3.3cqw;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--share-border);
  border-radius: 9999px;
  font-size: 0.78cqw;
  letter-spacing: 0;
}
</style>

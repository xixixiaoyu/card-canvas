<script setup lang="ts">
import { computed } from 'vue'
import type { Card, CardHighlight } from '../../types'

const props = withDefaults(
  defineProps<{
    card: Card
    highlights: CardHighlight[]
    indexLabel?: string
  }>(),
  {
    indexLabel: 'CARD / 001',
  },
)

const titleId = computed(() => `card-title-${props.card.id}`)
const noteCountLabel = computed(
  () =>
    `${props.highlights.length.toString().padStart(2, '0')} ATOMIC NOTES`,
)

function tagTone(index: number) {
  return index % 2 === 0 ? 'tag-amber' : 'tag-sage'
}
</script>

<template>
  <article
    :aria-labelledby="titleId"
    class="note-card relative w-full overflow-hidden rounded-[26px] border border-stone-200/80 bg-white/95 shadow-note-light backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/80 dark:shadow-note-dark"
  >
    <!-- A hairline of light along the top edge keeps the paper feeling physical. -->
    <div
      class="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90 dark:via-white/20"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-24 -top-28 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(240,222,195,0.32),transparent_66%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(255,255,255,0.05),transparent_66%)]"
      aria-hidden="true"
    />

    <div class="card-body relative p-6 sm:p-9">
      <header class="flex items-start justify-between gap-4">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="(tag, index) in card.tags"
            :key="tag"
            class="tag-pill"
            :class="tagTone(index)"
          >
            #{{ tag }}
          </span>
        </div>

        <span
          class="card-index shrink-0 rounded-full border border-stone-200/70 bg-stone-50/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
        >
          {{ indexLabel }}
        </span>
      </header>

      <h1
        :id="titleId"
        class="card-title mt-7 font-serif text-[clamp(1.4rem,6vw,1.65rem)] font-medium leading-[1.36] tracking-[-0.02em] text-stone-900 sm:text-[1.95rem] dark:text-zinc-100"
      >
        {{ card.title }}
      </h1>

      <p
        class="card-content mt-3.5 text-[0.875rem] leading-[1.9] text-stone-600 sm:text-[0.9375rem] dark:text-zinc-400"
      >
        {{ card.content }}
      </p>

      <div
        class="card-divider my-6 h-px w-full bg-gradient-to-r from-stone-200/90 via-stone-200/60 to-transparent dark:from-white/10 dark:via-white/[0.06]"
        aria-hidden="true"
      />

      <ul
        class="card-highlights flex flex-col gap-4"
        aria-label="原子化重点"
      >
        <li
          v-for="highlight in highlights"
          :key="highlight.order"
          class="card-highlight flex items-start gap-3.5"
        >
          <span
            class="card-highlight-icon mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-stone-200/80 bg-stone-50/80 font-mono text-[9px] tracking-[0.06em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
          >
            {{ highlight.order }}
          </span>
          <p
            class="card-highlight-text text-[0.8125rem] leading-6 text-stone-600 sm:text-sm dark:text-zinc-400"
          >
            <span
              class="font-medium text-stone-800 dark:text-zinc-200"
            >{{ highlight.label }}</span>
            <span
              class="mx-1.5 text-stone-300 dark:text-zinc-700"
              aria-hidden="true"
            >/</span>
            <span>{{ highlight.text }}</span>
          </p>
        </li>
      </ul>

      <footer
        class="card-footer mt-7 flex items-center justify-between gap-4 border-t border-stone-200/70 pt-4 dark:border-white/[0.08]"
      >
        <div
          class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
        >
          <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span
              class="absolute inset-0 rounded-full bg-emerald-500/25 blur-[3px]"
            />
            <span
              class="relative h-1.5 w-1.5 rounded-full bg-emerald-500/80"
            />
          </span>
          <span>本地草稿 · 已保存</span>
        </div>
        <span
          class="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
        >
          {{ noteCountLabel }}
        </span>
      </footer>
    </div>
  </article>
</template>

<style scoped>
@media (max-width: 420px) {
  .card-index {
    display: none;
  }
}

@media (max-height: 720px) and (max-width: 640px) {
  .card-body {
    padding: 1.25rem;
  }

  .card-title {
    margin-top: 1.1rem;
    font-size: 1.35rem;
  }

  .card-content {
    margin-top: 0.6rem;
    font-size: 0.8125rem;
    line-height: 1.7;
  }

  .card-divider {
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  .card-highlights {
    gap: 0.625rem;
  }

  .card-highlight {
    gap: 0.75rem;
  }

  .card-highlight-icon {
    width: 1.35rem;
    height: 1.35rem;
  }

  .card-highlight-text {
    font-size: 0.75rem;
    line-height: 1.45rem;
  }

  .card-footer {
    margin-top: 1rem;
    padding-top: 0.75rem;
  }
}

@media (max-width: 340px) {
  .card-title {
    font-size: 1.2rem;
    letter-spacing: -0.03em;
  }
}

@media (max-height: 620px) and (max-width: 380px) {
  .card-footer {
    display: none;
  }
}
</style>

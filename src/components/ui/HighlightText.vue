<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  text: string
  query: string
}>()

interface Segment {
  text: string
  match: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const segments = computed<Segment[]>(() => {
  const query = props.query.trim()
  if (!query) return [{ text: props.text, match: false }]

  const matcher = new RegExp(`(${escapeRegExp(query)})`, 'gi')
  const parts = props.text.split(matcher)

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      match: part.toLowerCase() === query.toLowerCase(),
    }))
})
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <mark
      v-if="segment.match"
      class="rounded-[3px] bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-300/25"
    >
      {{ segment.text }}
    </mark>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>

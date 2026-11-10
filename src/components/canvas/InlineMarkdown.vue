<script setup lang="ts">
import type { InlineNode } from '../../lib/atomic-markdown'

defineOptions({ name: 'InlineMarkdown' })

defineProps<{
  nodes: InlineNode[]
}>()
</script>

<template>
  <template v-for="(node, index) in nodes" :key="`${node.type}-${index}`">
    <template v-if="node.type === 'text'">{{ node.value }}</template>
    <code v-else-if="node.type === 'code'" class="inline-code">{{
      node.value
    }}</code>
    <mark v-else-if="node.type === 'highlight'" class="inline-highlight">
      <InlineMarkdown v-if="node.children?.length" :nodes="node.children" />
      <template v-else>{{ node.value }}</template>
    </mark>
    <strong v-else-if="node.type === 'strong'">
      <InlineMarkdown v-if="node.children?.length" :nodes="node.children" />
      <template v-else>{{ node.value }}</template>
    </strong>
    <em v-else>
      <InlineMarkdown v-if="node.children?.length" :nodes="node.children" />
      <template v-else>{{ node.value }}</template>
    </em>
  </template>
</template>

<style scoped>
.inline-code {
  border-radius: 0.3rem;
  background: rgba(231, 229, 224, 0.72);
  padding: 0.08rem 0.3rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.88em;
  color: rgb(68 64 60);
}

.inline-highlight {
  border-radius: 0.24rem;
  background: rgba(253, 230, 138, 0.45);
  padding: 0 0.12rem;
  color: inherit;
}

.dark .inline-code {
  background: rgba(39, 39, 42, 0.88);
  color: rgb(228 228 231);
}

.dark .inline-highlight {
  background: rgba(147, 197, 253, 0.16);
}
</style>

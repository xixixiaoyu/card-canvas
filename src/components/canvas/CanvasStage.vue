<script setup lang="ts">
/**
 * Phase-one canvas shell.
 *
 * It owns the full-screen paper surface and the themed dot grid. Panning,
 * zooming and node transforms will be layered on top in a later phase.
 */
</script>

<template>
  <section class="canvas-stage">
    <div class="canvas-dots absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-light absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-dark absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-noise absolute inset-0 z-0" aria-hidden="true" />

    <div class="relative z-10 h-full w-full">
      <slot />
    </div>
  </section>
</template>

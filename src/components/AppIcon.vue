<script setup lang="ts">
defineProps<{ name: 'arrow' | 'check' | 'close' | 'globe' | 'spark' | 'refresh' | 'info' | 'flag' | 'book' }>()

const paths = {
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  globe: 'M3 12h18M5 6h14M5 18h14M12 2c6 5 6 15 0 20-6-5-6-15 0-20Z',
  spark: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 6.1a8 8 0 0 1 13 3M4.9 14.9a8 8 0 0 0 13 3',
  info: 'M12 11v6M12 7v.01',
  flag: 'M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0',
  book: 'M12 5v16M3 3l9 2 9-2v16l-9 2-9-2V3Z',
}
</script>

<template>
  <svg class="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle v-if="name === 'globe' || name === 'info'" cx="12" cy="12" r="10" />
    <path :d="paths[name]" />
  </svg>
</template>

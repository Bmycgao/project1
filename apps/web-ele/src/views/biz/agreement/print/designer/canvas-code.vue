<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  options: Record<string, any>;
  value: string;
}>();
const src = ref('');
const error = ref('');
let generation = 0;
watch(
  [
    () => props.value,
    () => props.options.textType,
    () => props.options.barcodeMode,
    () => props.options.qrcodeLevel,
  ],
  async () => {
    const version = ++generation;
    src.value = '';
    error.value = '';
    if (!props.value) {
      error.value = '内容为空，请绑定有值的字段';
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      if (props.options.textType === 'qrcode') {
        const { default: bwip } = await import('bwip-js');
        if (version !== generation) return;
        bwip.toCanvas(canvas, {
          bcid: 'qrcode',
          text: props.value,
          scale: 4,
          padding: 4,
          eclevel:
            ({ 0: 'M', 1: 'L', 2: 'H', 3: 'Q' } as const)[
              Number(props.options.qrcodeLevel) as 0 | 1 | 2 | 3
            ] || 'L',
          backgroundcolor: 'FFFFFF',
        });
      } else {
        const { default: barcode } = await import('jsbarcode');
        if (version !== generation) return;
        barcode(canvas, props.value, {
          format: props.options.barcodeMode || 'CODE128',
          displayValue: false,
          width: 2,
          height: 80,
          margin: 10,
        });
      }
      if (version === generation) src.value = canvas.toDataURL('image/png');
    } catch {
      if (version === generation)
        error.value = '无法生成码图，请检查内容与编码格式';
    }
  },
  { immediate: true },
);
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="options.textType === 'qrcode' ? '二维码' : '条形码'"
    :draggable="false"
    class="canvas-code"
  />
  <div v-else class="canvas-code-error" role="status">
    {{ error || '正在生成码图…' }}
  </div>
</template>

<style scoped>
.canvas-code {
  width: 100%;
  height: 100%;
  pointer-events: none;
  object-fit: contain;
}

.canvas-code-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 4px;
  font-size: 11px;
  color: #b45309;
  background: #fffbeb;
}
</style>

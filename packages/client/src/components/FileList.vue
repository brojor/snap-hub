<template>
    <div>
        <h1 class="text-blue-500">File List</h1>
        <pre>{{ files }}</pre>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const files = ref<any[]>([]);

onMounted(async () => {
    const response = await fetch('/api/files');
    const data = await response.json();
    files.value = data.files;
});
</script>
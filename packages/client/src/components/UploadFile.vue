<template>
  <button @click="selectFromGallery">Upload File</button>
</template>

<script setup lang="ts">
const selectFromGallery = async () => {
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/jpeg,image/png,image/heic,image/heif'

    input.onchange = async (event) => {
      const target = event.target as HTMLInputElement
      if (!target.files || target.files.length === 0) return
      const file = target.files[0]  
      await uploadFiles(file)
    }
    input.click()
  } catch (error) {
    console.error('Chyba při výběru souboru:', error)
  }
}

const uploadFiles = async (file: File) => {
  try {
    const formData = new FormData()
    formData.append('file', file)
    
    const presignResponse = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    })
      
      if (!presignResponse.ok) {
        console.log(await presignResponse.text())
        throw new Error('Failed to get presigned URL')
      }
    alert('Fotka byla úspěšně odeslána!')
  } catch (error) {
    console.error('Chyba při uploadu:', error)
    alert('Nepodařilo se odeslat fotku. Zkuste to prosím znovu.')
  }
}

</script>
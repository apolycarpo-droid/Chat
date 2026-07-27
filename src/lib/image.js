// Comprime a foto no aparelho antes do upload (economiza o 1 GB grátis do Supabase).
export function compressImage(file, maxSize = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('falha ao comprimir'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}
